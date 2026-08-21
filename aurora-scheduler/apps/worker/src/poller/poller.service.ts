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
import { Job, JobStatus } from '../../../api/src/jobs/entities/job.entity';
import { JobExecution, ExecutionStatus } from '../../../api/src/jobs/entities/job-execution.entity';
import { JobLog, LogLevel } from '../../../api/src/jobs/entities/job-log.entity';
import { Queue } from '../../../api/src/queues/entities/queue.entity';
import { RetryPolicy } from '../../../api/src/queues/entities/retry-policy.entity';
import { DeadLetterEntry } from '../../../api/src/dlq/entities/dead-letter-entry.entity';
import { Worker as WorkerEntity, WorkerStatus } from '../../../api/src/workers/entities/worker.entity';

@Injectable()
export class PollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PollerService.name);
  private workerId: string;
  private isShuttingDown = false;
  private activeJobs = new Map<string, Promise<void>>();
  private pollTimer: NodeJS.Timeout | null = null;

  private readonly pollIntervalMs: number;
  private readonly maxConcurrency: number;
  private readonly drainTimeoutMs: number;

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
    this.pollIntervalMs = parseInt(config.get('POLL_INTERVAL_MS', '500'));
    this.maxConcurrency = parseInt(config.get('WORKER_CONCURRENCY', '5'));
    this.drainTimeoutMs = parseInt(config.get('DRAIN_TIMEOUT_MS', '30000'));
  }

  async onModuleInit() {
    // Register this worker
    const worker = await this.workersRepo.save(
      this.workersRepo.create({
        hostname: os.hostname(),
        processId: process.pid,
        maxConcurrency: this.maxConcurrency,
        status: WorkerStatus.HEALTHY,
        lastHeartbeatAt: new Date(),
      }),
    );
    this.workerId = worker.id;
    this.logger.log(`Worker ${this.workerId} registered (concurrency=${this.maxConcurrency})`);

    // Start polling loop
    this.schedulePoll();
  }

  async onModuleDestroy() {
    this.isShuttingDown = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);

    // Mark as draining
    await this.workersRepo.update(this.workerId, { status: WorkerStatus.DRAINING });

    this.logger.log(`Draining ${this.activeJobs.size} in-flight jobs (timeout: ${this.drainTimeoutMs}ms)...`);

    // Wait for all active jobs to complete
    const drainStart = Date.now();
    while (this.activeJobs.size > 0 && Date.now() - drainStart < this.drainTimeoutMs) {
      await Promise.race([...this.activeJobs.values()].map(p => p.catch(() => {})));
    }

    if (this.activeJobs.size > 0) {
      this.logger.warn(`Drain timeout — returning ${this.activeJobs.size} in-flight jobs to queue`);
      // Return jobs to QUEUED
      for (const jobId of this.activeJobs.keys()) {
        await this.jobsRepo.update(jobId, { status: JobStatus.QUEUED, workerId: null, claimedAt: null });
      }
    }

    await this.workersRepo.update(this.workerId, { status: WorkerStatus.OFFLINE, currentJobCount: 0 });
    this.logger.log('Worker graceful shutdown complete');
  }

  private schedulePoll() {
    if (this.isShuttingDown) return;
    this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs);
  }

  private async poll() {
    if (this.isShuttingDown) return;

    try {
      if (this.activeJobs.size < this.maxConcurrency) {
        const claimed = await this.claimNextJob();
        if (claimed) {
          const promise = this.executeJob(claimed.job, claimed.execution)
            .finally(() => this.activeJobs.delete(claimed.job.id));
          this.activeJobs.set(claimed.job.id, promise);
        }
      }
    } catch (err) {
      this.logger.error('Poll error:', err);
    }

    this.schedulePoll();
  }

  private async claimNextJob(): Promise<{ job: Job; execution: JobExecution } | null> {
    // Get active queues this worker should poll
    const queues = await this.queuesRepo.find({ where: { isPaused: false } });
    if (!queues.length) return null;

    for (const queue of queues) {
      const result = await this.dataSource.transaction(async (em) => {
        const rows = await em.query<any[]>(
          `UPDATE jobs SET status = $1, worker_id = $2, claimed_at = NOW(), updated_at = NOW()
           WHERE id = (
             SELECT id FROM jobs
             WHERE queue_id = $3 AND status = $4 AND run_at <= NOW()
             ORDER BY priority DESC, run_at ASC
             FOR UPDATE SKIP LOCKED LIMIT 1
           ) RETURNING *`,
          [JobStatus.CLAIMED, this.workerId, queue.id, JobStatus.QUEUED],
        );

        if (!rows || !rows.length) return null;
        const job = rows[0];

        const execution = await em.save(JobExecution, {
          jobId: job.id,
          workerId: this.workerId,
          attemptNumber: (job.attempts || 0) + 1,
          status: ExecutionStatus.RUNNING,
          startedAt: new Date(),
        });

        await em.update(Job, { id: job.id }, { status: JobStatus.RUNNING });
        return { job, execution };
      });

      if (result) return result;
    }
    return null;
  }

  private async executeJob(job: Job, execution: JobExecution): Promise<void> {
    const startTime = Date.now();
    this.logger.log(`Executing job ${job.id} (attempt ${execution.attemptNumber})`);
    await this.workersRepo.update(this.workerId, { currentJobCount: this.activeJobs.size + 1 });

    await this.appendLog(execution.id, LogLevel.INFO, `Job ${job.id} started (attempt ${execution.attemptNumber})`);

    try {
      let result: any = { message: 'Simulated execution — no handler_url provided' };

      if (job.handlerUrl) {
        await this.appendLog(execution.id, LogLevel.INFO, `Calling handler: ${job.handlerUrl}`);
        const response = await axios.post(job.handlerUrl, {
          jobId: job.id,
          payload: job.payload,
          attempt: execution.attemptNumber,
        }, { timeout: 30000 });
        result = response.data;
        await this.appendLog(execution.id, LogLevel.INFO, `Handler responded with status ${response.status}`);
      } else {
        // Simulate work: 100ms delay
        await new Promise(r => setTimeout(r, 100));
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
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      const errMessage = error?.message || 'Unknown error';
      const errStack = error?.stack;

      await this.appendLog(execution.id, LogLevel.ERROR, `Job failed: ${errMessage}`);

      // Get retry policy
      const queue = await this.queuesRepo.findOne({
        where: { id: job.queueId },
        relations: ['retryPolicy'],
      });
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
        // Send to DLQ
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
        // Schedule retry with exponential backoff
        const baseDelay = queue?.retryPolicy?.baseDelayMs ?? 2000;
        const delayMs = baseDelay * Math.pow(2, newAttempts - 1);
        const runAt = new Date(Date.now() + delayMs);

        await this.jobsRepo.update(job.id, {
          status: JobStatus.SCHEDULED,
          attempts: newAttempts,
          runAt,
          workerId: null,
          claimedAt: null,
        });
        this.logger.log(`Job ${job.id} scheduled for retry #${newAttempts + 1} at ${runAt.toISOString()}`);
      }
    } finally {
      await this.workersRepo.update(this.workerId, { currentJobCount: Math.max(0, this.activeJobs.size - 1) });
    }
  }

  private async appendLog(executionId: string, level: LogLevel, message: string) {
    await this.logsRepo.save(
      this.logsRepo.create({ jobExecutionId: executionId, timestamp: new Date(), level, message }),
    );
  }
}
