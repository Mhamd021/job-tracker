import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { GqlExecutionContext } from '@nestjs/graphql';

@Injectable()
export class JwtGuard {
  constructor(
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  private extractToken(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const [scheme, token, ...rest] = header.split(' ');
  if (rest.length > 0 || !token) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;
  return token;
}
  canActivate(context: ExecutionContext): boolean {
    const ctx = GqlExecutionContext.create(context);
    const request = ctx.getContext().req;
    
    const token = this.extractToken(request.headers.authorization);
    
    if (!token) throw new UnauthorizedException();

    try {
      request.user = this.jwt.verify(token, {
        secret: this.config.get('JWT_SECRET'),
         algorithms: ['HS256'],
      });
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}