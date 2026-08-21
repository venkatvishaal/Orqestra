import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './entities/project.entity';
import { ApiKey } from './entities/api-key.entity';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectsRepo: Repository<Project>,
    @InjectRepository(ApiKey)
    private readonly apiKeysRepo: Repository<ApiKey>,
    private readonly authService: AuthService,
  ) {}

  async create(orgId: string, name: string, description?: string): Promise<Project> {
    const project = await this.projectsRepo.save(
      this.projectsRepo.create({ orgId, name, description }),
    );
    return project;
  }

  async findAll(orgId: string): Promise<Project[]> {
    return this.projectsRepo.find({
      where: { orgId, isDeleted: false },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Project> {
    const project = await this.projectsRepo.findOne({ where: { id, isDeleted: false } });
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    return project;
  }

  async softDelete(id: string): Promise<void> {
    await this.projectsRepo.update(id, { isDeleted: true });
  }

  async generateApiKey(projectId: string, name?: string) {
    const project = await this.findOne(projectId);
    const { id, key } = await this.authService.generateApiKey(projectId, name);
    return {
      id,
      projectId,
      name,
      key, // Shown once — plaintext
      createdAt: new Date(),
    };
  }

  async listApiKeys(projectId: string): Promise<Omit<ApiKey, 'keyHash'>[]> {
    const keys = await this.apiKeysRepo.find({
      where: { projectId, isRevoked: false },
      order: { createdAt: 'DESC' },
    });
    return keys.map(({ keyHash, ...safe }) => safe);
  }

  async revokeApiKey(projectId: string, keyId: string): Promise<void> {
    const key = await this.apiKeysRepo.findOne({ where: { id: keyId, projectId } });
    if (!key) throw new NotFoundException('API key not found');
    await this.apiKeysRepo.update(keyId, { isRevoked: true });
  }
}
