import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
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

  /**
   * First 8 characters of the raw key stored in plaintext.
   * Used as a fast indexed lookup to find the single candidate row
   * before the expensive bcrypt.compare() call.
   * This reduces API key validation from O(n×bcrypt) to O(1×bcrypt).
   */
  @Index()
  @Column({ name: 'key_prefix', type: 'varchar', length: 8, nullable: true })
  keyPrefix: string | null;

  @Column({ type: 'varchar', nullable: true })
  name?: string;

  @Column({ default: false, name: 'is_revoked' })
  isRevoked: boolean;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @ManyToOne(() => Project, (p) => p.apiKeys, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
