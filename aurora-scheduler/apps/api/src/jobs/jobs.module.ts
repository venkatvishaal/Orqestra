import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { Job } from './entities/job.entity';
import { JobExecution } from './entities/job-execution.entity';
import { JobLog } from './entities/job-log.entity';
import { ScheduledJob } from './entities/scheduled-job.entity';
import { BatchJob } from './entities/batch-job.entity';
import { Queue } from '../queues/entities/queue.entity';
import { RetryPolicy } from '../queues/entities/retry-policy.entity';
import { DeadLetterEntry } from '../dlq/entities/dead-letter-entry.entity';
import { EventsModule } from '../events/events.module';
import { BullModule } from '../queues/bull.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Job,
      JobExecution,
      JobLog,
      ScheduledJob,
      BatchJob,
      Queue,
      RetryPolicy,
      DeadLetterEntry,
    ]),
    EventsModule,
    BullModule,
  ],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
