import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Queue } from './queue.entity';

export enum RetryStrategy {
  FIXED = 'fixed',
  LINEAR = 'linear',
  EXPONENTIAL = 'exponential',
}

@Entity('retry_policies')
export class RetryPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'queue_id', unique: true })
  queueId: string;

  @ApiProperty({ enum: RetryStrategy })
  @Column({
    type: 'enum',
    enum: RetryStrategy,
    default: RetryStrategy.EXPONENTIAL,
  })
  strategy: RetryStrategy;

  /** Base delay in milliseconds */
  @ApiProperty()
  @Column({ default: 2000, name: 'base_delay_ms' })
  baseDelayMs: number;

  @ApiProperty()
  @Column({ default: 3, name: 'max_attempts' })
  maxAttempts: number;

  /** Maximum delay cap in ms (prevents exponential from going to infinity) */
  @ApiProperty()
  @Column({ default: 86400000, name: 'max_delay_ms' }) // 24h default cap
  maxDelayMs: number;

  @OneToOne(() => Queue, (q) => q.retryPolicy, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'queue_id' })
  queue: Queue;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Calculate the next retry delay in ms for the given attempt number (1-indexed).
   * attempt=1 → first retry, attempt=2 → second retry, etc.
   */
  calculateDelay(attempt: number): number {
    let delay: number;
    switch (this.strategy) {
      case RetryStrategy.FIXED:
        delay = this.baseDelayMs;
        break;
      case RetryStrategy.LINEAR:
        delay = this.baseDelayMs * attempt;
        break;
      case RetryStrategy.EXPONENTIAL:
      default:
        delay = this.baseDelayMs * Math.pow(2, attempt - 1);
        break;
    }
    return Math.min(delay, this.maxDelayMs);
  }
}
