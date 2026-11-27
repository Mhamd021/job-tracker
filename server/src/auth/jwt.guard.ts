import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { GqlExecutionContext } from '@nestjs/graphql';

@Injectable()
export class JwtGuard {
  constructor(
    private jwt: JwtService,
    private config: ConfigService,
  ) { }

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
    let payload: { sub?: unknown };

    try {
      payload = this.jwt.verify(token, {
        secret: this.config.get('JWT_SECRET'),
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException();
    }
    if (typeof payload?.sub !== 'string' || payload.sub.length === 0) {
      throw new UnauthorizedException();
    }
    request.user = payload;
    return true;
  }
}