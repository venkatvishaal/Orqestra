import { Module, Global, Injectable, Inject } from '@nestjs/common';
import { Queue as BullQueue } from 'bullmq';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

export const BULL_QUEUE_FACTORY = 'BULL_QUEUE_FACTORY';

/**
 * BullQueueFactory
 *
 * Lazily creates and caches a BullMQ Queue instance per Aurora queue name.
 * BullMQ requires one Queue object per logical queue to publish jobs, but
 * we don't know queue names at startup — they're created dynamically.
 *
 * We share the existing ioredis client from RedisModule to avoid opening
 * a second connection to Redis.
 */
@Injectable()
export class BullQueueFactory {
  private readonly queues = new Map<string, BullQueue>();

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Returns an existing BullMQ Queue for this name, or creates one.
   * @param queueName  The Aurora queue's `name` field (used as BullMQ queue name).
   */
  getOrCreate(queueName: string): BullQueue {
    if (!this.queues.has(queueName)) {
      const queue = new BullQueue(queueName, {
        connection: this.redis,
        defaultJobOptions: {
          removeOnComplete: { count: 500 }, // keep last 500 completed jobs in Redis
          removeOnFail: { count: 200 },
        },
      });
      this.queues.set(queueName, queue);
    }
    return this.queues.get(queueName)!;
  }

  /** Gracefully close all open queue connections */
  async closeAll(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.queues.clear();
  }
}

@Global()
@Module({
  providers: [BullQueueFactory],
  exports: [BullQueueFactory],
})
export class BullModule {}
