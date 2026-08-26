
# Orqestra — Codebase Navigation Guide

> **Last updated**: After full optimization refactor (BullMQ migration, auth hardening, reliability fixes).

---

## Project Structure

```
Orqestra/
├── apps/
│   ├── api/          NestJS REST + WebSocket API
│   ├── worker/       NestJS job executor
│   └── web/          Next.js dashboard
├── pnpm-workspace.yaml
└── GUIDE.md          ← You are here
```

---

## How Data Flows

```
POST /jobs
    │
    ├──► Postgres (jobs table)   — persistent audit record
    │
    └──► Redis / BullMQ queue    — hot execution queue
              │
              ▼
        Worker (BullMQ Worker)
              │
              ├──► Postgres job_executions   — execution record + timing
              ├──► Postgres job_logs         — append-only execution log
              └──► Postgres jobs.status      — RUNNING → COMPLETED/FAILED/DLQ
```

Postgres is the **source of truth** for history and dashboards.  
Redis/BullMQ is the **source of truth** for what executes next.

---

## App 1: API (`apps/api/`)

### Entry Point
- [`src/main.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/main.ts) — bootstraps NestJS, Swagger at `/api/docs`
- [`src/app.module.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/app.module.ts) — root module; note `isProd` guard on SeedService

### Auth (`src/auth/`)
| File | Purpose |
|---|---|
| [`auth.service.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/auth/auth.service.ts) | Register, login, refresh, logout, API key generation & validation |
| [`auth.controller.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/auth/auth.controller.ts) | `POST /auth/register`, `/login`, `/refresh`, `/logout` |
| [`strategies/jwt.strategy.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/auth/strategies) | Validates `Authorization: Bearer <token>` |
| [`strategies/api-key.strategy.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/auth/strategies) | Validates `x-api-key` header using `keyPrefix` → O(1) bcrypt lookup |

> **API Key validation**: Keys are stored as `bcrypt(rawKey)` + `keyPrefix` (first 8 chars, plaintext, indexed). Validation does a single `WHERE keyPrefix = $1` before bcrypt — eliminates O(n) loop.

### Queues (`src/queues/`)
| File | Purpose |
|---|---|
| [`queues.service.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/queues/queues.service.ts) | CRUD + pause/resume + `getStats()` (single GROUP BY query, Redis-cached 5s) |
| [`bull.module.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/queues/bull.module.ts) | `BullQueueFactory` — lazily creates one BullMQ `Queue` per Orqestra queue |
| [`entities/queue.entity.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/queues/entities) | Queue entity with `concurrencyLimit`, `rateLimitPerSec`, `isPaused` |
| [`entities/retry-policy.entity.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/queues/entities) | Retry strategy (EXPONENTIAL/LINEAR) with `calculateDelay()` method |

### Jobs (`src/jobs/`)
| File | Purpose |
|---|---|
| [`jobs.service.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/jobs/jobs.service.ts) | Create, list, cancel, retry, complete, fail, cron materializer |
| [`jobs.controller.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/jobs/jobs.controller.ts) | REST endpoints for job management |
| [`entities/job.entity.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/jobs/entities) | Core job: status, type, payload, priority, runAt, attempts |
| [`entities/job-execution.entity.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/jobs/entities) | One record per attempt: startedAt, finishedAt, durationMs, result |
| [`entities/job-log.entity.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/jobs/entities) | Append-only execution log lines |
| [`entities/scheduled-job.entity.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/jobs/entities) | Cron schedule template with `nextRunAt` |
| [`entities/batch-job.entity.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/jobs/entities) | Batch parent with progress counters |

> **Cron materializer**: Runs every minute via `@Cron('* * * * *')`. Uses a Redis `SET NX EX 55` distributed lock so only one API instance materializes when multiple replicas run.

> **BullMQ integration**: `create()` → saves to Postgres → calls `enqueueToBull()`. If Redis is down, the job is safe in Postgres (fail-safe logging, non-fatal).

### Workers (`src/workers/`)
| File | Purpose |
|---|---|
| [`workers.service.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/workers/workers.service.ts) | Register, heartbeat, deregister, stale detection (every 5s cron) |
| [`entities/worker.entity.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/workers/entities) | Worker: hostname, processId, status, currentJobCount, queueIds |
| [`entities/worker-heartbeat.entity.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/workers/entities) | Heartbeat records (pruned after 24h) |

### DLQ (`src/dlq/`)
| File | Purpose |
|---|---|
| [`dlq.service.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/dlq/dlq.service.ts) | List, requeue (re-pushes to BullMQ), purge DLQ entries |

### Events (`src/events/`)
| File | Purpose |
|---|---|
| [`events.gateway.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/events/events.gateway.ts) | Socket.IO WebSocket gateway — clients subscribe to project rooms |

