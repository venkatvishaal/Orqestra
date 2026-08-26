import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DlqService } from './dlq.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Dead Letter Queue')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dlq')
export class DlqController {
  constructor(private readonly dlqService: DlqService) {}

  @Get()
  @ApiOperation({ summary: 'List Dead Letter Queue entries' })
  findAll(
    @Query('queueId', new DefaultValuePipe(undefined)) queueId: string | undefined,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.dlqService.findAll(queueId, page, limit);
  }

  @Post(':id/requeue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Requeue a DLQ job (resets attempts to 0)' })
  requeue(@Param('id', ParseUUIDPipe) id: string) {
    return this.dlqService.requeue(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete a DLQ entry and its job' })
  purge(@Param('id', ParseUUIDPipe) id: string) {
    return this.dlqService.purge(id);
  }
}
