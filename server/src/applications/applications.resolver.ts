import { Resolver, Query, Mutation, Args, ID, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { Application } from './models/application.model';
import { ApplicationStats } from './models/stats.model';
import { CreateApplicationInput } from './dto/create-application.input';
import { UpdateApplicationInput } from './dto/update-application.input';
import { Status } from './models/application.model';
import { JwtGuard } from '../auth/jwt.guard';

@Resolver()
@UseGuards(JwtGuard)
export class ApplicationsResolver {
  constructor(private service: ApplicationsService) {}

  @Query(() => [Application])
  applications(
    @Context() ctx: any,
    @Args('status', { type: () => Status, nullable: true }) status?: Status,
  ) {
    return this.service.findAll(ctx.req.user.sub, status);
  }

  @Query(() => Application, { nullable: true })
  application(
    @Context() ctx: any,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.service.findOne(id, ctx.req.user.sub);
  }

  @Query(() => ApplicationStats)
  stats(@Context() ctx: any) {
    return this.service.stats(ctx.req.user.sub);
  }

  @Mutation(() => Application)
  createApplication(
    @Context() ctx: any,
    @Args('input') input: CreateApplicationInput,
  ) {
    return this.service.create(ctx.req.user.sub, input);
  }

  @Mutation(() => Application)
  updateApplication(
    @Context() ctx: any,
    @Args('input') input: UpdateApplicationInput,
  ) {
    return this.service.update(ctx.req.user.sub, input);
  }

  @Mutation(() => Application)
  deleteApplication(
    @Context() ctx: any,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.service.delete(id, ctx.req.user.sub);
  }
}