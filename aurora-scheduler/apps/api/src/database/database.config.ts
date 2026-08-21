import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { OrganizationMember } from '../organizations/entities/organization-member.entity';
import { Project } from '../projects/entities/project.entity';
import { ApiKey } from '../projects/entities/api-key.entity';
import { Queue } from '../queues/entities/queue.entity';
import { RetryPolicy } from '../queues/entities/retry-policy.entity';
import { Job } from '../jobs/entities/job.entity';
import { ScheduledJob } from '../jobs/entities/scheduled-job.entity';
import { BatchJob } from '../jobs/entities/batch-job.entity';
import { JobExecution } from '../jobs/entities/job-execution.entity';
import { JobLog } from '../jobs/entities/job-log.entity';
import { Worker } from '../workers/entities/worker.entity';
import { WorkerHeartbeat } from '../workers/entities/worker-heartbeat.entity';
import { DeadLetterEntry } from '../dlq/entities/dead-letter-entry.entity';

export const databaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  url: configService.get<string>('DATABASE_URL'),
  entities: [
    User,
    Organization,
    OrganizationMember,
    Project,
    ApiKey,
    Queue,
    RetryPolicy,
    Job,
    ScheduledJob,
    BatchJob,
    JobExecution,
    JobLog,
    Worker,
    WorkerHeartbeat,
    DeadLetterEntry,
  ],
  migrations: ['dist/database/migrations/*.js'],
  synchronize: configService.get('NODE_ENV') !== 'production', // Auto-sync in dev
  logging: configService.get('NODE_ENV') === 'development',
  ssl:
    configService.get('NODE_ENV') === 'production'
      ? { rejectUnauthorized: false }
      : false,
});
