import { GraphQLClient } from 'graphql-request';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/graphql';

export function getClient(token?: string) {
  return new GraphQLClient(API_URL, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}