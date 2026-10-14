// src/guards/api-key.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const key = request.headers['x-api-key'];
    if (key !== process.env.TRUTH_MAP_API_KEY) {
      throw new UnauthorizedException('Invalid API key');
    }
    return true;
  }
}