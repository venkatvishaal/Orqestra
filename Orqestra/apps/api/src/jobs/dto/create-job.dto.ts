import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsNumber,
  IsUrl,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  IsDateString,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobType } from '../entities/job.entity';

class BatchItem {
  @ApiPropertyOptional()
  @IsOptional()
  payload?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  handlerUrl?: string;
}

export class CreateJobDto {
  @ApiProperty()
  @IsUUID()
  queueId: string;

  @ApiProperty({ enum: JobType })
  @IsEnum(JobType)
  type: JobType;

  @ApiPropertyOptional()
  @IsOptional()
  payload?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Webhook URL to call for job execution' })
  @IsOptional()
  @IsString()
  handlerUrl?: string;

  @ApiPropertyOptional({ description: 'Deduplication key — unique per queue' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiPropertyOptional({ description: 'Higher = executed first within the queue', default: 0 })
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional({ description: 'Delay in ms from now (for delayed jobs)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  delayMs?: number;

  @ApiPropertyOptional({ description: 'Absolute ISO timestamp to run at (for scheduled jobs)' })
  @IsOptional()
  @IsDateString()
  runAt?: string;

  @ApiPropertyOptional({ description: 'Cron expression (for cron jobs)' })
  @ValidateIf((o) => o.type === JobType.CRON)
  @IsString()
  cronExpression?: string;

  @ApiPropertyOptional({ description: 'Override max attempts for this job' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttempts?: number;

  @ApiPropertyOptional({ description: 'Items for batch jobs' })
  @ValidateIf((o) => o.type === JobType.BATCH)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchItem)
  batchItems?: BatchItem[];

  @ApiPropertyOptional({ description: 'Name for batch job (for display)' })
  @IsOptional()
  @IsString()
  batchName?: string;
}
