import { Module } from '@nestjs/common';
// Scheduler module re-exports nothing special — cron materializer lives in JobsService
// This module exists as a placeholder for future standalone scheduler process

@Module({})
export class SchedulerModule {}
