import { DynamoDB } from '@aws-sdk/client-dynamodb';
import * as D from 'io-ts/Decoder';
import { pipe } from 'fp-ts/function';
import { fromDBItem, toDBItem } from '../dynamodb';
import { decode } from '../utils/decode';
import { isNotNull } from '../utils/predicates';

const baseEventDecoder = D.struct({
  pk: D.string,
  time: D.number,
});

const threadOpenedEventDecoder = D.struct({
  eventType: D.literal('thread_opened'),
  byUserId: D.string,
});

const threadClosedEventDecoder = D.struct({
  eventType: D.literal('thread_closed'),
  byUserId: D.string,
});

const followEventDecoder = D.struct({
  eventType: D.literal('follow'),
  userId: D.string,
  connectionId: D.string,
  ttl: D.number,
});
export type FollowEvent = D.TypeOf<typeof followEventDecoder>;

const attemptStartedEventDecoder = D.struct({
  eventType: D.literal('attempt_started'),
  attemptId: D.string,
});

const submissionEventDecoder = pipe(
  D.struct({
    eventType: D.literal('submission'),
    attemptId: D.string,
    answerId: D.string,
  }),
  D.intersect(D.partial({
    score: D.number,
    validated: D.boolean,
  }))
);

const threadEventInput = D.union(
  threadOpenedEventDecoder,
  threadClosedEventDecoder,
  followEventDecoder,
  attemptStartedEventDecoder,
  submissionEventDecoder,
);
export type ThreadEventInput = D.TypeOf<typeof threadEventInput>;

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

  /**
   * Retrieves all the thread event items for a couple participantId+itemId in ascending order.
   * Limit is currently 1MB of data.
   */
  async getThreadEvents(
    participantId: string,
    itemId: string,
    options: { limit?: number, asc?: boolean, eventType?: ThreadEvent['eventType'] } = {},
  ): Promise<ThreadEvent[]> {
    const threadId = this.getThreadId(participantId, itemId);
    const result = await this.db.query({
      TableName: this.tableName,
      ExpressionAttributeValues: {
        ':tid': { S: threadId },
        ...(options.eventType && { ':type': { S: options.eventType } }),
      },
      ...(options.eventType && {
        FilterExpression: 'eventType = :type',
      }),
      KeyConditionExpression: 'pk = :tid',
      ScanIndexForward: options.asc,
      Limit: options.limit,
    });
    const events = (result.Items || []).map(fromDBItem);
    return events.map(decode(threadEventDecoder)).filter(isNotNull);
  }

  async getFollowers(participantId: string, itemId: string): Promise<FollowEvent[]> {
    const events = await this.getThreadEvents(participantId, itemId, { eventType: 'follow' });
    return events.map(decode(followEventDecoder)).filter(isNotNull);
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
