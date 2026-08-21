import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { WorkerHeartbeat } from './worker-heartbeat.entity';

export enum WorkerStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  DRAINING = 'draining',
  OFFLINE = 'offline',
}

@Entity('workers')
export class Worker {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column()
  hostname: string;

  @ApiProperty()
  @Column({ name: 'process_id', nullable: true })
  processId: number | null;

  @ApiProperty({ enum: WorkerStatus })
  @Column({ type: 'enum', enum: WorkerStatus, default: WorkerStatus.HEALTHY })
  status: WorkerStatus;

  @ApiProperty()
  @Column({ name: 'last_heartbeat_at', type: 'timestamptz', nullable: true })
  lastHeartbeatAt: Date | null;

  @ApiProperty()
  @Column({ name: 'current_job_count', default: 0 })
  currentJobCount: number;

  @ApiProperty()
  @Column({ name: 'max_concurrency', default: 5 })
  maxConcurrency: number;

  /** Comma-separated queue IDs this worker is polling */
  @Column({ name: 'queue_ids', type: 'simple-array', nullable: true })
  queueIds: string[];

  @OneToMany(() => WorkerHeartbeat, (h) => h.worker, { cascade: true })
  heartbeats: WorkerHeartbeat[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
