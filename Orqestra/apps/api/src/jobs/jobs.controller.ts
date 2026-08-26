import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { ListJobsDto } from './dto/list-jobs.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a job (immediate, delayed, scheduled, cron, or batch)' })
  create(@Body() dto: CreateJobDto) {
    return this.jobsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List jobs with optional filtering and pagination' })
  findAll(@Query() query: ListJobsDto) {
    return this.jobsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get job details with execution history' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobsService.findOne(id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a queued or scheduled job' })
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobsService.cancel(id);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually retry a failed or DLQ job' })
  retry(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobsService.retry(id);
  }

  @Get(':id/executions/:executionId/logs')
  @ApiOperation({ summary: 'Get logs for a specific execution attempt' })
  getLogs(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('executionId', ParseUUIDPipe) executionId: string,
  ) {
    return this.jobsService.getExecutionLogs(id, executionId);
  }
}
