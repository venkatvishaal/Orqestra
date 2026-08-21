import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Worker, WorkerStatus } from './entities/worker.entity';
import { WorkerHeartbeat } from './entities/worker-heartbeat.entity';
import { EventsGateway } from '../events/events.gateway';
import { JobClaimService } from '../jobs/job-claim.service';

const HEARTBEAT_TIMEOUT_MS = parseInt(process.env.HEARTBEAT_TTL_MS ?? '15000');

@Injectable()
export class WorkersService {
  private readonly logger = new Logger(WorkersService.name);

  constructor(
    @InjectRepository(Worker)
    private readonly workersRepo: Repository<Worker>,
    @InjectRepository(WorkerHeartbeat)
    private readonly heartbeatsRepo: Repository<WorkerHeartbeat>,
    private readonly eventsGateway: EventsGateway,
    private readonly jobClaimService: JobClaimService,
  ) {}

  async register(data: {
    hostname: string;
    processId?: number;
    maxConcurrency?: number;
    queueIds?: string[];
  }): Promise<Worker> {
    const worker = await this.workersRepo.save(
      this.workersRepo.create({
        hostname: data.hostname,
        processId: data.processId,
        maxConcurrency: data.maxConcurrency ?? 5,
        queueIds: data.queueIds ?? [],
        status: WorkerStatus.HEALTHY,
        lastHeartbeatAt: new Date(),
      }),
    );
    this.eventsGateway.emitWorkerEvent('worker.registered', worker);
    this.logger.log(`Worker registered: ${worker.id} on ${worker.hostname}`);
    return worker;
  }

  async heartbeat(
    workerId: string,
    data: { currentJobCount: number; cpuPercent?: number; memMb?: number },
  ): Promise<void> {
    const worker = await this.workersRepo.findOne({ where: { id: workerId } });
    if (!worker) throw new NotFoundException(`Worker ${workerId} not found`);

    await this.workersRepo.update(workerId, {
      lastHeartbeatAt: new Date(),
      currentJobCount: data.currentJobCount,
      status: WorkerStatus.HEALTHY,
    });

    await this.heartbeatsRepo.save(
      this.heartbeatsRepo.create({
        workerId,
        timestamp: new Date(),
        currentJobCount: data.currentJobCount,
        cpuPercent: data.cpuPercent,
        memMb: data.memMb,
      }),
    );

    this.eventsGateway.emitWorkerEvent('worker.heartbeat', {
      id: workerId,
      ...data,
    });
  }

  async deregister(workerId: string): Promise<void> {
    await this.workersRepo.update(workerId, {
      status: WorkerStatus.OFFLINE,
      currentJobCount: 0,
    });
    this.eventsGateway.emitWorkerEvent('worker.offline', { id: workerId });
    this.logger.log(`Worker deregistered: ${workerId}`);
  }

  async findAll(): Promise<Worker[]> {
    return this.workersRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Worker> {
    const worker = await this.workersRepo.findOne({ where: { id } });
    if (!worker) throw new NotFoundException(`Worker ${id} not found`);
    return worker;
  }

  async getHeartbeats(workerId: string): Promise<WorkerHeartbeat[]> {
    return this.heartbeatsRepo.find({
      where: { workerId },
      order: { timestamp: 'DESC' },
      take: 100,
    });
  }

  /**
   * Runs every 5 seconds: detect workers that have missed 3+ heartbeats,
   * mark them unhealthy, and reclaim their orphaned jobs.
   */
  @Cron('*/5 * * * * *')
  async detectStaleWorkers() {
    const staleThreshold = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);

    const staleWorkers = await this.workersRepo.find({
      where: {
        status: WorkerStatus.HEALTHY,
        lastHeartbeatAt: LessThan(staleThreshold),
      },
    });

    if (!staleWorkers.length) return;

    const staleIds = staleWorkers.map((w) => w.id);

    // Mark as unhealthy
    await this.workersRepo.update(staleIds, { status: WorkerStatus.UNHEALTHY });

    // Reclaim their jobs
    const reclaimed = await this.jobClaimService.reclaimStaleJobs(staleIds);

    for (const worker of staleWorkers) {
      this.eventsGateway.emitWorkerEvent('worker.unhealthy', worker);
      this.logger.warn(
        `Worker ${worker.id} (${worker.hostname}) marked unhealthy — missed heartbeat`,
      );
    }

    if (reclaimed > 0) {
      this.logger.warn(`Reclaimed ${reclaimed} orphaned jobs from stale workers`);
    }
  }

  /**
   * Prune heartbeat rows older than 24 hours (per PRD data retention policy).
   */
  @Cron('0 * * * *') // Hourly
  async pruneOldHeartbeats() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await this.heartbeatsRepo.delete({ timestamp: LessThan(cutoff) });
    if (result.affected) {
      this.logger.log(`Pruned ${result.affected} old heartbeat records`);
    }
  }
}
