import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { OrganizationMember, OrgRole } from '../organizations/entities/organization-member.entity';
import { Project } from '../projects/entities/project.entity';
import { ApiKey } from '../projects/entities/api-key.entity';
import { Queue } from '../queues/entities/queue.entity';
import { RetryPolicy, RetryStrategy } from '../queues/entities/retry-policy.entity';
import { Job, JobStatus, JobType } from '../jobs/entities/job.entity';
import { DeadLetterEntry } from '../dlq/entities/dead-letter-entry.entity';
import { Worker, WorkerStatus } from '../workers/entities/worker.entity';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Organization) private readonly orgsRepo: Repository<Organization>,
    @InjectRepository(OrganizationMember) private readonly membersRepo: Repository<OrganizationMember>,
    @InjectRepository(Project) private readonly projectsRepo: Repository<Project>,
    @InjectRepository(ApiKey) private readonly apiKeysRepo: Repository<ApiKey>,
    @InjectRepository(Queue) private readonly queuesRepo: Repository<Queue>,
    @InjectRepository(RetryPolicy) private readonly retryPoliciesRepo: Repository<RetryPolicy>,
    @InjectRepository(Job) private readonly jobsRepo: Repository<Job>,
    @InjectRepository(DeadLetterEntry) private readonly dlqRepo: Repository<DeadLetterEntry>,
    @InjectRepository(Worker) private readonly workersRepo: Repository<Worker>,
  ) {}

  async onApplicationBootstrap() {
    const userCount = await this.usersRepo.count();
    if (userCount > 0) {
      this.logger.log('Database already has data. Skipping seed.');
      return;
    }

    this.logger.log('Seeding demo data...');

    // 1. Create Demo User
    const passwordHash = await bcrypt.hash('demo12345', 12);
    const user = await this.usersRepo.save(
      this.usersRepo.create({
        email: 'demo@orqestra.dev',
        passwordHash,
      }),
    );

    // 2. Create Demo Org
    const org = await this.orgsRepo.save(
      this.orgsRepo.create({
        name: 'Demo Org',
        ownerId: user.id,
      }),
    );

    // Add owner membership
    await this.membersRepo.save(
      this.membersRepo.create({
        orgId: org.id,
        userId: user.id,
        role: OrgRole.OWNER,
      }),
    );

    // 3. Create Demo Project
    const project = await this.projectsRepo.save(
      this.projectsRepo.create({
        orgId: org.id,
        name: 'Demo Project',
        description: 'Primary project for background jobs',
      }),
    );

    // Create an API key for the project: ak_demo_project_key
    const keyHash = await bcrypt.hash('ak_demo_project_key', 12);
    await this.apiKeysRepo.save(
      this.apiKeysRepo.create({
        projectId: project.id,
        keyHash,
        keyPrefix: 'ak_demo_',
        name: 'Demo API Key',
      }),
    );

    // 4. Create Queues
    const defaultQueue = await this.queuesRepo.save(
      this.queuesRepo.create({
        projectId: project.id,
        name: 'default-queue',
        concurrencyLimit: 5,
        priority: 5,
        description: 'Standard immediate and delayed tasks',
      }),
    );

    await this.retryPoliciesRepo.save(
      this.retryPoliciesRepo.create({
        queueId: defaultQueue.id,
        strategy: RetryStrategy.EXPONENTIAL,
        baseDelayMs: 2000,
        maxAttempts: 3,
      }),
    );

    const emailQueue = await this.queuesRepo.save(
      this.queuesRepo.create({
        projectId: project.id,
        name: 'email-delivery',
        concurrencyLimit: 2,
        priority: 10,
        description: 'Transactional and marketing communications',
      }),
    );

    await this.retryPoliciesRepo.save(
      this.retryPoliciesRepo.create({
        queueId: emailQueue.id,
        strategy: RetryStrategy.LINEAR,
        baseDelayMs: 5000,
        maxAttempts: 5,
      }),
    );

    // 5. Create Mock Workers
    const worker1 = await this.workersRepo.save(
      this.workersRepo.create({
        hostname: 'worker-local-1',
        processId: 1024,
        status: WorkerStatus.HEALTHY,
        lastHeartbeatAt: new Date(),
        maxConcurrency: 5,
        queueIds: [defaultQueue.id, emailQueue.id],
      }),
    );

    const worker2 = await this.workersRepo.save(
      this.workersRepo.create({
        hostname: 'worker-local-2',
        processId: 2048,
        status: WorkerStatus.HEALTHY,
        lastHeartbeatAt: new Date(),
        maxConcurrency: 5,
        queueIds: [defaultQueue.id],
      }),
    );

    // 6. Create Mock Jobs
    // A. Completed Job
    await this.jobsRepo.save(
      this.jobsRepo.create({
        queueId: defaultQueue.id,
        type: JobType.IMMEDIATE,
        status: JobStatus.COMPLETED,
        payload: { userId: user.id, task: 'sync_profile' },
        priority: 1,
        attempts: 1,
        maxAttempts: 3,
        runAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago
      }),
    );

    // B. Running Job
    await this.jobsRepo.save(
      this.jobsRepo.create({
        queueId: defaultQueue.id,
        type: JobType.IMMEDIATE,
        status: JobStatus.RUNNING,
        payload: { fileId: 'f_98231', action: 'transcode' },
        priority: 2,
        attempts: 1,
        maxAttempts: 3,
        workerId: worker1.id,
        claimedAt: new Date(Date.now() - 30 * 1000), // 30s ago
        runAt: new Date(Date.now() - 60 * 1000),
      }),
    );

    // C. Queued Job
    await this.jobsRepo.save(
      this.jobsRepo.create({
        queueId: defaultQueue.id,
        type: JobType.IMMEDIATE,
        status: JobStatus.QUEUED,
        payload: { orderId: 'ord_12893', total: 154.5 },
        priority: 5,
        attempts: 0,
        maxAttempts: 3,
        runAt: new Date(),
      }),
    );

    // D. Delayed Scheduled Job
    await this.jobsRepo.save(
      this.jobsRepo.create({
        queueId: defaultQueue.id,
        type: JobType.DELAYED,
        status: JobStatus.SCHEDULED,
        payload: { reminderId: 'rem_1829' },
        priority: 1,
        attempts: 0,
        maxAttempts: 3,
        runAt: new Date(Date.now() + 15 * 60 * 1000), // 15 mins from now
      }),
    );

    // E. DLQ Job
    const dlqJob = await this.jobsRepo.save(
      this.jobsRepo.create({
        queueId: emailQueue.id,
        type: JobType.IMMEDIATE,
        status: JobStatus.DLQ,
        payload: { to: 'invalid-email-address', template: 'welcome' },
        priority: 1,
        attempts: 3,
        maxAttempts: 3,
        runAt: new Date(Date.now() - 7200 * 1000), // 2 hours ago
      }),
    );

    await this.dlqRepo.save(
      this.dlqRepo.create({
        jobId: dlqJob.id,
        queueId: emailQueue.id,
        reason: 'Max attempts (3) exceeded',
        finalError: 'Failed to resolve recipient host: invalid-email-address',
        totalAttempts: 3,
        movedAt: new Date(Date.now() - 7190 * 1000),
      }),
    );

    this.logger.log('Database seeding completed successfully.');
    this.logger.log(`Demo Project ID: ${project.id}`);
  }
}
