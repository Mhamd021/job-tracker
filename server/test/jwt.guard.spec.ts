import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtGuard } from '../src/auth/jwt.guard';

const SECRET = 'a-test-secret-only-for-this-file';
const jwt = new JwtService({ secret: SECRET });
const config = { get: () => SECRET } as any;
const guard = new JwtGuard(jwt, config);

const contextFor = (req: object) =>
  ({
    getArgs: () => [{}, {}, { req }, {}],
    getClass: () => Object,
    getHandler: () => () => undefined,
    getType: () => 'graphql',
  }) as unknown as ExecutionContext;

it('control: a token with a sub is accepted and fills request.user', () => {
  const req: any = { headers: { authorization: 'Bearer ' + jwt.sign({ sub: 'user-1' }) } };
  expect(guard.canActivate(contextFor(req))).toBe(true);
  expect(req.user.sub).toBe('user-1');
});

it('a validly signed token without a sub is refused by the guard itself', () => {
  const req: any = { headers: { authorization: 'Bearer ' + jwt.sign({ email: 'x@example.com' }) } };
  expect(() => guard.canActivate(contextFor(req))).toThrow(UnauthorizedException);
});