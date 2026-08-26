import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DlqController } from './dlq.controller';
import { DlqService } from './dlq.service';
import { DeadLetterEntry } from './entities/dead-letter-entry.entity';
import { Job } from '../jobs/entities/job.entity';
import { Queue } from '../queues/entities/queue.entity';
import { EventsModule } from '../events/events.module';
import { BullModule } from '../queues/bull.module';

@Module({
  imports: [TypeOrmModule.forFeature([DeadLetterEntry, Job, Queue]), EventsModule, BullModule],
  controllers: [DlqController],
  providers: [DlqService],
  exports: [DlqService],
})
export class DlqModule {}
