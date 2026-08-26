import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Cron as CronJob } from 'croner';
import Redis from 'ioredis';
import { Job, JobStatus, JobType } from './entities/job.entity';
import { JobExecution, ExecutionStatus } from './entities/job-execution.entity';
import { JobLog } from './entities/job-log.entity';
import { ScheduledJob } from './entities/scheduled-job.entity';
import { BatchJob } from './entities/batch-job.entity';
import { Queue } from '../queues/entities/queue.entity';
import { DeadLetterEntry } from '../dlq/entities/dead-letter-entry.entity';
import { EventsGateway } from '../events/events.gateway';
import { BullQueueFactory } from '../queues/bull.module';
import { REDIS_CLIENT } from '../redis/redis.module';
import { CreateJobDto } from './dto/create-job.dto';
import { ListJobsDto } from './dto/list-jobs.dto';

/** Lock TTL (seconds) — slightly less than cron interval to guarantee release */
const CRON_LOCK_TTL_SEC = 55;

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectRepository(Job)
    private readonly jobsRepo: Repository<Job>,
    @InjectRepository(JobExecution)
    private readonly executionsRepo: Repository<JobExecution>,
    @InjectRepository(JobLog)
    private readonly logsRepo: Repository<JobLog>,
    @InjectRepository(ScheduledJob)
    private readonly scheduledJobsRepo: Repository<ScheduledJob>,
    @InjectRepository(BatchJob)
    private readonly batchJobsRepo: Repository<BatchJob>,
    @InjectRepository(Queue)
    private readonly queuesRepo: Repository<Queue>,
    @InjectRepository(DeadLetterEntry)
    private readonly dlqRepo: Repository<DeadLetterEntry>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly eventsGateway: EventsGateway,
    private readonly bullFactory: BullQueueFactory,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async create(dto: CreateJobDto): Promise<Job | ScheduledJob | { batchId: string; jobs: Job[] }> {
    const queue = await this.queuesRepo.findOne({
      where: { id: dto.queueId },
      relations: ['retryPolicy'],
    });
    if (!queue) throw new NotFoundException(`Queue ${dto.queueId} not found`);
    if (queue.isPaused) throw new BadRequestException('Queue is paused');

    if (dto.type === JobType.BATCH) return this.createBatch(dto, queue);
    if (dto.type === JobType.CRON) return this.createCronJob(dto, queue);

    // Idempotency check
    if (dto.idempotencyKey) {
      const existing = await this.jobsRepo.findOne({
        where: { queueId: dto.queueId, idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return existing;
    }

    const runAt = this.computeRunAt(dto);
    const status = runAt > new Date() ? JobStatus.SCHEDULED : JobStatus.QUEUED;
    const maxAttempts = dto.maxAttempts ?? queue.retryPolicy?.maxAttempts ?? 3;

    const job = this.jobsRepo.create({
      queueId: dto.queueId,
      type: dto.type,
      status,
      payload: dto.payload ?? {},
      handlerUrl: dto.handlerUrl,
      idempotencyKey: dto.idempotencyKey,
      priority: dto.priority ?? 0,
      runAt,
      maxAttempts,
      cronExpression: dto.cronExpression,
    });

    const saved = await this.jobsRepo.save(job);

    // Push immediately-runnable jobs to BullMQ (Redis hot queue).
    // Delayed jobs are pushed with a BullMQ delay so they fire at the right time.
    if (status === JobStatus.QUEUED || status === JobStatus.SCHEDULED) {
      await this.enqueueToBull(queue.name, saved, dto.delayMs);
    }

    this.eventsGateway.emitJobEvent('job.created', saved);
    this.logger.log(`Job created: ${saved.id} type=${saved.type} status=${saved.status}`);
    return saved;
  }

  async findAll(dto: ListJobsDto) {
    const qb = this.jobsRepo.createQueryBuilder('job');

    if (dto.queueId) qb.andWhere('job.queueId = :queueId', { queueId: dto.queueId });
    if (dto.status) qb.andWhere('job.status = :status', { status: dto.status });
    if (dto.type) qb.andWhere('job.type = :type', { type: dto.type });
    if (dto.dateFrom) qb.andWhere('job.createdAt >= :dateFrom', { dateFrom: dto.dateFrom });
    if (dto.dateTo) qb.andWhere('job.createdAt <= :dateTo', { dateTo: dto.dateTo });
    if (dto.batchId) qb.andWhere('job.batchId = :batchId', { batchId: dto.batchId });

    qb.orderBy('job.createdAt', 'DESC')
      .skip((dto.page - 1) * dto.limit)
      .take(dto.limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page: dto.page, limit: dto.limit, pages: Math.ceil(total / dto.limit) };
  }

  async findOne(id: string): Promise<Job> {
    const job = await this.jobsRepo.findOne({
      where: { id },
      relations: ['executions', 'queue'],
    });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }

  async cancel(id: string): Promise<Job> {
    const job = await this.jobsRepo.findOne({ where: { id } });
    if (!job) throw new NotFoundException(`Job ${id} not found`);

    if (![JobStatus.QUEUED, JobStatus.SCHEDULED].includes(job.status)) {
      throw new ConflictException(
        `Cannot cancel job in status ${job.status}. Only queued/scheduled jobs can be cancelled.`,
      );
    }

    job.status = JobStatus.CANCELLED;
    const saved = await this.jobsRepo.save(job);
    this.eventsGateway.emitJobEvent('job.cancelled', saved);
    return saved;
  }

  async retry(id: string): Promise<Job> {
    const job = await this.jobsRepo.findOne({
      where: { id },
      relations: ['queue'],
    });
    if (!job) throw new NotFoundException(`Job ${id} not found`);

    if (![JobStatus.FAILED, JobStatus.DLQ].includes(job.status)) {
      throw new ConflictException(`Job is not in failed or DLQ state`);
    }

    const originalStatus = job.status;

    job.status = JobStatus.QUEUED;
    job.attempts = 0;
    job.runAt = new Date();
    job.workerId = null;
    job.claimedAt = null;

    const saved = await this.jobsRepo.save(job);

    if (originalStatus === JobStatus.DLQ) {
      await this.dlqRepo.update({ jobId: id }, { isRequeued: true, requeuedAt: new Date() });
    }

    // Re-push to BullMQ so the worker picks it up
    if (job.queue?.name) {
      await this.enqueueToBull(job.queue.name, saved);
    }

    this.eventsGateway.emitJobEvent('job.retried', saved);
    return saved;
  }

  async getExecutionLogs(jobId: string, executionId: string): Promise<JobLog[]> {
    return this.logsRepo.find({
      where: { jobExecutionId: executionId },
      order: { timestamp: 'ASC' },
    });
  }

  /** Called by worker service to report job completion */
  async completeJob(
    jobId: string,
    result: Record<string, any>,
    executionId: string,
    startTime: number, // epoch ms — passed by the worker to compute accurate duration
  ): Promise<void> {
    const durationMs = Date.now() - startTime;

    await this.dataSource.transaction(async (em) => {
      await em.update(Job, { id: jobId }, { status: JobStatus.COMPLETED });
      await em.update(
        JobExecution,
        { id: executionId },
        {
          status: ExecutionStatus.COMPLETED,
          result,
          finishedAt: new Date(),
          durationMs,
        },
      );
    });

    // Use what we already know — avoid an extra DB round-trip just to emit an event
    const jobSnapshot = { id: jobId, status: JobStatus.COMPLETED } as Job;
    this.eventsGateway.emitJobEvent('job.completed', jobSnapshot);
  }

  /** Called by worker to report job failure and handle retry/DLQ logic */
  async failJob(
    jobId: string,
    error: { message: string; stack?: string },
    executionId: string,
  ): Promise<void> {
    const job = await this.jobsRepo.findOne({
      where: { id: jobId },
      relations: ['queue', 'queue.retryPolicy'],
    });
    if (!job) return;

    const maxAttempts = job.maxAttempts ?? job.queue?.retryPolicy?.maxAttempts ?? 3;
    const newAttempts = job.attempts + 1;

    await this.executionsRepo.update(executionId, {
      status: ExecutionStatus.FAILED,
      errorMessage: error.message,
      errorStack: error.stack,
      finishedAt: new Date(),
    });

    if (newAttempts >= maxAttempts) {
      await this.dataSource.transaction(async (em) => {
        await em.update(Job, { id: jobId }, { status: JobStatus.DLQ, attempts: newAttempts });
        await em.save(DeadLetterEntry, {
          jobId,
          queueId: job.queueId,
          reason: `Max attempts (${maxAttempts}) exceeded`,
          finalError: error.message,
          totalAttempts: newAttempts,
        });
      });
      this.eventsGateway.emitJobEvent('job.dlq', job);
    } else {
      // BullMQ handles retry scheduling via its own backoff — we just record the attempt count
      const retryPolicy = job.queue?.retryPolicy;
      const delayMs = retryPolicy?.calculateDelay(newAttempts) ?? 2000 * Math.pow(2, newAttempts - 1);
      const runAt = new Date(Date.now() + delayMs);

      await this.jobsRepo.update(jobId, {
        status: JobStatus.SCHEDULED,
        attempts: newAttempts,
        runAt,
        workerId: null,
        claimedAt: null,
      });
      this.eventsGateway.emitJobEvent('job.failed', { ...job, attempts: newAttempts });
    }

    if (job.batchId) await this.updateBatchProgress(job.batchId);
  }

  // ---------------------------------------------------------------------------
  // Cron Materializer
  // ---------------------------------------------------------------------------

  /**
   * Runs every minute to spawn Postgres job records for due cron schedules,
   * then pushes them to BullMQ.
   *
   * Uses a Redis distributed lock (SET NX EX) so that only ONE API instance
   * materializes jobs when multiple replicas are running simultaneously.
   */
  @Cron('* * * * *')
  async materializeCronJobs() {
    // Acquire a 55-second lock — prevents duplicate materialisation in multi-instance deploys
    const lockKey = 'cron:lock:materializer';
    const acquired = await this.redis.set(lockKey, '1', 'EX', CRON_LOCK_TTL_SEC, 'NX');
    if (!acquired) {
      this.logger.debug('Cron materializer lock held by another instance — skipping');
      return;
    }

    const due = await this.scheduledJobsRepo
      .createQueryBuilder('sj')
      .where('sj.nextRunAt <= NOW()')
      .andWhere('sj.isActive = true')
      .getMany();

    for (const scheduledJob of due) {
      try {
        const job = await this.jobsRepo.save(
          this.jobsRepo.create({
            queueId: scheduledJob.queueId,
            type: JobType.SCHEDULED,
            status: JobStatus.QUEUED,
            payload: scheduledJob.jobTemplate.payload,
            handlerUrl: scheduledJob.jobTemplate.handlerUrl,
            priority: scheduledJob.jobTemplate.priority ?? 0,
            maxAttempts: scheduledJob.jobTemplate.maxAttempts ?? 3,
            runAt: new Date(),
          }),
        );

        // Look up the queue name for BullMQ
        const queue = await this.queuesRepo.findOne({ where: { id: scheduledJob.queueId } });
        if (queue) {
          await this.enqueueToBull(queue.name, job);
        }

        const cron = new CronJob(scheduledJob.cronExpression);
        const nextRun = cron.nextRun();
        await this.scheduledJobsRepo.update(scheduledJob.id, {
          nextRunAt: nextRun ?? new Date(Date.now() + 60000),
          lastMaterializedJobId: job.id,
        });

        this.eventsGateway.emitJobEvent('job.created', job);
        this.logger.log(`Materialized cron job ${job.id} from schedule ${scheduledJob.id}`);
      } catch (err) {
        this.logger.error(`Failed to materialize cron job ${scheduledJob.id}:`, err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private computeRunAt(dto: CreateJobDto): Date {
    if (dto.type === JobType.IMMEDIATE) return new Date();
    if (dto.type === JobType.DELAYED && dto.delayMs) {
      return new Date(Date.now() + dto.delayMs);
    }
    if (dto.runAt) return new Date(dto.runAt);
    return new Date();
  }

  /**
   * Push a saved Job to BullMQ.
   * BullMQ handles priority and delay natively.
   * The job payload stored in Redis is intentionally minimal — the worker
   * reads the full job from Postgres using the jobId.
   */
  private async enqueueToBull(queueName: string, job: Job, delayMs?: number): Promise<void> {
    try {
      const bullQueue = this.bullFactory.getOrCreate(queueName);
      await bullQueue.add(
        job.type,
        { jobId: job.id },          // minimal payload — worker fetches the rest from Postgres
        {
          jobId: job.id,            // deduplicate by Postgres ID
          priority: job.priority,
          delay: delayMs ?? 0,
          attempts: job.maxAttempts ?? 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );
      this.logger.debug(`Job ${job.id} enqueued to BullMQ queue "${queueName}"`);
    } catch (err) {
      // Non-fatal — job is safe in Postgres. Log and continue.
      this.logger.error(`Failed to enqueue job ${job.id} to BullMQ:`, err);
    }
  }

  private async createBatch(dto: CreateJobDto, queue: Queue) {
    if (!dto.batchItems?.length) {
      throw new BadRequestException('Batch jobs require batchItems array');
    }

    const batch = await this.batchJobsRepo.save(
      this.batchJobsRepo.create({
        queueId: dto.queueId,
        totalJobs: dto.batchItems.length,
        pendingJobs: dto.batchItems.length,
        name: dto.batchName,
      }),
    );

    const maxAttempts = dto.maxAttempts ?? queue.retryPolicy?.maxAttempts ?? 3;
    const jobEntities = dto.batchItems.map((item) =>
      this.jobsRepo.create({
        queueId: dto.queueId,
        type: JobType.BATCH,
        status: JobStatus.QUEUED,
        payload: item.payload ?? {},
        handlerUrl: item.handlerUrl ?? dto.handlerUrl,
        priority: dto.priority ?? 0,
        runAt: new Date(),
        maxAttempts,
        batchId: batch.id,
      }),
    );

    const saved = await this.jobsRepo.save(jobEntities);

    // Push all batch jobs to BullMQ
    await Promise.all(saved.map((j) => this.enqueueToBull(queue.name, j)));

    return { batchId: batch.id, jobs: saved };
  }

  private async createCronJob(dto: CreateJobDto, queue: Queue) {
    if (!dto.cronExpression) {
      throw new BadRequestException('Cron jobs require a cronExpression');
    }
    try {
      const cron = new CronJob(dto.cronExpression);
      const nextRun = cron.nextRun();
      if (!nextRun) throw new Error('No next run');

      const scheduledJob = await this.scheduledJobsRepo.save(
        this.scheduledJobsRepo.create({
          queueId: dto.queueId,
          cronExpression: dto.cronExpression,
          nextRunAt: nextRun,
          jobTemplate: {
            payload: dto.payload ?? {},
            handlerUrl: dto.handlerUrl,
            priority: dto.priority,
            maxAttempts: dto.maxAttempts ?? queue.retryPolicy?.maxAttempts ?? 3,
          },
        }),
      );
      return scheduledJob;
    } catch (e) {
      throw new BadRequestException(`Invalid cron expression: ${dto.cronExpression}`);
    }
  }

  private async updateBatchProgress(batchId: string) {
    const counts = await this.jobsRepo
      .createQueryBuilder('job')
      .select([
        "COUNT(*) FILTER (WHERE job.status = 'completed') as completed",
        "COUNT(*) FILTER (WHERE job.status IN ('failed', 'dlq')) as failed",
        "COUNT(*) FILTER (WHERE job.status IN ('queued', 'claimed', 'running', 'scheduled')) as pending",
      ])
      .where('job.batchId = :batchId', { batchId })
      .getRawOne();

    await this.batchJobsRepo.update(batchId, {
      completedJobs: parseInt(counts.completed),
      failedJobs: parseInt(counts.failed),
      pendingJobs: parseInt(counts.pending),
    });
  }
}