### Infrastructure
| File | Purpose |
|---|---|
| [`redis/redis.module.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/redis/redis.module.ts) | Global ioredis client (`REDIS_CLIENT` token) |
| [`database/database.config.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/database/database.config.ts) | TypeORM config with pool tuning (`DB_POOL_MAX`, `DB_POOL_MIN`) |
| [`database/seed.service.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/api/src/database/seed.service.ts) | Seeds demo data on first boot (skipped in production) |

---

## App 2: Worker (`apps/worker/`)

### Entry Point
- [`src/main.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/worker/src/main.ts)
- [`src/worker-app.module.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/worker/src/worker-app.module.ts)

### Modules
| File | Purpose |
|---|---|
| [`poller/poller.service.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/worker/src/poller/poller.service.ts) | **Core executor** — BullMQ Workers per queue, executes jobs, writes results to Postgres |
| [`heartbeat/heartbeat.service.ts`](file:///c:/TSVV/Codity.Ai/Orqestra-scheduler/apps/worker/src/heartbeat/heartbeat.service.ts) | Sends heartbeat to Redis + Postgres every 5s |

> **No more raw SQL**: `SELECT FOR UPDATE SKIP LOCKED` is completely removed. BullMQ uses Redis `LMOVE` + a lock key for atomic claiming.

> **Worker startup**: `onModuleInit()` registers the worker in Postgres, then calls `subscribeToQueues()` which creates one `BullMQ Worker` per non-paused Orqestra queue.

> **Graceful shutdown**: `onModuleDestroy()` pauses BullMQ workers (no new jobs accepted), drains in-flight jobs up to `DRAIN_TIMEOUT_MS`, then marks the worker OFFLINE in Postgres.

---

## App 3: Web (`apps/web/`)

Next.js dashboard. Pages map to REST endpoints:

| Route | Data Source |
|---|---|
| `/dashboard` | `GET /queues`, `GET /jobs`, worker status |
| `/queues/[id]` | `GET /queues/:id/stats` (cached 5s via Redis) |
| `/jobs` | `GET /jobs` (paginated, filterable) |
| `/workers` | `GET /workers` |
| `/dlq` | `GET /dlq` |

WebSocket connection at `ws://api/events` for live updates.

---

## Environment Variables

### API (`apps/api/.env`)
| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | — | Postgres connection string |
| `REDIS_URL` | — | Redis/ioredis connection string (supports `rediss://` for TLS) |
| `JWT_SECRET` | — | Access token signing key |
| `JWT_REFRESH_SECRET` | — | Refresh token signing key |
| `PORT` | `3001` | API HTTP port |
| `NODE_ENV` | `development` | Controls sync, logging, seed |
| `DB_POOL_MAX` | `20` | Max Postgres connections |
| `DB_POOL_MIN` | `2` | Min Postgres connections |
| `FRONTEND_URL` | `http://localhost:3000` | CORS allowed origin |

### Worker (`apps/worker/.env`)
| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | — | Same Postgres DB as API |
| `REDIS_URL` | — | Same Redis as API (BullMQ queues live here) |
| `WORKER_CONCURRENCY` | `5` | Max simultaneous jobs |
| `HEARTBEAT_INTERVAL_MS` | `5000` | How often worker pings |
| `HEARTBEAT_TTL_MS` | `15000` | Missed heartbeat threshold |
| `DRAIN_TIMEOUT_MS` | `30000` | Graceful shutdown timeout |

---

## Job Lifecycle

```
create()
  │
  ▼
QUEUED ──────────────────────────────────► SCHEDULED (delayed/cron)
  │                                              │
  │  BullMQ Worker claims                        │ run_at reached
  ▼                                              ▼
RUNNING ──────────────────────────────── RUNNING
  │
  ├── success ──────────────────────────► COMPLETED
  │
  └── failure
        │
        ├── attempts < maxAttempts ───── SCHEDULED (BullMQ backoff retry)
        │
        └── attempts >= maxAttempts ──► DLQ
                                          │
                                    requeue() ──► QUEUED (BullMQ re-push)
```

---

## Key Design Decisions (Post-Refactor)

| Decision | Rationale |
|---|---|
| **BullMQ over raw SQL** | Redis `LMOVE` + lock is simpler and more scalable than `FOR UPDATE SKIP LOCKED`. No custom SQL needed. |
| **Postgres as audit store** | All history, logs, and stats live in Postgres. Redis is ephemeral hot-queue only. |
| **`keyPrefix` on ApiKey** | Eliminates O(n×bcrypt) API key validation — single indexed lookup before bcrypt. |
| **Redis lock on cron materializer** | `SET NX EX 55` prevents duplicate job spawn when multiple API replicas run. |
| **SeedService guarded by `isProd`** | Avoids registering 10 unnecessary repos in production. |
| **DB pool via env vars** | `DB_POOL_MAX`/`DB_POOL_MIN` — tunable without code changes. |
| **Cross-app entity imports** | Worker still imports from `../../../api/src/`. Extracting to `packages/db` is tracked as tech debt but not yet done — it requires build pipeline changes. |

---

## Running Locally

```bash
# From Orqestra-scheduler/
pnpm install

# Terminal 1 — API
cd apps/api && pnpm dev

# Terminal 2 — Worker
cd apps/worker && pnpm dev

# Terminal 3 — Web
cd apps/web && pnpm dev
```

Open `http://localhost:3000` for the dashboard.  
Swagger docs at `http://localhost:3001/api/docs`.

---

## Tech Stack Summary

| Layer | Technology |
|---|---|
| API framework | NestJS 10 |
| ORM | TypeORM 0.3 |
| Database | PostgreSQL (via Supabase) |
| Cache / Queue | Redis (via Upstash) |
| Job queue primitive | **BullMQ** |
| Auth | JWT (access + refresh) + API key |
| Real-time | Socket.IO WebSocket |
| Logger | Pino (structured JSON) |
| Dashboard | Next.js 16 |
| Package manager | pnpm workspaces |

