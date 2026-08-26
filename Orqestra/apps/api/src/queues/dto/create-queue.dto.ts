import {
  IsString,
  IsUUID,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsNumber,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RetryStrategy } from '../entities/retry-policy.entity';

class RetryPolicyDto {
  @ApiPropertyOptional({ enum: RetryStrategy, default: RetryStrategy.EXPONENTIAL })
  @IsOptional()
  @IsEnum(RetryStrategy)
  strategy?: RetryStrategy;

  @ApiPropertyOptional({ default: 2000 })
  @IsOptional()
  @IsInt()
  @Min(100)
  baseDelayMs?: number;

  @ApiPropertyOptional({ default: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxAttempts?: number;

  @ApiPropertyOptional({ default: 86400000 })
  @IsOptional()
  @IsInt()
  maxDelayMs?: number;
}

export class CreateQueueDto {
  @ApiProperty()
  @IsUUID()
  projectId: string;

  @ApiProperty({ example: 'email-delivery' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  concurrencyLimit?: number;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  priority?: number;

  @ApiPropertyOptional({ description: 'Max jobs per second (null = unlimited)' })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  rateLimitPerSec?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => RetryPolicyDto)
  retryPolicy?: RetryPolicyDto;
}
