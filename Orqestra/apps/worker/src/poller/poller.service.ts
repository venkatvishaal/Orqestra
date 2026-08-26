import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as os from 'os';
import axios from 'axios';
import { Worker as BullWorker, Job as BullJob } from 'bullmq';
import { Job, JobStatus } from '../../../api/src/jobs/entities/job.entity';
import { JobExecution, ExecutionStatus } from '../../../api/src/jobs/entities/job-execution.entity';
import { JobLog, LogLevel } from '../../../api/src/jobs/entities/job-log.entity';
import { Queue } from '../../../api/src/queues/entities/queue.entity';
import { DeadLetterEntry } from '../../../api/src/dlq/entities/dead-letter-entry.entity';
import { Worker as WorkerEntity, WorkerStatus } from '../../../api/src/workers/entities/worker.entity';
import { BatchJob } from '../../../api/src/jobs/entities/batch-job.entity';

/**
 * PollerService — BullMQ-powered job executor
 *
 * Replaces the previous SELECT FOR UPDATE SKIP LOCKED polling loop.
 * BullMQ handles atomic job claiming (via Redis LMOVE + lock key) so
 * we no longer need any raw SQL. The worker subscribes to all non-paused
 * Aurora queues and processes jobs using BullMQ's Worker primitive.
 *
 * Postgres is kept as the authoritative audit store:
 *  - Job status (RUNNING / COMPLETED / FAILED / DLQ) is written here
 *  - JobExecution and JobLog rows are created here
 *
 * BullMQ is the hot queue (in Redis):
 *  - Provides atomic claim, concurrency control, retries, stall detection
 */
