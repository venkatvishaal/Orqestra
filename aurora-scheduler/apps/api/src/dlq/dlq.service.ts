import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeadLetterEntry } from './entities/dead-letter-entry.entity';
import { Job, JobStatus } from '../jobs/entities/job.entity';
import { Queue } from '../queues/entities/queue.entity';
import { EventsGateway } from '../events/events.gateway';
import { BullQueueFactory } from '../queues/bull.module';

@Injectable()
export class DlqService {
  constructor(
    @InjectRepository(DeadLetterEntry)
    private readonly dlqRepo: Repository<DeadLetterEntry>,
    @InjectRepository(Job)
    private readonly jobsRepo: Repository<Job>,
    @InjectRepository(Queue)
    private readonly queuesRepo: Repository<Queue>,
    private readonly eventsGateway: EventsGateway,
    private readonly bullFactory: BullQueueFactory,
  ) {}

  async findAll(queueId?: string, page = 1, limit = 20) {
    const qb = this.dlqRepo
      .createQueryBuilder('dlq')
      .leftJoinAndSelect('dlq.job', 'job')
      .where('dlq.isRequeued = false')
      .orderBy('dlq.movedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (queueId) qb.andWhere('dlq.queueId = :queueId', { queueId });

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async requeue(id: string): Promise<Job> {
    const entry = await this.dlqRepo.findOne({
      where: { id },
      relations: ['job'],
    });
    if (!entry) throw new NotFoundException(`DLQ entry ${id} not found`);
    if (entry.isRequeued) {
      const job = await this.jobsRepo.findOne({ where: { id: entry.jobId } });
      return job!;
    }

    // Reset job to queued with fresh attempt counter
    await this.jobsRepo.update(entry.jobId, {
      status: JobStatus.QUEUED,
      attempts: 0,
      runAt: new Date(),
      workerId: null,
      claimedAt: null,
    });

    await this.dlqRepo.update(id, {
      isRequeued: true,
      requeuedAt: new Date(),
    });

    const job = await this.jobsRepo.findOne({ where: { id: entry.jobId } });

    // Re-push to BullMQ so the worker picks it up
    const queue = await this.queuesRepo.findOne({ where: { id: entry.queueId } });
    if (queue && job) {
      const bullQueue = this.bullFactory.getOrCreate(queue.name);
      await bullQueue.add(job.type, { jobId: job.id }, {
        jobId: job.id,
        priority: job.priority,
        attempts: job.maxAttempts ?? 3,
        backoff: { type: 'exponential', delay: 2000 },
      }).catch(() => {}); // non-fatal if Redis is temporarily unavailable
    }

    this.eventsGateway.emitJobEvent('job.retried', job);
    return job!;
  }

  async purge(id: string): Promise<void> {
    const entry = await this.dlqRepo.findOne({ where: { id } });
    if (!entry) throw new NotFoundException(`DLQ entry ${id} not found`);
    await this.dlqRepo.delete(id);
    await this.jobsRepo.delete(entry.jobId);
  }
}
