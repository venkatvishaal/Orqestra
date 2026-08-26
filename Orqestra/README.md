# Orqestra ⚡

A robust, production-inspired distributed job scheduling platform capable of reliably executing asynchronous background jobs across multiple workers.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Repository Structure](#2-repository-structure)
3. [Database Design](#3-database-design)
4. [Backend Engineering](#4-backend-engineering)
5. [API Documentation](#5-api-documentation)
6. [Reliability & Concurrency](#6-reliability--concurrency)
7. [Frontend & UX](#7-frontend--ux)
8. [Design Decisions & Trade-Offs](#8-design-decisions--trade-offs)
9. [Testing](#9-testing)
10. [Setup & Running Instructions](#10-setup--running-instructions)
11. [Bonus Features](#11-bonus-features)

---

## 1. System Architecture

Orqestra follows a **modular monorepo** design with clear separation of concerns across three independently deployable services:

```mermaid
graph TD
    Client["Client / REST API Integrator"] -->|Submit Job| API["NestJS API Gateway :3001"]
    Dashboard["Next.js Dashboard :3000"] -->|Observe / Control| API
    API -->|Read / Write State| DB[("PostgreSQL (Supabase)")]
    API -->|Cache stats & Pub/Sub| Cache[("Redis (Upstash)")]
    WorkerPool["Worker Fleet (NestJS)"] -->|Heartbeat TTL| Cache
    WorkerPool -->|Atomic claim via SELECT...FOR UPDATE SKIP LOCKED| DB
    WorkerPool -->|Execute job via HTTP POST| ExternalAPI["External Webhook Handler"]
    API -->|Live state changes| WS["WebSocket Gateway /events"]
    WS -->|Push updates| Dashboard
```

### Service Breakdown

| Service | Technology | Port | Responsibility |
|---------|-----------|------|---------------|
| **API Gateway** | NestJS + TypeORM + Socket.IO | `3001` | REST API, authentication, job CRUD, queue management, WebSocket events, cron materializer |
| **Worker Service** | NestJS (standalone) | — | Queue polling, atomic job claiming, concurrent execution, heartbeat emission, graceful shutdown |
| **Web Dashboard** | Next.js 14 (App Router) | `3000` | Real-time monitoring, job explorer, queue configuration, worker health, DLQ management |

### Communication Patterns

| Pattern | Implementation |
|---------|---------------|
| **API → DB** | TypeORM repositories with transactional entity manager |
| **Worker → DB** | Raw SQL via `SELECT ... FOR UPDATE SKIP LOCKED` for atomic claims |
| **Worker → Redis** | `SETEX` heartbeat keys with TTL-based liveness detection |
| **API → Dashboard** | WebSocket (Socket.IO) namespace `/events` for real-time push |
| **API → Redis** | Cached queue stats with 5-second TTL |
| **Worker → External** | HTTP POST to `handler_url` with job payload (webhook pattern) |

---

## 2. Repository Structure

```
Orqestra/
├── apps/
│   ├── api/                          # NestJS REST & WebSocket API Gateway
│   │   ├── src/
│   │   │   ├── auth/                 # JWT auth, API key auth, guards, strategies
│   │   │   │   ├── guards/           # JwtAuthGuard, ApiKeyGuard
│   │   │   │   ├── strategies/       # JWT strategy, API key strategy
│   │   │   │   └── dto/              # RegisterDto, LoginDto, RefreshDto
│   │   │   ├── users/                # User entity & module
│   │   │   ├── organizations/        # Organization, OrganizationMember entities
│   │   │   ├── projects/             # Project, ApiKey entities
│   │   │   ├── queues/               # Queue, RetryPolicy entities & CRUD
│   │   │   ├── jobs/                 # Job, JobExecution, JobLog, ScheduledJob, BatchJob
│   │   │   │   ├── entities/         # 5 entities covering the complete job lifecycle
│   │   │   │   ├── dto/              # CreateJobDto, ListJobsDto (validated)
│   │   │   │   ├── job-claim.service.ts  # Atomic claiming logic
│   │   │   │   └── jobs.service.ts   # Full job lifecycle management
│   │   │   ├── workers/              # Worker, WorkerHeartbeat entities
│   │   │   ├── dlq/                  # Dead Letter Queue entity & CRUD
│   │   │   ├── events/               # WebSocket gateway (Socket.IO)
│   │   │   ├── scheduler/            # Cron-based stale job recovery
│   │   │   ├── redis/                # Redis module (ioredis provider)
│   │   │   ├── database/             # TypeORM config, seed service
│   │   │   ├── app.module.ts         # Root module wiring
│   │   │   └── main.ts               # Bootstrap with Swagger, CORS, validation
│   │   ├── .env                      # Database, Redis, JWT secrets
│   │   └── package.json
│   │
│   ├── worker/                       # Standalone NestJS Worker Service
│   │   ├── src/
│   │   │   ├── poller/               # PollerService — poll loop, claim, execute
│   │   │   ├── heartbeat/            # HeartbeatService — Redis TTL + DB heartbeats
│   │   │   ├── worker-app.module.ts  # Worker root module
│   │   │   └── main.ts               # Worker bootstrap
│   │   ├── .env                      # Worker-specific config
│   │   └── package.json
│   │
│   └── web/                          # Next.js 14 Dashboard
│       ├── app/
│       │   ├── dashboard/            # Overview metrics page
│       │   ├── queues/               # Queue list + detail pages
│       │   ├── jobs/                 # Job explorer + detail pages
│       │   ├── workers/              # Worker fleet monitoring
│       │   ├── dlq/                  # Dead Letter Queue viewer
│       │   ├── login/                # Authentication page
│       │   └── layout.tsx            # Root layout with sidebar navigation
│       ├── components/               # Reusable React components
│       ├── hooks/                    # Custom React hooks
│       └── lib/                      # API client utilities
│
├── package.json                      # Workspace-level scripts
├── pnpm-workspace.yaml               # pnpm workspace definition
└── README.md
```

---

## 3. Database Design

### 3.1 Entity-Relationship Diagram

```mermaid
erDiagram
    USERS ||--o{ ORGANIZATION_MEMBERS : "has memberships"
    ORGANIZATIONS ||--o{ ORGANIZATION_MEMBERS : "has members"
    ORGANIZATIONS ||--o{ PROJECTS : "owns"
    PROJECTS ||--o{ API_KEYS : "has keys"
    PROJECTS ||--o{ QUEUES : "has queues"
    QUEUES ||--|| RETRY_POLICIES : "has policy"
    QUEUES ||--o{ JOBS : "contains"
    QUEUES ||--o{ SCHEDULED_JOBS : "has schedules"
    JOBS ||--o{ JOB_EXECUTIONS : "has executions"
    JOBS ||--o| DEAD_LETTER_ENTRIES : "may be in DLQ"
    JOBS }o--o| BATCH_JOBS : "belongs to batch"
    JOB_EXECUTIONS ||--o{ JOB_LOGS : "has logs"
    JOB_EXECUTIONS }o--o| WORKERS : "executed by"
    WORKERS ||--o{ WORKER_HEARTBEATS : "sends heartbeats"
```

### 3.2 Table Definitions

#### `users`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK, auto-generated | Unique user identifier |
| `email` | `VARCHAR` | UNIQUE, NOT NULL | Login email address |
| `password_hash` | `VARCHAR` | NOT NULL | bcrypt hash (12 salt rounds) |
| `refresh_token_hash` | `VARCHAR` | NULLABLE | Hashed JWT refresh token for rotation |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Account creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, auto-updated | Last modification timestamp |

#### `organizations`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | Organization identifier |
| `name` | `VARCHAR` | NOT NULL | Display name |
| `owner_id` | `UUID` | FK → `users.id`, ON DELETE RESTRICT | Prevents deleting a user who owns orgs |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | — |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | — |

#### `organization_members`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | Membership record |
| `org_id` | `UUID` | FK → `organizations.id`, ON DELETE CASCADE | — |
| `user_id` | `UUID` | FK → `users.id`, ON DELETE CASCADE | — |
| `role` | `ENUM('owner','admin','member')` | DEFAULT `'member'` | RBAC role within the organization |
| `joined_at` | `TIMESTAMPTZ` | NOT NULL | When the user joined |

#### `projects`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | Project identifier |
| `name` | `VARCHAR` | NOT NULL | Project display name |
| `org_id` | `UUID` | FK → `organizations.id`, ON DELETE CASCADE | Owning organization |
| `description` | `TEXT` | NULLABLE | Optional description |
| `is_deleted` | `BOOLEAN` | DEFAULT `false` | Soft-delete flag |
| `created_at` | `TIMESTAMPTZ` | — | — |
| `updated_at` | `TIMESTAMPTZ` | — | — |

#### `api_keys`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | Key record |
| `project_id` | `UUID` | FK → `projects.id`, ON DELETE CASCADE | — |
| `key_hash` | `VARCHAR` | NOT NULL | bcrypt hash of the raw API key |
| `name` | `VARCHAR` | NULLABLE | Human-readable label |
| `is_revoked` | `BOOLEAN` | DEFAULT `false` | Revocation flag |
| `last_used_at` | `TIMESTAMPTZ` | NULLABLE | Last authentication timestamp |
| `created_at` | `TIMESTAMPTZ` | — | — |

#### `queues`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | Queue identifier |
| `project_id` | `UUID` | FK → `projects.id`, ON DELETE CASCADE | Owning project |
| `name` | `VARCHAR` | NOT NULL | Queue display name |
| `concurrency_limit` | `INT` | DEFAULT `5` | Max concurrent jobs per worker |
| `priority` | `INT` | DEFAULT `5` | Queue-level priority (1=LOW, 5=NORMAL, 10=HIGH, 20=CRITICAL) |
| `is_paused` | `BOOLEAN` | DEFAULT `false` | Pause flag — stops new claims |
| `rate_limit_per_sec` | `INT` | NULLABLE | Optional rate-limiting cap |
| `description` | `TEXT` | NULLABLE | — |
| `created_at` | `TIMESTAMPTZ` | — | — |
| `updated_at` | `TIMESTAMPTZ` | — | — |

**Index**: `UNIQUE(project_id, name)` — prevents duplicate queue names within a project.

#### `retry_policies`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | Policy record |
| `queue_id` | `UUID` | FK → `queues.id`, UNIQUE, ON DELETE CASCADE | 1:1 with queue |
| `strategy` | `ENUM('fixed','linear','exponential')` | DEFAULT `'exponential'` | Backoff strategy |
| `base_delay_ms` | `INT` | DEFAULT `2000` | Base delay in milliseconds |
| `max_attempts` | `INT` | DEFAULT `3` | Maximum retry attempts |
| `max_delay_ms` | `INT` | DEFAULT `86400000` | Delay cap (24h) to prevent infinite exponential growth |
| `created_at` | `TIMESTAMPTZ` | — | — |
| `updated_at` | `TIMESTAMPTZ` | — | — |

**Backoff Formulas** (implemented in [`RetryPolicy.calculateDelay()`](file:///c:/TSVV/Codity.Ai/Orqestra/apps/api/src/queues/entities/retry-policy.entity.ts#L63-L78)):
- **Fixed**: `delay = baseDelayMs`
- **Linear**: `delay = baseDelayMs × attempt`
- **Exponential**: `delay = baseDelayMs × 2^(attempt-1)`
- All capped at `min(delay, maxDelayMs)`

#### `jobs`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | Job identifier |
| `queue_id` | `UUID` | FK → `queues.id`, ON DELETE CASCADE | Parent queue |
| `type` | `ENUM('immediate','delayed','scheduled','cron','batch')` | NOT NULL | Job scheduling type |
| `status` | `ENUM('queued','scheduled','claimed','running','completed','failed','cancelled','dlq')` | DEFAULT `'queued'` | Current lifecycle state |
| `payload` | `JSONB` | DEFAULT `{}` | Arbitrary JSON payload (opaque to Orqestra) |
| `handler_url` | `VARCHAR` | NULLABLE | External webhook URL for execution |
| `idempotency_key` | `VARCHAR` | NULLABLE | Deduplication key |
| `priority` | `INT` | DEFAULT `0` | Job-level priority (higher = executed first) |
| `run_at` | `TIMESTAMPTZ` | DEFAULT `NOW()` | When the job should become eligible for claiming |
| `attempts` | `INT` | DEFAULT `0` | Current attempt count |
| `max_attempts` | `INT` | NULLABLE | Override for queue-level max attempts |
| `cron_expression` | `VARCHAR` | NULLABLE | For cron-type jobs |
| `batch_id` | `VARCHAR` | NULLABLE | Parent batch reference |
| `worker_id` | `VARCHAR` | NULLABLE | Currently-assigned worker |
| `claimed_at` | `TIMESTAMPTZ` | NULLABLE | When the job was claimed |
| `created_at` | `TIMESTAMPTZ` | — | — |
| `updated_at` | `TIMESTAMPTZ` | — | — |

**Indexes**:
- `INDEX(queue_id, status, run_at)` — **critical** for the atomic claim query performance
- `UNIQUE(queue_id, idempotency_key) WHERE idempotency_key IS NOT NULL` — partial unique index for deduplication

#### `job_executions`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | Execution record |
| `job_id` | `UUID` | FK → `jobs.id`, ON DELETE CASCADE | Parent job |
| `worker_id` | `VARCHAR` | FK → `workers.id`, ON DELETE SET NULL | Executing worker |
| `attempt_number` | `INT` | NOT NULL | 1-indexed attempt number |
| `status` | `ENUM('running','completed','failed')` | DEFAULT `'running'` | Execution outcome |
| `result` | `JSONB` | NULLABLE | Success response payload |
| `error_message` | `TEXT` | NULLABLE | Error description on failure |
| `error_stack` | `TEXT` | NULLABLE | Stack trace on failure |
| `started_at` | `TIMESTAMPTZ` | NOT NULL | Execution start time |
| `finished_at` | `TIMESTAMPTZ` | NULLABLE | Execution end time |
| `duration_ms` | `INT` | NULLABLE | Computed execution duration |
| `created_at` | `TIMESTAMPTZ` | — | — |

#### `job_logs`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | Log entry |
| `job_execution_id` | `UUID` | FK → `job_executions.id`, ON DELETE CASCADE | Parent execution |
| `timestamp` | `TIMESTAMPTZ` | NOT NULL | Log timestamp |
| `level` | `ENUM('debug','info','warn','error')` | DEFAULT `'info'` | Log severity |
| `message` | `TEXT` | NOT NULL | Log content |

**Index**: `INDEX(job_execution_id, timestamp)` — enables efficient chronological log retrieval.

#### `scheduled_jobs`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | Schedule record |
| `queue_id` | `UUID` | FK → `queues.id`, ON DELETE CASCADE | Target queue |
| `cron_expression` | `VARCHAR` | NOT NULL | Standard cron expression |
| `job_template` | `JSONB` | NOT NULL | Template: `{ payload, handlerUrl, priority, maxAttempts }` |
| `next_run_at` | `TIMESTAMPTZ` | NOT NULL | Computed next materialization time |
| `last_materialized_job_id` | `VARCHAR` | NULLABLE | Reference to last spawned job |
| `is_active` | `BOOLEAN` | DEFAULT `true` | Active/paused toggle |
| `created_at` | `TIMESTAMPTZ` | — | — |
| `updated_at` | `TIMESTAMPTZ` | — | — |

#### `batch_jobs`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | Batch identifier |
| `queue_id` | `UUID` | FK → `queues.id`, ON DELETE CASCADE | Target queue |
| `name` | `VARCHAR` | NULLABLE | Human-readable batch name |
| `total_jobs` | `INT` | NOT NULL | Total items in batch |
| `completed_jobs` | `INT` | DEFAULT `0` | Count of completed items |
| `failed_jobs` | `INT` | DEFAULT `0` | Count of failed items |
| `pending_jobs` | `INT` | DEFAULT `0` | Count of pending items |
| `created_at` | `TIMESTAMPTZ` | — | — |
| `updated_at` | `TIMESTAMPTZ` | — | — |

#### `dead_letter_entries`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | DLQ entry |
| `job_id` | `UUID` | FK → `jobs.id`, UNIQUE, ON DELETE CASCADE | One DLQ entry per job |
| `queue_id` | `UUID` | NOT NULL | Source queue reference |
| `reason` | `TEXT` | NOT NULL | Why the job was moved to DLQ |
| `final_error` | `TEXT` | NULLABLE | Last error message before parking |
| `total_attempts` | `INT` | NOT NULL | Total attempts exhausted |
| `is_requeued` | `BOOLEAN` | DEFAULT `false` | Whether the job was requeued |
| `requeued_at` | `TIMESTAMPTZ` | NULLABLE | Requeue timestamp |
| `moved_at` | `TIMESTAMPTZ` | DEFAULT NOW() | When moved to DLQ |

#### `workers`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | Worker identifier |
| `hostname` | `VARCHAR` | NOT NULL | Machine hostname |
| `process_id` | `INT` | NULLABLE | OS PID |
| `status` | `ENUM('healthy','unhealthy','draining','offline')` | DEFAULT `'healthy'` | Health state |
| `last_heartbeat_at` | `TIMESTAMPTZ` | NULLABLE | Last heartbeat timestamp |
| `current_job_count` | `INT` | DEFAULT `0` | Active in-flight jobs |
| `max_concurrency` | `INT` | DEFAULT `5` | Configured concurrency limit |
| `queue_ids` | `TEXT` (simple-array) | NULLABLE | Queues this worker polls |
| `created_at` | `TIMESTAMPTZ` | — | — |
| `updated_at` | `TIMESTAMPTZ` | — | — |

#### `worker_heartbeats`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK | Heartbeat record |
| `worker_id` | `UUID` | FK → `workers.id`, ON DELETE CASCADE | Source worker |
| `timestamp` | `TIMESTAMPTZ` | NOT NULL | When the heartbeat was sent |
| `current_job_count` | `INT` | DEFAULT `0` | Jobs active at heartbeat time |
| `cpu_percent` | `FLOAT` | NULLABLE | CPU utilization snapshot |
| `mem_mb` | `FLOAT` | NULLABLE | Memory utilization snapshot |

**Index**: `INDEX(worker_id, timestamp)` — for efficient heartbeat history queries.

### 3.3 Database Design Rationale

| Decision | Rationale |
|----------|-----------|
| **UUID primary keys** | Globally unique, safe for distributed generation, no coordination needed |
| **JSONB for `payload` and `job_template`** | Flexible, schema-less storage for arbitrary job data; PostgreSQL JSONB supports indexing |
| **Partial unique index on `idempotency_key`** | Only enforces uniqueness when the key is non-null, avoiding wasted index space |
| **Composite index `(queue_id, status, run_at)`** | Directly accelerates the `SELECT ... FOR UPDATE SKIP LOCKED` atomic claim query |
| **`ON DELETE CASCADE`** on all child FKs | Automatic cleanup when parent entities are removed |
| **`ON DELETE RESTRICT`** on org → user | Prevents accidental deletion of users who own organizations |
| **`ON DELETE SET NULL`** on execution → worker | Preserves execution history even if worker records are pruned |
| **Separate `retry_policies` table** | 1:1 with queues — allows updating retry strategy independently from queue config |
| **Separate `job_executions` table** | Full audit trail of every attempt per job (not just the last one) |
| **Separate `job_logs` table** | Granular, timestamped logs per execution for debugging and observability |
| **`TIMESTAMPTZ` everywhere** | Timezone-aware timestamps for correct behavior across distributed workers |

---

## 4. Backend Engineering

### 4.1 Authentication & Authorization

Orqestra implements **dual authentication**:

1. **JWT Bearer Tokens** — for dashboard users
   - Registration: `POST /api/auth/register` → returns `{ accessToken, refreshToken }`
   - Login: `POST /api/auth/login` → validates bcrypt password → issues JWT pair
   - Token refresh: `POST /api/auth/refresh` → rotates refresh token (hash stored in DB)
   - Logout: `POST /api/auth/logout` → invalidates refresh token hash
   - Access tokens expire in **15 minutes**; refresh tokens in **7 days**
   - Passwords hashed with bcrypt (12 salt rounds)

2. **API Key Authentication** — for programmatic integrators
   - Keys follow format `ak_{projectId}_{random_hex}`
   - Keys are bcrypt-hashed before storage (raw key shown once at generation)
   - `X-API-Key` header validated via Passport strategy
   - `last_used_at` updated on each successful authentication

### 4.2 Project & Organization Management

- **Organizations** group users via a membership table with roles (`owner`, `admin`, `member`)
- **Projects** belong to organizations and own multiple queues
- Each project can have multiple **API keys** (revokable) for service-to-service integration

### 4.3 Queue Configuration

Queues are fully configurable with:

| Feature | Implementation |
|---------|---------------|
| **Priority levels** | `LOW(1)`, `NORMAL(5)`, `HIGH(10)`, `CRITICAL(20)` enum |
| **Concurrency limit** | `concurrency_limit` column, enforced by worker during polling |
| **Retry policy** | Dedicated `retry_policies` table with strategy, base delay, max attempts, max delay cap |
| **Pause / Resume** | `is_paused` flag — paused queues are excluded from worker polling |
| **Rate limiting** | `rate_limit_per_sec` column (configurable per queue) |
| **Statistics** | Real-time computed stats (depth, in-flight, completed, failed, DLQ count, success rate) with 5-second Redis cache |

### 4.4 Job Types

| Type | Description | `run_at` Behavior |
|------|-------------|-------------------|
| **Immediate** | Execute ASAP | `NOW()` |
| **Delayed** | Execute after a specified delay | `NOW() + delayMs` |
| **Scheduled** | Execute at a specific ISO timestamp | Provided `runAt` value |
| **Cron** | Recurring on a cron expression | Materializer spawns job instances every minute |
| **Batch** | Group of jobs submitted atomically | Each item gets `NOW()`, tracked via `batch_jobs` aggregate |

### 4.5 Job Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> Queued: Job created (immediate/batch)
    [*] --> Scheduled: Job created (delayed/scheduled)
    Scheduled --> Queued: run_at reached
    Queued --> Claimed: Worker atomic claim
    Claimed --> Running: Execution starts
    Running --> Completed: Handler returns success
    Running --> Failed: Handler throws error
    Failed --> Scheduled: Retry (attempts < max)
    Failed --> DLQ: Max attempts exceeded
    Queued --> Cancelled: Manual cancellation
    Scheduled --> Cancelled: Manual cancellation
    DLQ --> Queued: Manual requeue
```

**Valid transitions enforced by the API**:
- Cancel: only from `QUEUED` or `SCHEDULED` → throws `ConflictException` otherwise
- Retry: only from `FAILED` or `DLQ` → resets attempts to 0, sets status to `QUEUED`

### 4.6 Cron Job Materializer

The API runs a `@Cron('* * * * *')` task (every minute) that:
1. Queries all active `scheduled_jobs` where `next_run_at <= NOW()`
2. For each due schedule, creates a concrete `Job` record in `QUEUED` status
3. Computes and updates the `next_run_at` using the `croner` library
4. Stores the `last_materialized_job_id` for auditing

### 4.7 Structured Logging

- **Pino** logger with `pino-pretty` in development mode
- Contextual logging with service/module names
- All job state transitions logged with job ID and metadata

### 4.8 Input Validation

All DTOs validated with `class-validator`:
- `whitelist: true` — strips unknown properties
- `forbidNonWhitelisted: true` — rejects requests with unknown fields
- `transform: true` — auto-converts query parameters to correct types
- Conditional validation (e.g., `cronExpression` required only when `type === 'cron'`)

### 4.9 Rate Limiting

Global rate limiting configured via `@nestjs/throttler`:
- **100 requests per 60 seconds** per client

---

## 5. API Documentation

Interactive Swagger UI available at: `http://localhost:3001/api/docs`

### 5.1 Auth Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/register` | None | Register a new user account |
| `POST` | `/api/auth/login` | None | Login and receive JWT token pair |
| `POST` | `/api/auth/refresh` | None | Refresh access token using refresh token |
| `POST` | `/api/auth/logout` | JWT | Invalidate refresh token |
| `GET` | `/api/auth/me` | JWT | Get current authenticated user |

### 5.2 Queue Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/queues` | JWT | Create a queue with retry policy |
| `GET` | `/api/queues?projectId=` | JWT | List all queues for a project |
| `GET` | `/api/queues/:id` | JWT | Get queue details with retry policy |
| `PATCH` | `/api/queues/:id` | JWT | Update queue configuration |
| `POST` | `/api/queues/:id/pause` | JWT | Pause a queue (stops new claims) |
| `POST` | `/api/queues/:id/resume` | JWT | Resume a paused queue |
| `GET` | `/api/queues/:id/stats` | JWT | Get real-time queue statistics |

**Example — Create Queue with Retry Policy**:
```json
POST /api/queues
{
  "projectId": "UUID",
  "name": "email-delivery",
  "concurrencyLimit": 2,
  "priority": 10,
  "description": "Transactional email queue",
  "retryPolicy": {
    "strategy": "linear",
    "baseDelayMs": 5000,
    "maxAttempts": 5,
    "maxDelayMs": 60000
  }
}
```

### 5.3 Job Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/jobs` | JWT | Create a job (immediate, delayed, scheduled, cron, or batch) |
| `GET` | `/api/jobs` | JWT | List jobs with filtering & pagination |
| `GET` | `/api/jobs/:id` | JWT | Get job details with execution history |
| `POST` | `/api/jobs/:id/cancel` | JWT | Cancel a queued or scheduled job |
| `POST` | `/api/jobs/:id/retry` | JWT | Manually retry a failed or DLQ job |
| `GET` | `/api/jobs/:id/executions/:executionId/logs` | JWT | Get logs for a specific execution |

**Filtering & Pagination** (`GET /api/jobs`):

| Query Param | Type | Description |
|-------------|------|-------------|
| `queueId` | UUID | Filter by queue |
| `status` | Enum | Filter by status |
| `type` | Enum | Filter by job type |
| `batchId` | UUID | Filter by batch |
| `dateFrom` | ISO date | Filter by created date (from) |
| `dateTo` | ISO date | Filter by created date (to) |
| `page` | Int | Page number (default: 1) |
| `limit` | Int | Items per page (default: 20) |

**Response format**:
```json
{
  "items": [...],
  "total": 142,
  "page": 1,
  "limit": 20,
  "pages": 8
}
```

**Example — Create Immediate Job**:
```json
POST /api/jobs
{
  "queueId": "UUID",
  "type": "immediate",
  "payload": { "userId": "u_123", "action": "sync_profile" },
  "handlerUrl": "https://api.example.com/webhooks/job",
  "idempotencyKey": "sync-u_123-v2",
  "priority": 5
}
```

**Example — Create Batch Job**:
```json
POST /api/jobs
{
  "queueId": "UUID",
  "type": "batch",
  "batchName": "Daily report generation",
  "batchItems": [
    { "payload": { "reportId": "r_001" } },
    { "payload": { "reportId": "r_002" }, "handlerUrl": "https://..." },
    { "payload": { "reportId": "r_003" } }
  ],
  "maxAttempts": 5
}
```

### 5.4 Worker Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/workers` | JWT | List all workers with health status |
| `GET` | `/api/workers/:id` | JWT | Get worker details |
| `GET` | `/api/workers/:id/heartbeats` | JWT | Get heartbeat history |
| `POST` | `/api/workers/register` | JWT | Register a new worker instance |
| `POST` | `/api/workers/:id/heartbeat` | JWT | Send worker heartbeat |
| `POST` | `/api/workers/:id/deregister` | JWT | Gracefully deregister a worker |

### 5.5 DLQ Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/dlq` | JWT | List DLQ entries (filterable by `queueId`, paginated) |
| `POST` | `/api/dlq/:id/requeue` | JWT | Requeue a DLQ entry (resets attempts to 0) |
| `DELETE` | `/api/dlq/:id` | JWT | Permanently delete a DLQ entry and its job |

### 5.6 WebSocket Events

**Namespace**: `ws://localhost:3001/events`

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `subscribe` | Client → Server | `{ projectId }` | Join a project room |
| `unsubscribe` | Client → Server | `{ projectId }` | Leave a project room |
| `job.created` | Server → Client | `{ event, data: Job, timestamp }` | New job created |
| `job.claimed` | Server → Client | `{ event, data: Job, timestamp }` | Job claimed by worker |
| `job.completed` | Server → Client | `{ event, data: Job, timestamp }` | Job completed |
| `job.failed` | Server → Client | `{ event, data: Job, timestamp }` | Job failed (will retry) |
| `job.dlq` | Server → Client | `{ event, data: Job, timestamp }` | Job moved to DLQ |
| `job.cancelled` | Server → Client | `{ event, data: Job, timestamp }` | Job cancelled |
| `job.retried` | Server → Client | `{ event, data: Job, timestamp }` | Job manually retried |
| `queue.paused` | Server → Client | `{ event, data: Queue, timestamp }` | Queue paused |
| `queue.resumed` | Server → Client | `{ event, data: Queue, timestamp }` | Queue resumed |
| `worker.heartbeat` | Server → Client | `{ event, data: Worker, timestamp }` | Worker heartbeat |
| `worker.unhealthy` | Server → Client | `{ event, data: Worker, timestamp }` | Worker missed heartbeats |
| `worker.offline` | Server → Client | `{ event, data: Worker, timestamp }` | Worker went offline |

### 5.7 Error Response Format

All errors return structured JSON:
```json
{
  "statusCode": 409,
  "message": "Cannot cancel job in status running. Only queued/scheduled jobs can be cancelled.",
  "error": "Conflict"
}
```

Common status codes:
- `400` Bad Request — validation failures
- `401` Unauthorized — missing/invalid JWT
- `403` Forbidden — invalid refresh token
- `404` Not Found — entity not found
- `409` Conflict — invalid state transition or duplicate resource

---

## 6. Reliability & Concurrency

### 6.1 Atomic Job Claiming (Zero Duplicate Execution)

The core of Orqestra's reliability guarantee is the **atomic claim query**, implemented in both [`JobClaimService`](file:///c:/TSVV/Codity.Ai/Orqestra/apps/api/src/jobs/job-claim.service.ts#L30-L92) and [`PollerService`](file:///c:/TSVV/Codity.Ai/Orqestra/apps/worker/src/poller/poller.service.ts#L116-L155):

```sql
UPDATE jobs
SET status = 'claimed', worker_id = $2, claimed_at = NOW(), updated_at = NOW()
WHERE id = (
    SELECT id FROM jobs
    WHERE queue_id = $3 AND status = 'queued' AND run_at <= NOW()
    ORDER BY priority DESC, run_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
RETURNING *
```

**Why this works**:
- `FOR UPDATE` — acquires a row-level exclusive lock on the candidate row
- `SKIP LOCKED` — if the row is already locked by another transaction, skip it and try the next one (no blocking)
- The entire SELECT + UPDATE is a single atomic statement within a transaction
- **Result**: even with 100 concurrent workers polling the same queue, each job is claimed by exactly one worker

### 6.2 Idempotency

- Optional `idempotency_key` per queue — if a job with the same key already exists in the queue, the existing job is returned instead of creating a duplicate
- Enforced via a **partial unique index**: `UNIQUE(queue_id, idempotency_key) WHERE idempotency_key IS NOT NULL`

### 6.3 Retry & Backoff

When a job execution fails:

1. Increment `attempts` counter
2. Check if `attempts >= maxAttempts`
   - **Yes** → Move to Dead Letter Queue (`status = 'dlq'`), create `dead_letter_entries` record
   - **No** → Compute retry delay using the queue's `RetryPolicy`, set `status = 'scheduled'`, `run_at = NOW() + delay`
3. Clear `worker_id` and `claimed_at` so the job becomes eligible for claiming again

**Configurable strategies**:
- **Fixed**: constant delay between retries
- **Linear**: linearly increasing delay (`base × attempt`)
- **Exponential**: doubling delay (`base × 2^(attempt-1)`) — with configurable `max_delay_ms` cap

### 6.4 Worker Heartbeats & Liveness

The [`HeartbeatService`](file:///c:/TSVV/Codity.Ai/Orqestra/apps/worker/src/heartbeat/heartbeat.service.ts) implements dual-channel heartbeats:

1. **Redis TTL keys** (`SETEX heartbeat:{workerId} {ttlSeconds} {timestamp}`)
   - If a heartbeat key expires, the API's scheduler module detects the worker as stale
   - Configurable via `HEARTBEAT_INTERVAL_MS` (default 5s) and `HEARTBEAT_TTL_MS` (default 15s)

2. **Database heartbeat records** — persisted for historical analysis and dashboard visualization
   - Includes `current_job_count`, optional `cpu_percent`, `mem_mb` metrics

### 6.5 Stale Job Recovery

The [`JobClaimService.reclaimStaleJobs()`](file:///c:/TSVV/Codity.Ai/Orqestra/apps/api/src/jobs/job-claim.service.ts#L98-L123) method:
- Takes a list of stale worker IDs (workers whose heartbeat TTL expired)
- Resets all `CLAIMED` and `RUNNING` jobs from those workers back to `QUEUED`
- Clears `worker_id` and `claimed_at` so jobs can be re-claimed

### 6.6 Graceful Shutdown

the [`PollerService.onModuleDestroy()`](file:///c:/TSVV/Codity.Ai/Orqestra/apps/worker/src/poller/poller.service.ts#L65-L90) method:
1. Sets `isShuttingDown = true` and clears the poll timer
2. Updates worker status to `DRAINING`
3. Waits for all in-flight jobs to complete (up to `DRAIN_TIMEOUT_MS`, default 30s)
4. If timeout is reached, returns remaining in-flight jobs to `QUEUED` status
5. Sets worker status to `OFFLINE`

### 6.7 Concurrency Limiting

- Each worker enforces `maxConcurrency` — will not claim new jobs if `activeJobs.size >= maxConcurrency`
- Each queue has a `concurrency_limit` that can be used to cap concurrent execution per queue
- Worker tracks `current_job_count` in real-time via heartbeats

---

## 7. Frontend & UX

The web dashboard is built with **Next.js 14** (App Router) and provides:

### 7.1 Pages

| Page | Route | Features |
|------|-------|----------|
| **Login** | `/login` | JWT-based authentication form |
| **Dashboard** | `/dashboard` | Overview metrics, system health summary |
| **Queues** | `/queues` | List all queues with status indicators, depth, throughput |
| **Queue Detail** | `/queues/[id]` | Detailed stats, retry policy config, pause/resume controls |
| **Jobs** | `/jobs` | Job explorer with status filtering, type filtering, pagination |
| **Job Detail** | `/jobs/[id]` | Full job details, execution history, per-attempt logs |
| **Workers** | `/workers` | Worker fleet overview — hostname, status, job count, last heartbeat |
| **Dead Letter Queue** | `/dlq` | DLQ entries with requeue and purge actions |

### 7.2 Key UI Capabilities

- **Real-time updates** via WebSocket events (live job status changes, worker heartbeats)
- **Responsive layout** with sidebar navigation
- **Filtering & pagination** on job and DLQ listings
- **One-click retry** for failed and DLQ jobs
- **Queue pause/resume** toggle from the UI
- **Execution log viewer** — chronological, severity-coded logs per attempt

---

## 8. Design Decisions & Trade-Offs

### 8.1 PostgreSQL `SKIP LOCKED` vs Redis-Based Queuing

| Approach | Pros | Cons |
|----------|------|------|
| **PostgreSQL SKIP LOCKED** ✅ (chosen) | Single source of truth, ACID transactions, no data loss on crash, atomic claim+update | Higher latency per poll (~5ms per query); requires polling |
| **Redis Streams / BullMQ** | Sub-millisecond latency, built-in delayed jobs | Data loss risk (Redis is not durable by default), dual-write complexity |

**Decision**: PostgreSQL was chosen because reliability and correctness are the primary design goals for a job scheduler. `SKIP LOCKED` provides lock-free concurrent polling without any duplicate execution risk, and the database is always the authoritative state source.

### 8.2 Separate Worker Service vs Embedded Worker

**Decision**: The worker runs as a **separate NestJS application** (`apps/worker`), not embedded in the API. This allows:
- Independent scaling (10 API instances, 50 workers)
- Independent deployment and restart
- Failure isolation (worker crash doesn't affect the API)
- Different resource profiles (workers are CPU/memory-bound, API is I/O-bound)

### 8.3 Polling vs Event-Driven Execution

**Decision**: Workers use **polling** (`setTimeout` loop every 500ms) rather than `LISTEN/NOTIFY` or Redis pub/sub.

- Polling is simpler to implement correctly and debug
- `SKIP LOCKED` makes it efficient even under high concurrency
- The `POLL_INTERVAL_MS` is configurable per deployment
- Redis heartbeat TTL provides the "push" channel for liveness detection

### 8.4 Webhook Execution Model

Jobs are executed by **POSTing to a `handler_url`** with the job payload:
- Decouples the scheduler from application logic
- Handlers can be any HTTP service (microservice, serverless function, external API)
- If no `handler_url` is set, the worker simulates a 100ms execution (useful for testing)

### 8.5 Cron Materializer Pattern

Instead of running cron jobs directly, Orqestra uses a **materializer** pattern:
- A `@Cron('* * * * *')` task in the API checks for due `scheduled_jobs`
- It creates concrete `Job` records in `QUEUED` status for each due schedule
- Workers then claim and execute these materialized jobs normally

**Benefits**: Cron jobs go through the same claiming, retry, and DLQ pipeline as all other jobs. No special execution path needed.

### 8.6 Dual Heartbeat Channels

| Channel | Purpose |
|---------|---------|
| **Redis SETEX** | Fast TTL-based liveness detection (API monitors for missing keys) |
| **DB heartbeat records** | Persistent historical trail for dashboard visualization and auditing |

### 8.7 TypeORM Entity Metadata vs Raw SQL

- **TypeORM entities** are used for CRUD operations, validation, and serialization
- **Raw SQL** is used exclusively for the atomic claim query where precise control over `FOR UPDATE SKIP LOCKED` behavior is essential
- This hybrid approach balances developer productivity with performance-critical correctness

### 8.8 Refresh Token Rotation

On every refresh, a new refresh token is issued and the old hash is overwritten. This means:
- Stolen refresh tokens are invalidated as soon as the legitimate user refreshes
- Single-use refresh tokens reduce the window of compromise

---

## 9. Testing

### 9.1 Unit Tests

Located in `apps/api/src/`:

#### Job State Machine Tests ([`jobs.service.spec.ts`](file:///c:/TSVV/Codity.Ai/Orqestra/apps/api/src/jobs/jobs.service.spec.ts))
- ✅ Successfully cancels a `QUEUED` job → status becomes `CANCELLED`
- ✅ Throws `ConflictException` when cancelling a `RUNNING` job
- ✅ Retry resets a `FAILED` job → status becomes `QUEUED`, `attempts = 0`, `workerId = null`
- ✅ WebSocket events emitted on state transitions

#### Retry Policy Backoff Tests ([`retry-policy.spec.ts`](file:///c:/TSVV/Codity.Ai/Orqestra/apps/api/src/queues/retry-policy.spec.ts))
- ✅ **Fixed** strategy returns constant `baseDelayMs` regardless of attempt number
- ✅ **Linear** strategy returns `baseDelayMs × attempt`
- ✅ **Exponential** strategy returns `baseDelayMs × 2^(attempt-1)`
- ✅ Delay is **capped at `maxDelayMs`** — prevents unbounded exponential growth

### 9.2 Running Tests

```bash
# Run all API tests
pnpm --filter @orqestra/api run test

# Run in watch mode
pnpm --filter @orqestra/api run test:watch
```

### 9.3 Test Strategy

| Layer | Coverage | Approach |
|-------|----------|----------|
| **Entity logic** | `RetryPolicy.calculateDelay()` | Pure unit tests |
| **Service state machine** | `JobsService.cancel()`, `retry()` | Unit tests with mocked repositories |
| **Event emission** | WebSocket gateway events | Verified via mock assertions |
| **Build verification** | Full workspace | `pnpm build` compiles all 3 apps successfully |

---

## 10. Setup & Running Instructions

### Prerequisites
- **Node.js** v20+
- **pnpm** v9+
- A **PostgreSQL** database (e.g., Supabase)
- A **Redis** instance (e.g., Upstash)

### Step 1: Install Dependencies

```bash
cd Orqestra
pnpm install
```

### Step 2: Configure Environment Variables

Create `.env` files in both `apps/api/` and `apps/worker/`:

```env
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Redis
REDIS_URL=rediss://default:token@host:port

# JWT (API only)
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret

# Worker config (worker only)
WORKER_CONCURRENCY=5
POLL_INTERVAL_MS=500
HEARTBEAT_INTERVAL_MS=5000
HEARTBEAT_TTL_MS=15000
DRAIN_TIMEOUT_MS=30000
```

### Step 3: Run in Development Mode

```bash
# Start all 3 services (API + Worker + Dashboard) in parallel
pnpm dev
```

| Service | URL |
|---------|-----|
| API Gateway | http://localhost:3001 |
| Swagger Docs | http://localhost:3001/api/docs |
| Web Dashboard | http://localhost:3000 |
| WebSocket | ws://localhost:3001/events |

### Step 4: Default Credentials

On first run, the database is **automatically seeded** with:
- **User**: `demo@orqestra.dev` / `demo12345`
- **API Key**: `ak_demo_project_key` (use header `X-API-Key: ak_demo_project_key`)
- **Queues**: `default-queue` (exponential backoff) and `email-delivery` (linear backoff)
- **Sample jobs** in various states (completed, running, queued, scheduled, DLQ)

---

## 11. Bonus Features

| Feature | Status | Implementation |
|---------|--------|---------------|
| **Rate limiting** | ✅ Implemented | `@nestjs/throttler` (100 req/60s global), per-queue `rate_limit_per_sec` column |
| **WebSocket live updates** | ✅ Implemented | Socket.IO gateway with project-scoped rooms, 12+ event types |
| **Role-based access control** | ✅ Implemented | `organization_members.role` enum (`owner`, `admin`, `member`) |
| **Idempotency** | ✅ Implemented | Partial unique index on `(queue_id, idempotency_key)` |
| **Batch jobs** | ✅ Implemented | Atomic batch creation with aggregate progress tracking |
| **Queue pause/resume** | ✅ Implemented | `is_paused` flag excludes queues from worker polling |
| **Configurable retry strategies** | ✅ Implemented | Fixed, linear, exponential with max delay cap |
| **Dead Letter Queue** | ✅ Implemented | Automatic DLQ parking with requeue and purge operations |
| **Graceful worker shutdown** | ✅ Implemented | Drain in-flight jobs with configurable timeout |
| **Stale job recovery** | ✅ Implemented | Reclaims jobs from crashed workers via heartbeat TTL monitoring |
| **Auto-seeding** | ✅ Implemented | `SeedService` populates demo data on first boot |
| **Swagger documentation** | ✅ Implemented | Full OpenAPI spec at `/api/docs` |
| **Structured logging** | ✅ Implemented | Pino with pretty-printing in dev, JSON in prod |
