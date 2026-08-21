import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Job } from '../../jobs/entities/job.entity';

@Entity('dead_letter_entries')
export class DeadLetterEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'job_id', unique: true })
  jobId: string;

  @Column({ name: 'queue_id' })
  queueId: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ name: 'final_error', nullable: true, type: 'text' })
  finalError: string | null;

  @Column({ name: 'total_attempts' })
  totalAttempts: number;

  @Column({ default: false, name: 'is_requeued' })
  isRequeued: boolean;

  @Column({ name: 'requeued_at', nullable: true, type: 'timestamptz' })
  requeuedAt: Date | null;

  @OneToOne(() => Job, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job: Job;

  @CreateDateColumn({ name: 'moved_at' })
  movedAt: Date;
}
