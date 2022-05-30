import { DynamoDB } from '@aws-sdk/client-dynamodb';
import * as D from 'io-ts/Decoder';
import { fromDBItem, toDBItem } from '../dynamodb';
import { decode } from '../decoder';

const baseEvent = D.struct({
  threadId: D.string,
  timestamp: D.number,
});

const threadOpenedEvent = D.struct({
  type: D.literal('thread_opened'),
  byUserId: D.string,
});

const threadClosedEvent = D.struct({
  type: D.literal('thread_closed'),
  byUserId: D.string,
});

const threadEventInput = D.union(threadOpenedEvent, threadClosedEvent);
type ThreadEventInput = D.TypeOf<typeof threadEventInput>;

const threadEvent = D.intersect(baseEvent)(threadEventInput);
export type ThreadEvent = D.TypeOf<typeof threadEvent>;

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
      KeyConditionExpression: 'threadId = :tid',
    });
    const events = (result.Items || []).map(fromDBItem);
    return decode(D.array(threadEvent))(events);
  }

  async addThreadEvent(
    participantId: string,
    itemId: string,
    threadEvent: ThreadEventInput,
  ): Promise<ThreadEvent> {
    const createdThreadEvent: ThreadEvent = {
      ...threadEvent,
      threadId: this.getThreadId(participantId, itemId),
      timestamp: Date.now(),
    };
    await this.db.putItem({
      TableName: this.tableName,
      Item: toDBItem(createdThreadEvent),
    });
    return createdThreadEvent;
  }
}
/* eslint-enable @typescript-eslint/naming-convention */
