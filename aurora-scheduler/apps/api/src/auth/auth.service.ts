import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { User } from '../users/entities/user.entity';
import { ApiKey } from '../projects/entities/api-key.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(ApiKey)
    private readonly apiKeysRepo: Repository<ApiKey>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = this.usersRepo.create({ email: dto.email, passwordHash });
    await this.usersRepo.save(user);

    const tokens = await this.generateTokens(user);
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async login(dto: LoginDto) {
    const user = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.generateTokens(user);
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async refresh(userId: string, refreshToken: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user || !user.refreshTokenHash) throw new ForbiddenException();

    const valid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!valid) throw new ForbiddenException('Refresh token invalid');

    const tokens = await this.generateTokens(user);
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);
    return tokens;
  }

  async logout(userId: string) {
    await this.usersRepo.update(userId, { refreshTokenHash: null });
  }

  async validateApiKey(rawKey: string): Promise<{ projectId: string } | null> {
    // API keys have format: ak_{projectId}_{random}
    const parts = rawKey.split('_');
    if (parts.length < 3 || parts[0] !== 'ak') return null;
    const projectId = parts[1];

    const keyPrefix = rawKey.substring(0, 8);

    // 1. Try the fast-path lookup using the prefix index
    let candidate = await this.apiKeysRepo.findOne({
      where: { projectId, keyPrefix, isRevoked: false },
    });

    // 2. Fallback for legacy keys that were created before key_prefix was introduced
    if (!candidate) {
      const legacyKeys = await this.apiKeysRepo.find({
        where: { projectId, keyPrefix: IsNull(), isRevoked: false },
      });

      for (const key of legacyKeys) {
        const match = await bcrypt.compare(rawKey, key.keyHash);
        if (match) {
          // Backfill prefix so subsequent requests use the fast indexed path
          await this.apiKeysRepo.update(key.id, { keyPrefix });
          candidate = key;
          break;
        }
      }
    }

    if (!candidate) return null;

    // Fast-path candidate still needs its hash compared (if found by prefix)
    if (candidate.keyPrefix === keyPrefix) {
      const match = await bcrypt.compare(rawKey, candidate.keyHash);
      if (!match) return null;
    }

    // Update last used timestamp asynchronously (fire-and-forget, non-critical)
    this.apiKeysRepo.update(candidate.id, { lastUsedAt: new Date() }).catch(() => {});
    return { projectId };
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersRepo.findOne({ where: { email } });
    if (!user) return null;
    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? user : null;
  }

  private async generateTokens(user: User) {
    const payload = { sub: user.id, email: user.email };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private async updateRefreshTokenHash(userId: string, token: string) {
    const hash = await bcrypt.hash(token, SALT_ROUNDS);
    await this.usersRepo.update(userId, { refreshTokenHash: hash });
  }

  private sanitizeUser(user: User) {
    const { passwordHash, refreshTokenHash, ...safe } = user;
    return safe;
  }

  /** Generates a new API key for a project. Returns plaintext key (shown once). */
  async generateApiKey(
    projectId: string,
    name?: string,
  ): Promise<{ id: string; key: string }> {
    const random = randomBytes(32).toString('hex');
    const rawKey = `ak_${projectId}_${random}`;
    const keyPrefix = rawKey.substring(0, 8); // stored for fast O(1) lookup
    const keyHash = await bcrypt.hash(rawKey, SALT_ROUNDS);
    const apiKey = this.apiKeysRepo.create({ projectId, keyHash, keyPrefix, name });
    const saved = await this.apiKeysRepo.save(apiKey);
    return { id: saved.id, key: rawKey };
  }
}
