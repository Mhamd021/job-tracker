import { InputType, Field } from '@nestjs/graphql';
import { Status } from '../models/application.model';

@InputType()
export class CreateApplicationInput {
  @Field()
  companyName!: string;

  @Field({ nullable: true })
  companyUrl?: string;

  @Field()
  jobRole!: string;

  @Field(() => Status, { nullable: true })
  status?: Status;

  @Field({ nullable: true })
  notes?: string;
}