import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Queue } from '../../queues/entities/queue.entity';

@Entity('scheduled_jobs')
export class ScheduledJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'queue_id' })
  queueId: string;

  @Column({ name: 'cron_expression' })
  cronExpression: string;

  /** The job payload/template to materialize on each run */
  @Column({ name: 'job_template', type: 'jsonb' })
  jobTemplate: {
    payload: Record<string, any>;
    handlerUrl?: string;
    priority?: number;
    maxAttempts?: number;
  };

  @Column({ name: 'next_run_at', type: 'timestamptz' })
  nextRunAt: Date;

  @Column({ name: 'last_materialized_job_id', nullable: true })
  lastMaterializedJobId: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @ManyToOne(() => Queue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'queue_id' })
  queue: Queue;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
