import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';
import { Worker } from './entities/worker.entity';
import { WorkerHeartbeat } from './entities/worker-heartbeat.entity';
import { Job } from '../jobs/entities/job.entity';
import { EventsModule } from '../events/events.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Worker, WorkerHeartbeat, Job]),
    EventsModule,
    JobsModule,
  ],
  controllers: [WorkersController],
  providers: [WorkersService],
  exports: [WorkersService],
})
export class WorkersModule {}
