import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { PollerModule } from './poller/poller.module';
import { HeartbeatModule } from './heartbeat/heartbeat.module';

// Import only the entities this worker needs
import { Job } from '../../api/src/jobs/entities/job.entity';
import { JobExecution } from '../../api/src/jobs/entities/job-execution.entity';
import { JobLog } from '../../api/src/jobs/entities/job-log.entity';
import { Queue } from '../../api/src/queues/entities/queue.entity';
import { RetryPolicy } from '../../api/src/queues/entities/retry-policy.entity';
import { Worker } from '../../api/src/workers/entities/worker.entity';
import { WorkerHeartbeat } from '../../api/src/workers/entities/worker-heartbeat.entity';
import { DeadLetterEntry } from '../../api/src/dlq/entities/dead-letter-entry.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: 'info',
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
      },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [Job, JobExecution, JobLog, Queue, RetryPolicy, Worker, WorkerHeartbeat, DeadLetterEntry],
        synchronize: false, // Schema managed by API
        ssl: config.get('NODE_ENV') === 'production' ? { rejectUnauthorized: false } : false,
      }),
    }),
    ScheduleModule.forRoot(),
    PollerModule,
    HeartbeatModule,
  ],
})
export class WorkerAppModule {}
