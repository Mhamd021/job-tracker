import { InputType, Field, ID } from '@nestjs/graphql';
import { Status } from '../models/application.model';

@InputType()
export class UpdateApplicationInput {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  companyName?: string;

  @Field({ nullable: true })
  companyUrl?: string;

  @Field({ nullable: true })
  jobRole?: string;

  @Field(() => Status, { nullable: true })
  status?: Status;

  @Field({ nullable: true })
  notes?: string;
}