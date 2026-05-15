import { Resolver, Mutation, Args, Query } from '@nestjs/graphql';
import { AuthService } from './auth.service';
import { AuthInput } from './dto/auth.input';
import { AuthResponse } from './dto/auth.response';

@Resolver()
export class AuthResolver {
  constructor(private auth: AuthService) {}

  @Query(() => String)
  health(): string {
    return 'ok';
  }

  @Mutation(() => AuthResponse)
  register(@Args('input') input: AuthInput): Promise<AuthResponse> {
    return this.auth.register(input.email, input.password);
  }

  @Mutation(() => AuthResponse)
  login(@Args('input') input: AuthInput): Promise<AuthResponse> {
    return this.auth.login(input.email, input.password);
  }
}