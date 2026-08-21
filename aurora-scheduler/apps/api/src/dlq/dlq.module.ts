import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DlqController } from './dlq.controller';
import { DlqService } from './dlq.service';
import { DeadLetterEntry } from './entities/dead-letter-entry.entity';
import { Job } from '../jobs/entities/job.entity';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [TypeOrmModule.forFeature([DeadLetterEntry, Job]), EventsModule],
  controllers: [DlqController],
  providers: [DlqService],
  exports: [DlqService],
})
export class DlqModule {}
