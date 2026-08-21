import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Job } from './job.entity';
import { Worker } from '../../workers/entities/worker.entity';

export enum ExecutionStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('job_executions')
export class JobExecution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'job_id' })
  jobId: string;

  @Column({ name: 'worker_id', nullable: true })
  workerId: string | null;

  @Column({ name: 'attempt_number' })
  attemptNumber: number;

  @Column({
    type: 'enum',
    enum: ExecutionStatus,
    default: ExecutionStatus.RUNNING,
  })
  status: ExecutionStatus;

  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, any> | null;

  @Column({ name: 'error_message', nullable: true, type: 'text' })
  errorMessage: string | null;

  @Column({ name: 'error_stack', nullable: true, type: 'text' })
  errorStack: string | null;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'finished_at', nullable: true, type: 'timestamptz' })
  finishedAt: Date | null;

  /** Duration in milliseconds */
  @Column({ name: 'duration_ms', nullable: true })
  durationMs: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Job, (j) => j.executions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job: Job;

  @ManyToOne(() => Worker, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'worker_id' })
  worker: Worker;
}
