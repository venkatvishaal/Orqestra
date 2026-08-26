import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Organization } from '../../organizations/entities/organization.entity';
import { ApiKey } from './api-key.entity';
import { Queue } from '../../queues/entities/queue.entity';

@Entity('projects')
export class Project {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column()
  name: string;

  @Column({ name: 'org_id' })
  orgId: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ default: false, name: 'is_deleted' })
  isDeleted: boolean;

  @ManyToOne(() => Organization, (o) => o.projects, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'org_id' })
  organization: Organization;

  @OneToMany(() => ApiKey, (k) => k.project, { cascade: true })
  apiKeys: ApiKey[];

  @OneToMany(() => Queue, (q) => q.project, { cascade: true })
  queues: Queue[];

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
