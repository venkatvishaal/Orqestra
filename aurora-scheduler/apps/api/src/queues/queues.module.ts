import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueuesController } from './queues.controller';
import { QueuesService } from './queues.service';
import { Queue } from './entities/queue.entity';
import { RetryPolicy } from './entities/retry-policy.entity';
import { Job } from '../jobs/entities/job.entity';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Queue, RetryPolicy, Job]),
    EventsModule,
  ],
  controllers: [QueuesController],
  providers: [QueuesService],
  exports: [QueuesService],
})
export class QueuesModule {}
