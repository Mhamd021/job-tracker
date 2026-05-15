import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';

export enum Status {
  TO_APPLY = 'TO_APPLY',
  APPLIED = 'APPLIED',
  INTERVIEW = 'INTERVIEW',
  OFFER = 'OFFER',
  REJECTED = 'REJECTED',
}

registerEnumType(Status, { name: 'Status' });

@ObjectType()
export class Application {
  @Field(() => ID)
  id!: string;

  @Field()
  companyName!: string;

  @Field({ nullable: true })
  companyUrl?: string;

  @Field()
  jobRole!: string;

  @Field(() => Status)
  status!: Status;

  @Field({ nullable: true })
  notes?: string;

  @Field()
  appliedAt!: Date;

  @Field()
  updatedAt!: Date;

  @Field()
  userId!: string;
}