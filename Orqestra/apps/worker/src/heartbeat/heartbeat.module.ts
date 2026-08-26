import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HeartbeatService } from './heartbeat.service';
import { Worker } from '../../../api/src/workers/entities/worker.entity';
import { WorkerHeartbeat } from '../../../api/src/workers/entities/worker-heartbeat.entity';
import { PollerModule } from '../poller/poller.module';

@Module({
  imports: [TypeOrmModule.forFeature([Worker, WorkerHeartbeat]), PollerModule],
  providers: [HeartbeatService],
})
export class HeartbeatModule {}
