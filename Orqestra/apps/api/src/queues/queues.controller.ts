import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { QueuesService } from './queues.service';
import { CreateQueueDto } from './dto/create-queue.dto';
import { UpdateQueueDto } from './dto/update-queue.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Queues')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('queues')
export class QueuesController {
  constructor(private readonly queuesService: QueuesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a queue with retry policy' })
  create(@Body() dto: CreateQueueDto) {
    return this.queuesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all queues for a project' })
  findAll(@Query('projectId', ParseUUIDPipe) projectId: string) {
    return this.queuesService.findAll(projectId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get queue details' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.queuesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update queue configuration' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQueueDto) {
    return this.queuesService.update(id, dto);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause a queue — stops new job claims' })
  pause(@Param('id', ParseUUIDPipe) id: string) {
    return this.queuesService.pause(id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume a paused queue' })
  resume(@Param('id', ParseUUIDPipe) id: string) {
    return this.queuesService.resume(id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get queue statistics (depth, throughput, success rate)' })
  getStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.queuesService.getStats(id);
  }
}
