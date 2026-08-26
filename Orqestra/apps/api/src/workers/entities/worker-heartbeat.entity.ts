import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Worker } from './worker.entity';

@Entity('worker_heartbeats')
@Index(['workerId', 'timestamp'])
export class WorkerHeartbeat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'worker_id' })
  workerId: string;

  @Column({ type: 'timestamptz' })
  timestamp: Date;

  @Column({ name: 'current_job_count', default: 0 })
  currentJobCount: number;

  @Column({ name: 'cpu_percent', nullable: true, type: 'float' })
  cpuPercent: number | null;

  @Column({ name: 'mem_mb', nullable: true, type: 'float' })
  memMb: number | null;

  @ManyToOne(() => Worker, (w) => w.heartbeats, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'worker_id' })
  worker: Worker;
}
