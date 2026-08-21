import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Queue } from '../../queues/entities/queue.entity';
import { JobExecution } from './job-execution.entity';

export enum JobType {
  IMMEDIATE = 'immediate',
  DELAYED = 'delayed',
  SCHEDULED = 'scheduled',
  CRON = 'cron',
  BATCH = 'batch',
}

export enum JobStatus {
  QUEUED = 'queued',
  SCHEDULED = 'scheduled',
  CLAIMED = 'claimed',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  DLQ = 'dlq',
}

@Entity('jobs')
@Index(['queueId', 'status', 'runAt']) // Critical index for atomic claim query
@Index(['queueId', 'idempotencyKey'], { unique: true, where: '"idempotency_key" IS NOT NULL' })
export class Job {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'queue_id' })
  queueId: string;

  @ApiProperty({ enum: JobType })
  @Column({ type: 'enum', enum: JobType })
  type: JobType;

  @ApiProperty({ enum: JobStatus })
  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.QUEUED })
  status: JobStatus;

  /** Arbitrary JSON payload — opaque to Aurora, passed to handler */
  @ApiProperty()
  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, any>;

  /** Optional webhook URL to call when executing this job */
  @Column({ name: 'handler_url', nullable: true })
  handlerUrl: string | null;

  /** For deduplication — unique per queue when set */
  @Column({ name: 'idempotency_key', nullable: true })
  idempotencyKey: string | null;

  /** Higher = executed first within a queue */
  @ApiProperty()
  @Column({ default: 0 })
  priority: number;

  /** When this job should be executed */
  @ApiProperty()
  @Column({ name: 'run_at', type: 'timestamptz', default: () => 'NOW()' })
  runAt: Date;

  /** Current execution attempt count */
  @ApiProperty()
  @Column({ default: 0 })
  attempts: number;

  /** Maximum attempts (overrides queue default if set) */
  @Column({ type: 'int', name: 'max_attempts', nullable: true })
  maxAttempts: number | null;

  /** Cron expression (for cron-type jobs) */
  @Column({ name: 'cron_expression', nullable: true })
  cronExpression: string | null;

  /** For batch jobs — parent batch reference */
  @Column({ name: 'batch_id', nullable: true })
  batchId: string | null;

  /** Worker that currently holds this job */
  @Column({ name: 'worker_id', nullable: true })
  workerId: string | null;

  /** When the job was claimed */
  @Column({ name: 'claimed_at', nullable: true, type: 'timestamptz' })
  claimedAt: Date | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Queue, (q) => q.jobs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'queue_id' })
  queue: Queue;

  @OneToMany(() => JobExecution, (e) => e.job)
  executions: JobExecution[];
}
