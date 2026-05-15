import { ObjectType, Field, Int } from '@nestjs/graphql';
import { Status } from './application.model';

@ObjectType()
export class StatusCount {
  @Field(() => Status)
  status!: Status;

  @Field(() => Int)
  count!: number;
}

@ObjectType()
export class ApplicationStats {
  @Field(() => Int)
  total!: number;

  @Field(() => [StatusCount])
  byStatus!: StatusCount[];
}