@Injectable()
export class PollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PollerService.name);

  workerId: string; // exposed for HeartbeatService
  readonly activeJobs = new Map<string, Promise<void>>(); // job.id → running promise

  private bullWorkers: BullWorker[] = [];
  private readonly maxConcurrency: number;
  private readonly redisUrl: string;

  constructor(
    @InjectRepository(Job) private readonly jobsRepo: Repository<Job>,
    @InjectRepository(Queue) private readonly queuesRepo: Repository<Queue>,
    @InjectRepository(JobExecution) private readonly executionsRepo: Repository<JobExecution>,
    @InjectRepository(JobLog) private readonly logsRepo: Repository<JobLog>,
    @InjectRepository(WorkerEntity) private readonly workersRepo: Repository<WorkerEntity>,
    @InjectRepository(DeadLetterEntry) private readonly dlqRepo: Repository<DeadLetterEntry>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {
    this.maxConcurrency = parseInt(config.get('WORKER_CONCURRENCY', '5'));
    this.redisUrl = config.get<string>('REDIS_URL')!;
  }

  async onModuleInit() {
    // Register this process as a worker in Postgres
    const workerRecord = await this.workersRepo.save(
      this.workersRepo.create({
        hostname: os.hostname(),
        processId: process.pid,
        maxConcurrency: this.maxConcurrency,
        status: WorkerStatus.HEALTHY,
        lastHeartbeatAt: new Date(),
      }),
    );
    this.workerId = workerRecord.id;
    this.logger.log(`Worker ${this.workerId} registered (concurrency=${this.maxConcurrency})`);

    // Subscribe to all currently active, non-paused queues
    await this.subscribeToQueues();
  }

  async onModuleDestroy() {
    this.logger.log(`Draining ${this.activeJobs.size} in-flight jobs before shutdown...`);

    // Pause all BullMQ workers (stop accepting new jobs)
    await Promise.all(this.bullWorkers.map((w) => w.pause()));

    // Wait for in-flight jobs to complete (with timeout)
    const drainTimeoutMs = parseInt(this.config.get('DRAIN_TIMEOUT_MS', '30000'));
    const drainStart = Date.now();
    while (this.activeJobs.size > 0 && Date.now() - drainStart < drainTimeoutMs) {
      await Promise.race([...this.activeJobs.values()].map((p) => p.catch(() => {})));
    }

    if (this.activeJobs.size > 0) {
      this.logger.warn(`Drain timeout — ${this.activeJobs.size} jobs still in-flight, BullMQ will requeue them`);
    }

    // Close BullMQ workers
    await Promise.all(this.bullWorkers.map((w) => w.close()));

    await this.workersRepo.update(this.workerId, {
      status: WorkerStatus.OFFLINE,
      currentJobCount: 0,
    });
    this.logger.log('Worker graceful shutdown complete');
  }

  // ---------------------------------------------------------------------------
  // Queue subscription
  // ---------------------------------------------------------------------------

  /**
   * Creates one BullMQ Worker per Aurora queue.
   * BullMQ workers listen on the Redis queue named after the Aurora queue's `name`.
   */
  private async subscribeToQueues(): Promise<void> {
    const queues = await this.queuesRepo.find({ where: { isPaused: false } });

    if (!queues.length) {
      this.logger.warn('No active queues found. Worker is idle until queues are created.');
      return;
    }

    for (const queue of queues) {
      const bullWorker = new BullWorker(
        queue.name,
        (bullJob) => this.handleBullJob(bullJob, queue),
        {
          connection: { url: this.redisUrl },
          concurrency: this.maxConcurrency,
          stalledInterval: 30000,   // check for stalled jobs every 30s
          maxStalledCount: 2,       // allow 2 stalls before failing
        },
      );

      bullWorker.on('error', (err) => {
        this.logger.error(`BullMQ worker error on queue "${queue.name}":`, err.message);
      });

      this.bullWorkers.push(bullWorker);
      this.logger.log(`Subscribed to BullMQ queue "${queue.name}"`);
    }
  }

  // ---------------------------------------------------------------------------
  // Job processing
  // ---------------------------------------------------------------------------

  /**
   * Called by BullMQ when a job is ready to process.
   * BullMQ has already atomically claimed the job from Redis.
   * We now:
   *  1. Load full job from Postgres
   *  2. Create a JobExecution record
   *  3. Execute (call handlerUrl or simulate)
   *  4. Write result back to Postgres
   */
  private async handleBullJob(bullJob: BullJob, queue: Queue): Promise<void> {
    const { jobId } = bullJob.data as { jobId: string };
    const startTime = Date.now();

    // Load the Postgres job record
    const job = await this.jobsRepo.findOne({ where: { id: jobId } });
    if (!job) {
      this.logger.warn(`BullMQ delivered job ${jobId} but it no longer exists in Postgres — skipping`);
      return;
    }

    // Create execution record
    const execution = this.executionsRepo.create({
      jobId: job.id,
      workerId: this.workerId,
      attemptNumber: (job.attempts || 0) + 1,
      status: ExecutionStatus.RUNNING,
      startedAt: new Date(),
    });
    await this.executionsRepo.save(execution);

    // Mark as RUNNING in Postgres
    await this.jobsRepo.update(job.id, {
      status: JobStatus.RUNNING,
      workerId: this.workerId,
      claimedAt: new Date(),
    });

    await this.workersRepo.update(this.workerId, { currentJobCount: this.activeJobs.size + 1 });

    const promise = this.executeJob(job, execution, queue, startTime)
      .finally(() => this.activeJobs.delete(job.id));
    this.activeJobs.set(job.id, promise);

    await promise;
  }

  private async executeJob(
    job: Job,
    execution: JobExecution,
    queue: Queue,
    startTime: number,
  ): Promise<void> {
    this.logger.log(`Executing job ${job.id} (attempt ${execution.attemptNumber})`);
    await this.appendLog(execution.id, LogLevel.INFO, `Job ${job.id} started (attempt ${execution.attemptNumber})`);

    try {
      let result: any = { message: 'Simulated execution — no handler_url provided' };

      if (job.handlerUrl) {
        await this.appendLog(execution.id, LogLevel.INFO, `Calling handler: ${job.handlerUrl}`);
        const response = await axios.post(
          job.handlerUrl,
          { jobId: job.id, payload: job.payload, attempt: execution.attemptNumber },
          { timeout: 30000 },
        );
        result = response.data;
        await this.appendLog(execution.id, LogLevel.INFO, `Handler responded with status ${response.status}`);
      } else {
        await new Promise((r) => setTimeout(r, 100));
      }

      const durationMs = Date.now() - startTime;

      await this.dataSource.transaction(async (em) => {
        await em.update(Job, { id: job.id }, { status: JobStatus.COMPLETED });
        await em.update(JobExecution, { id: execution.id }, {
          status: ExecutionStatus.COMPLETED,
          result,
          finishedAt: new Date(),
          durationMs,
        });
      });

      await this.appendLog(execution.id, LogLevel.INFO, `Job completed in ${durationMs}ms`);
      this.logger.log(`Job ${job.id} COMPLETED in ${durationMs}ms`);

      // Update batch progress if part of a batch
      if (job.batchId) await this.updateBatchProgress(job.batchId);
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      const errMessage = error?.message || 'Unknown error';
      const errStack = error?.stack;

      await this.appendLog(execution.id, LogLevel.ERROR, `Job failed: ${errMessage}`);

      const maxAttempts = job.maxAttempts ?? queue?.retryPolicy?.maxAttempts ?? 3;
      const newAttempts = (job.attempts || 0) + 1;

      await this.executionsRepo.update(execution.id, {
        status: ExecutionStatus.FAILED,
        errorMessage: errMessage,
        errorStack: errStack,
        finishedAt: new Date(),
        durationMs,
      });

      if (newAttempts >= maxAttempts) {
        // Move to DLQ in Postgres — BullMQ will also move it to failed
        await this.dataSource.transaction(async (em) => {
          await em.update(Job, { id: job.id }, { status: JobStatus.DLQ, attempts: newAttempts });
          await em.save(DeadLetterEntry, {
            jobId: job.id,
            queueId: job.queueId,
            reason: `Max attempts (${maxAttempts}) exceeded`,
            finalError: errMessage,
            totalAttempts: newAttempts,
          });
        });
        this.logger.warn(`Job ${job.id} moved to DLQ after ${newAttempts} attempts`);
      } else {
        // Record attempt count — BullMQ handles retry scheduling via its backoff config
        await this.jobsRepo.update(job.id, {
          status: JobStatus.SCHEDULED,
          attempts: newAttempts,
          workerId: null,
          claimedAt: null,
        });
        this.logger.log(`Job ${job.id} failed attempt ${newAttempts}/${maxAttempts} — BullMQ will retry`);
        // Re-throw so BullMQ knows to retry with backoff
        throw error;
      }

      if (job.batchId) await this.updateBatchProgress(job.batchId);
    } finally {
      await this.workersRepo.update(this.workerId, {
        currentJobCount: Math.max(0, this.activeJobs.size - 1),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async appendLog(executionId: string, level: LogLevel, message: string) {
    await this.logsRepo.save(
      this.logsRepo.create({ jobExecutionId: executionId, timestamp: new Date(), level, message }),
    );
  }

  private async updateBatchProgress(batchId: string) {
    const counts = await this.dataSource.getRepository(Job)
      .createQueryBuilder('job')
      .select([
        "COUNT(*) FILTER (WHERE job.status = 'completed') as completed",
        "COUNT(*) FILTER (WHERE job.status IN ('failed', 'dlq')) as failed",
        "COUNT(*) FILTER (WHERE job.status IN ('queued', 'claimed', 'running', 'scheduled')) as pending",
      ])
      .where('job.batchId = :batchId', { batchId })
      .getRawOne();

    await this.dataSource.getRepository(BatchJob).update(batchId, {
      completedJobs: parseInt(counts.completed || '0', 10),
      failedJobs: parseInt(counts.failed || '0', 10),
      pendingJobs: parseInt(counts.pending || '0', 10),
    });
  }
}
