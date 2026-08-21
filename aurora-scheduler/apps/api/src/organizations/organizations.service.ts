import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationMember, OrgRole } from './entities/organization-member.entity';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgsRepo: Repository<Organization>,
    @InjectRepository(OrganizationMember)
    private readonly membersRepo: Repository<OrganizationMember>,
  ) {}

  async create(name: string, ownerId: string): Promise<Organization> {
    const org = await this.orgsRepo.save(
      this.orgsRepo.create({ name, ownerId }),
    );
    // Add owner as member
    await this.membersRepo.save(
      this.membersRepo.create({ orgId: org.id, userId: ownerId, role: OrgRole.OWNER }),
    );
    return this.findOne(org.id, ownerId);
  }

  async findAllForUser(userId: string): Promise<Organization[]> {
    const memberships = await this.membersRepo.find({
      where: { userId },
      relations: ['organization'],
    });
    return memberships.map((m) => m.organization);
  }

  async findOne(id: string, userId: string): Promise<Organization> {
    const member = await this.membersRepo.findOne({
      where: { orgId: id, userId },
    });
    if (!member) throw new ForbiddenException('Not a member of this organization');

    const org = await this.orgsRepo.findOne({
      where: { id },
      relations: ['members', 'projects'],
    });
    if (!org) throw new NotFoundException(`Organization ${id} not found`);
    return org;
  }

  async inviteMember(orgId: string, email: string, role: OrgRole, actorId: string) {
    // Verify actor has permission (admin/owner)
    const actor = await this.membersRepo.findOne({ where: { orgId, userId: actorId } });
    if (!actor || actor.role === OrgRole.MEMBER) {
      throw new ForbiddenException('Only owners and admins can invite members');
    }
    // In a real impl, send invite email. For now, add directly by userId.
    return { message: 'Invite sent (mock)' };
  }
}
