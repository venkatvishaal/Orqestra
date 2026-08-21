import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PollerService } from './poller.service';
import { Job } from '../../../api/src/jobs/entities/job.entity';
import { JobExecution } from '../../../api/src/jobs/entities/job-execution.entity';
import { JobLog } from '../../../api/src/jobs/entities/job-log.entity';
import { Queue } from '../../../api/src/queues/entities/queue.entity';
import { RetryPolicy } from '../../../api/src/queues/entities/retry-policy.entity';
import { Worker } from '../../../api/src/workers/entities/worker.entity';
import { WorkerHeartbeat } from '../../../api/src/workers/entities/worker-heartbeat.entity';
import { DeadLetterEntry } from '../../../api/src/dlq/entities/dead-letter-entry.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Job, JobExecution, JobLog, Queue, RetryPolicy, Worker, WorkerHeartbeat, DeadLetterEntry])],
  providers: [PollerService],
  exports: [PollerService],
})
export class PollerModule {}
