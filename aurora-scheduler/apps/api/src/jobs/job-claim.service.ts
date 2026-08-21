import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Job, JobStatus } from './entities/job.entity';
import { JobExecution, ExecutionStatus } from './entities/job-execution.entity';

export interface ClaimedJob {
  job: Job;
  execution: JobExecution;
}

@Injectable()
export class JobClaimService {
  private readonly logger = new Logger(JobClaimService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Atomically claim the next eligible job from a queue.
   *
   * Uses PostgreSQL's SELECT ... FOR UPDATE SKIP LOCKED within a single
   * transaction to guarantee each job is claimed by exactly one worker —
   * even under high concurrency with many workers polling simultaneously.
   *
   * This is the core of Aurora's "no duplicate execution" guarantee.
   */
  async claimNext(
    queueId: string,
    workerId: string,
    currentlyRunning: number,
    concurrencyLimit: number,
  ): Promise<ClaimedJob | null> {
    if (currentlyRunning >= concurrencyLimit) {
      this.logger.debug(
        `Worker ${workerId} at concurrency limit ${concurrencyLimit}, skipping claim`,
      );
      return null;
    }

    return this.dataSource.transaction(async (em) => {
      // Atomic claim: find + lock + update in one query
      const result = await em.query<Job[]>(
        `
        UPDATE jobs
        SET
          status = $1,
          worker_id = $2,
          claimed_at = NOW(),
          updated_at = NOW()
        WHERE id = (
          SELECT id
          FROM jobs
          WHERE queue_id = $3
            AND status = $4
            AND run_at <= NOW()
          ORDER BY priority DESC, run_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        RETURNING *
        `,
        [JobStatus.CLAIMED, workerId, queueId, JobStatus.QUEUED],
      );

      if (!result || result.length === 0) return null;

      const job = result[0] as Job;

      // Create execution record
      const execution = em.create(JobExecution, {
        jobId: job.id,
        workerId,
        attemptNumber: (job.attempts || 0) + 1,
        status: ExecutionStatus.RUNNING,
        startedAt: new Date(),
      });
      await em.save(JobExecution, execution);

      // Transition job to Running
      await em.update(Job, { id: job.id }, { status: JobStatus.RUNNING });
      job.status = JobStatus.RUNNING;

      this.logger.log(
        `Job ${job.id} claimed by worker ${workerId} (attempt ${execution.attemptNumber})`,
      );

      return { job, execution };
    });
  }

  /**
   * Reclaim jobs from stale/crashed workers that have missed heartbeats.
   * Called periodically by the worker health monitor.
   */
  async reclaimStaleJobs(staleWorkerIds: string[]): Promise<number> {
    if (!staleWorkerIds.length) return 0;

    const result = await this.dataSource.query(
      `
      UPDATE jobs
      SET
        status = $1,
        worker_id = NULL,
        claimed_at = NULL,
        updated_at = NOW()
      WHERE worker_id = ANY($2)
        AND status IN ($3, $4)
      RETURNING id
      `,
      [JobStatus.QUEUED, staleWorkerIds, JobStatus.CLAIMED, JobStatus.RUNNING],
    );

    const count = result.length;
    if (count > 0) {
      this.logger.warn(
        `Reclaimed ${count} jobs from stale workers: ${staleWorkerIds.join(', ')}`,
      );
    }
    return count;
  }
}
