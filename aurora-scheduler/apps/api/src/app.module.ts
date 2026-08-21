import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { ProjectsModule } from './projects/projects.module';
import { QueuesModule } from './queues/queues.module';
import { JobsModule } from './jobs/jobs.module';
import { WorkersModule } from './workers/workers.module';
import { DlqModule } from './dlq/dlq.module';
import { EventsModule } from './events/events.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { RedisModule } from './redis/redis.module';
import { databaseConfig } from './database/database.config';
import { SeedService } from './database/seed.service';
import { User } from './users/entities/user.entity';
import { Organization } from './organizations/entities/organization.entity';
import { OrganizationMember } from './organizations/entities/organization-member.entity';
import { Project } from './projects/entities/project.entity';
import { ApiKey } from './projects/entities/api-key.entity';
import { Queue } from './queues/entities/queue.entity';
import { RetryPolicy } from './queues/entities/retry-policy.entity';
import { Job } from './jobs/entities/job.entity';
import { DeadLetterEntry } from './dlq/entities/dead-letter-entry.entity';
import { Worker } from './workers/entities/worker.entity';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    // Logger
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
      },
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: databaseConfig,
      inject: [ConfigService],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    // Cron scheduling
    ScheduleModule.forRoot(),

    // Feature modules
    RedisModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    ProjectsModule,
    QueuesModule,
    JobsModule,
    WorkersModule,
    DlqModule,
    EventsModule,
    SchedulerModule,

    // Database entities for seeding
    TypeOrmModule.forFeature([
      User,
      Organization,
      OrganizationMember,
      Project,
      ApiKey,
      Queue,
      RetryPolicy,
      Job,
      DeadLetterEntry,
      Worker,
    ]),
  ],
  providers: [SeedService],
})
export class AppModule {}
