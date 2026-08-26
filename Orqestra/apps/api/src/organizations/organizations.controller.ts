import { Controller, Get, Post, Param, Body, UseGuards, Req, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class CreateOrgDto {
  @ApiProperty() @IsString() name: string;
}

@ApiTags('Organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgsService: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an organization' })
  create(@Body() dto: CreateOrgDto, @Req() req: any) {
    return this.orgsService.create(dto.name, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List organizations the current user belongs to' })
  findAll(@Req() req: any) {
    return this.orgsService.findAllForUser(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get organization details' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.orgsService.findOne(id, req.user.id);
  }
}
