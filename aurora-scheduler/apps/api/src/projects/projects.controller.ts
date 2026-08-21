import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class CreateProjectDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() orgId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

class CreateApiKeyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
}

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a project within an organization' })
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto.orgId, dto.name, dto.description);
  }

  @Get()
  @ApiOperation({ summary: 'List projects in an organization' })
  findAll(@Query('orgId', ParseUUIDPipe) orgId: string) {
    return this.projectsService.findAll(orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project details' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a project' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.softDelete(id);
  }

  @Post(':id/api-keys')
  @ApiOperation({ summary: 'Generate a new API key (plaintext shown once)' })
  generateApiKey(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateApiKeyDto) {
    return this.projectsService.generateApiKey(id, dto.name);
  }

  @Get(':id/api-keys')
  @ApiOperation({ summary: 'List API keys for a project (no plaintext)' })
  listApiKeys(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.listApiKeys(id);
  }

  @Delete(':id/api-keys/:keyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an API key' })
  revokeApiKey(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('keyId', ParseUUIDPipe) keyId: string,
  ) {
    return this.projectsService.revokeApiKey(id, keyId);
  }
}
