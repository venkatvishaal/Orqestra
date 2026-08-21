import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeadLetterEntry } from './entities/dead-letter-entry.entity';
import { Job, JobStatus } from '../jobs/entities/job.entity';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class DlqService {
  constructor(
    @InjectRepository(DeadLetterEntry)
    private readonly dlqRepo: Repository<DeadLetterEntry>,
    @InjectRepository(Job)
    private readonly jobsRepo: Repository<Job>,
    private readonly eventsGateway: EventsGateway,
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
