import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Queue } from '../../queues/entities/queue.entity';

export enum BatchStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  PARTIALLY_FAILED = 'partially_failed',
  FAILED = 'failed',
}

@Entity('batch_jobs')
export class BatchJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'queue_id' })
  queueId: string;

  @Column({ name: 'total_jobs' })
  totalJobs: number;

  @Column({ name: 'completed_jobs', default: 0 })
  completedJobs: number;

  @Column({ name: 'failed_jobs', default: 0 })
  failedJobs: number;

  @Column({ name: 'pending_jobs' })
  pendingJobs: number;

  @Column({ type: 'enum', enum: BatchStatus, default: BatchStatus.PENDING })
  status: BatchStatus;

  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  @ManyToOne(() => Queue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'queue_id' })
  queue: Queue;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
