import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { JobExecution } from './job-execution.entity';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

@Entity('job_logs')
@Index(['jobExecutionId', 'timestamp'])
export class JobLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'job_execution_id' })
  jobExecutionId: string;

  @Column({ type: 'timestamptz' })
  timestamp: Date;

  @Column({ type: 'enum', enum: LogLevel, default: LogLevel.INFO })
  level: LogLevel;

  @Column({ type: 'text' })
  message: string;

  @ManyToOne(() => JobExecution, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_execution_id' })
  jobExecution: JobExecution;
}
