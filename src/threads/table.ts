import { DynamoDB } from '@aws-sdk/client-dynamodb';
import * as D from 'io-ts/Decoder';
import { pipe } from 'fp-ts/function';
import { fromDBItem, toDBItem } from '../dynamodb';
import { decode } from '../decoder';

const baseEventDecoder = D.struct({
  pk: D.string,
  time: D.number,
});

const threadOpenedEventDecoder = D.struct({
  type: D.literal('thread_opened'),
  byUserId: D.string,
});

const threadClosedEventDecoder = D.struct({
  type: D.literal('thread_closed'),
  byUserId: D.string,
});

const threadEventInput = D.union(threadOpenedEventDecoder, threadClosedEventDecoder);
type ThreadEventInput = D.TypeOf<typeof threadEventInput>;

const threadEventDecoder = pipe(
  threadEventInput,
  D.intersect(baseEventDecoder),
);
export type ThreadEvent = D.TypeOf<typeof threadEventDecoder>;

// AWS uses PascalCase for everything, so we need to disable temporarily the casing lint rules
/* eslint-disable @typescript-eslint/naming-convention */
export class ForumTable {
  private tableName = 'forumTable';

  constructor(private db: DynamoDB) {}

  private getThreadId(participantId: string, itemId: string): string {
    return `THREAD#${participantId}#${itemId}`;
  }

  async getThreadEvents(participantId: string, itemId: string): Promise<ThreadEvent[]> {
    const threadId = this.getThreadId(participantId, itemId);
    const result = await this.db.query({
      TableName: this.tableName,
      ExpressionAttributeValues: { ':tid': { S: threadId } },
      KeyConditionExpression: 'pk = :tid',
    });
    const events = (result.Items || []).map(fromDBItem);
    return decode(D.array(threadEventDecoder))(events);
  }

  async addThreadEvent(
    participantId: string,
    itemId: string,
    threadEvent: ThreadEventInput,
  ): Promise<ThreadEvent> {
    const createdThreadEvent: ThreadEvent = {
      ...threadEvent,
      pk: this.getThreadId(participantId, itemId),
      time: Date.now(),
    };
    await this.db.putItem({
      TableName: this.tableName,
      Item: toDBItem(createdThreadEvent),
    });
    return createdThreadEvent;
  }
}
/* eslint-enable @typescript-eslint/naming-convention */
