import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WorkersService } from './workers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Workers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workers')
export class WorkersController {
  constructor(private readonly workersService: WorkersService) {}

  @Get()
  @ApiOperation({ summary: 'List all workers and their health status' })
  findAll() {
    return this.workersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get worker details' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.workersService.findOne(id);
  }

  @Get(':id/heartbeats')
  @ApiOperation({ summary: 'Get recent heartbeat history for a worker' })
  getHeartbeats(@Param('id', ParseUUIDPipe) id: string) {
    return this.workersService.getHeartbeats(id);
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a new worker instance' })
  register(@Body() data: any) {
    return this.workersService.register(data);
  }

  @Post(':id/heartbeat')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Send worker heartbeat' })
  heartbeat(@Param('id', ParseUUIDPipe) id: string, @Body() data: any) {
    return this.workersService.heartbeat(id, data);
  }

  @Post(':id/deregister')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Gracefully deregister a worker' })
  deregister(@Param('id', ParseUUIDPipe) id: string) {
    return this.workersService.deregister(id);
  }
}
