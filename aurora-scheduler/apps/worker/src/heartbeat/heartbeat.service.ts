import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { Worker, WorkerStatus } from '../../../api/src/workers/entities/worker.entity';
import { WorkerHeartbeat } from '../../../api/src/workers/entities/worker-heartbeat.entity';
import { PollerService } from '../poller/poller.service';

@Injectable()
export class HeartbeatService implements OnModuleInit {
  private readonly logger = new Logger(HeartbeatService.name);
  private heartbeatTimer: NodeJS.Timeout | null = null;

  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTtlMs: number;
  private redis: Redis;

  constructor(
    @InjectRepository(Worker) private readonly workersRepo: Repository<Worker>,
    @InjectRepository(WorkerHeartbeat) private readonly heartbeatsRepo: Repository<WorkerHeartbeat>,
    private readonly config: ConfigService,
    private readonly pollerService: PollerService,
  ) {
    this.heartbeatIntervalMs = parseInt(config.get('HEARTBEAT_INTERVAL_MS', '5000'));
    this.heartbeatTtlMs = parseInt(config.get('HEARTBEAT_TTL_MS', '15000'));
    this.redis = new Redis(config.get<string>('REDIS_URL')!);
  }

  onModuleInit() {
    this.scheduleHeartbeat();
  }

  private scheduleHeartbeat() {
    this.heartbeatTimer = setTimeout(() => this.sendHeartbeat(), this.heartbeatIntervalMs);
  }

  private async sendHeartbeat() {
    try {
      const workerId = (this.pollerService as any).workerId;
      if (!workerId) {
        this.scheduleHeartbeat();
        return;
      }

      const ttlSeconds = Math.ceil(this.heartbeatTtlMs / 1000);
      // Write TTL key in Redis — API monitors for missing keys
      await this.redis.setex(`heartbeat:${workerId}`, ttlSeconds, Date.now().toString());

      // Update DB
      const activeJobs = (this.pollerService as any).activeJobs?.size ?? 0;
      await this.workersRepo.update(workerId, {
        lastHeartbeatAt: new Date(),
        currentJobCount: activeJobs,
        status: WorkerStatus.HEALTHY,
      });

      await this.heartbeatsRepo.save(
        this.heartbeatsRepo.create({
          workerId,
          timestamp: new Date(),
          currentJobCount: activeJobs,
        }),
      );
    } catch (err) {
      this.logger.error('Heartbeat failed:', err);
    }

    this.scheduleHeartbeat();
  }
}
