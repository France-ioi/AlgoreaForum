import * as D from 'io-ts/Decoder';
import { DynamoDB } from '@aws-sdk/client-dynamodb';

export const tableKeyDecoder = D.struct({
  pk: D.string,
  time: D.number,
});

export type TableKey = D.TypeOf<typeof tableKeyDecoder>;

export class ForumTable {
  protected tableName = 'forumTable';

  constructor(protected db: DynamoDB) {}
}