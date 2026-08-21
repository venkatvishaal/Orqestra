import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { Request } from 'express';
import { AuthService } from '../auth.service';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  constructor(private readonly authService: AuthService) {
    super();
  }

  async validate(req: Request) {
    const rawKey = req.headers['x-api-key'] as string;
    if (!rawKey) throw new UnauthorizedException('Missing API key');

    const result = await this.authService.validateApiKey(rawKey);
    if (!result) throw new UnauthorizedException('Invalid API key');

    return result; // { projectId }
  }
}
