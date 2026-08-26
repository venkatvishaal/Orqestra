import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { Queue } from './entities/queue.entity';
import { RetryPolicy, RetryStrategy } from './entities/retry-policy.entity';
import { Job, JobStatus } from '../jobs/entities/job.entity';
import { EventsGateway } from '../events/events.gateway';
import { CreateQueueDto } from './dto/create-queue.dto';
import { UpdateQueueDto } from './dto/update-queue.dto';
import { REDIS_CLIENT } from '../redis/redis.module';

export interface QueueStats {
  queueId: string;
  name: string;
  isPaused: boolean;
  depth: number;        // queued
  inFlight: number;     // claimed + running
  completed: number;
  failed: number;
  dlq: number;
  successRate: number;  // 0-100
  updatedAt: Date;
}

@Injectable()
export class QueuesService {
  private readonly logger = new Logger(QueuesService.name);

  constructor(
    @InjectRepository(Queue)
    private readonly queuesRepo: Repository<Queue>,
    @InjectRepository(RetryPolicy)
    private readonly retryPoliciesRepo: Repository<RetryPolicy>,
    @InjectRepository(Job)
    private readonly jobsRepo: Repository<Job>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async create(dto: CreateQueueDto): Promise<Queue> {
    const existing = await this.queuesRepo.findOne({
      where: { projectId: dto.projectId, name: dto.name },
    });
    if (existing) throw new ConflictException(`Queue "${dto.name}" already exists in this project`);

    const queue = await this.queuesRepo.save(
      this.queuesRepo.create({
        projectId: dto.projectId,
        name: dto.name,
        concurrencyLimit: dto.concurrencyLimit ?? 5,
        priority: dto.priority ?? 5,
        rateLimitPerSec: dto.rateLimitPerSec ?? null,
        description: dto.description,
      }),
    );

    // Create default retry policy
    await this.retryPoliciesRepo.save(
      this.retryPoliciesRepo.create({
        queueId: queue.id,
        strategy: dto.retryPolicy?.strategy ?? RetryStrategy.EXPONENTIAL,
        baseDelayMs: dto.retryPolicy?.baseDelayMs ?? 2000,
        maxAttempts: dto.retryPolicy?.maxAttempts ?? 3,
        maxDelayMs: dto.retryPolicy?.maxDelayMs ?? 86400000,
      }),
    );

    return this.findOne(queue.id);
  }

  async findAll(projectId: string): Promise<Queue[]> {
    return this.queuesRepo.find({
      where: { projectId },
      relations: ['retryPolicy'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Queue> {
    const queue = await this.queuesRepo.findOne({
      where: { id },
      relations: ['retryPolicy'],
    });
    if (!queue) throw new NotFoundException(`Queue ${id} not found`);
    return queue;
  }

  async update(id: string, dto: UpdateQueueDto): Promise<Queue> {
    const queue = await this.findOne(id);
    Object.assign(queue, dto);
    const saved = await this.queuesRepo.save(queue);

    if (dto.retryPolicy) {
      await this.retryPoliciesRepo.update({ queueId: id }, dto.retryPolicy);
    }

    return saved;
  }

  async pause(id: string): Promise<Queue> {
    const queue = await this.findOne(id);
    queue.isPaused = true;
    const saved = await this.queuesRepo.save(queue);
    this.eventsGateway.emitQueueEvent('queue.paused', saved);
    this.logger.log(`Queue ${id} paused`);
    return saved;
  }

  async resume(id: string): Promise<Queue> {
    const queue = await this.findOne(id);
    queue.isPaused = false;
    const saved = await this.queuesRepo.save(queue);
    this.eventsGateway.emitQueueEvent('queue.resumed', saved);
    this.logger.log(`Queue ${id} resumed`);
    return saved;
  }

  async getStats(id: string): Promise<QueueStats> {
    const cacheKey = `queue:stats:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as QueueStats;

    const queue = await this.findOne(id);

    // Single aggregation query instead of 6 separate COUNTs
    const rows: Array<{ status: string; count: string }> = await this.jobsRepo
      .createQueryBuilder('job')
      .select('job.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('job.queueId = :id', { id })
      .groupBy('job.status')
      .getRawMany();

    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.status] = parseInt(row.count, 10);
    }

    const depth = counts[JobStatus.QUEUED] ?? 0;
    const claimed = counts[JobStatus.CLAIMED] ?? 0;
    const running = counts[JobStatus.RUNNING] ?? 0;
    const completed = counts[JobStatus.COMPLETED] ?? 0;
    const failed = counts[JobStatus.FAILED] ?? 0;
    const dlq = counts[JobStatus.DLQ] ?? 0;

    const total = completed + failed;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 100;

    const stats: QueueStats = {
      queueId: id,
      name: queue.name,
      isPaused: queue.isPaused,
      depth,
      inFlight: claimed + running,
      completed,
      failed,
      dlq,
      successRate,
      updatedAt: new Date(),
    };

    // Cache for 5 seconds
    await this.redis.setex(cacheKey, 5, JSON.stringify(stats));
    return stats;
  }
}
