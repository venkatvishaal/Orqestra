import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Project } from '../../projects/entities/project.entity';
import { RetryPolicy } from './retry-policy.entity';
import { Job } from '../../jobs/entities/job.entity';

export enum QueuePriority {
  LOW = 1,
  NORMAL = 5,
  HIGH = 10,
  CRITICAL = 20,
}

@Entity('queues')
@Index(['projectId', 'name'], { unique: true })
export class Queue {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id' })
  projectId: string;

  @ApiProperty()
  @Column()
  name: string;

  @ApiProperty()
  @Column({ default: 5, name: 'concurrency_limit' })
  concurrencyLimit: number;

  @ApiProperty()
  @Column({ default: 5, name: 'priority' })
  priority: number;

  @ApiProperty()
  @Column({ default: false, name: 'is_paused' })
  isPaused: boolean;

  @ApiProperty()
  @Column({ nullable: true, name: 'rate_limit_per_sec' })
  rateLimitPerSec: number | null;

  @ApiProperty()
  @Column({ nullable: true })
  description: string | null;

  @ManyToOne(() => Project, (p) => p.queues, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @OneToOne(() => RetryPolicy, (rp) => rp.queue, { cascade: true, eager: true })
  retryPolicy: RetryPolicy;

  @OneToMany(() => Job, (j) => j.queue)
  jobs: Job[];

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
