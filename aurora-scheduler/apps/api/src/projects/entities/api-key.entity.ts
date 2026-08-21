import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Project } from './project.entity';

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id' })
  projectId: string;

  @Column({ name: 'key_hash' })
  keyHash: string;

  @Column({ nullable: true })
  name?: string;

  @Column({ default: false, name: 'is_revoked' })
  isRevoked: boolean;

  @Column({ name: 'last_used_at', nullable: true })
  lastUsedAt: Date | null;

  @ManyToOne(() => Project, (p) => p.apiKeys, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
