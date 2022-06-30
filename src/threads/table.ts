import { AttributeValue, DynamoDB, QueryCommandInput } from '@aws-sdk/client-dynamodb';
import * as D from 'io-ts/Decoder';
import { pipe } from 'fp-ts/function';
import { fromDBItem, toAttributeValue, toDBItem } from '../dynamodb';
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

const followEventInputDecoder = D.struct({
  eventType: D.literal('follow'),
  userId: D.string,
  connectionId: D.string,
  ttl: D.number,
});
type FollowEventInput = D.TypeOf<typeof followEventInputDecoder>;

const followEventDecoder = pipe(
  followEventInputDecoder,
  D.intersect(baseEventDecoder),
);
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
  followEventInputDecoder,
  attemptStartedEventDecoder,
  submissionEventDecoder,
);
export type ThreadEventInput = D.TypeOf<typeof threadEventInput>;

const threadEventDecoder = pipe(
  threadEventInput,
  D.intersect(baseEventDecoder),
);
export type ThreadEvent = D.TypeOf<typeof threadEventDecoder>;

interface ListOptions<Filters extends Record<string, any>> {
  participantId: string,
  itemId: string,
  limit?: number,
  asc?: boolean,
  filters?: Partial<Filters>,
}

// AWS uses PascalCase for everything, so we need to disable temporarily the casing lint rules
/* eslint-disable @typescript-eslint/naming-convention */
export class ForumTable {
  private tableName = 'forumTable';

  static getThreadId(participantId: string, itemId: string): string {
    return `THREAD#${participantId}#${itemId}`;
  }

  constructor(private db: DynamoDB) {}

  /**
   * Retrieves all the thread event items for a couple participantId+itemId in ascending order.
   * Limit is currently 1MB of data.
   */
  async getThreadEvents<Input extends ThreadEventInput = ThreadEventInput>({
    participantId,
    itemId,
    asc,
    limit,
    filters = {},
  }: ListOptions<Input>): Promise<ThreadEvent[]> {
    interface ThreadFilter {
      attributeName: string,
      valueAttributeName: string,
      value: AttributeValue,
    }
    const threadId = ForumTable.getThreadId(participantId, itemId);
    const threadFilters: ThreadFilter[] = Object.entries(filters).map(([ attributeName, value ]) => ({
      attributeName,
      valueAttributeName: `:${attributeName}`,
      value: toAttributeValue(value),
    }));

    const query: QueryCommandInput = {
      TableName: this.tableName,
      ExpressionAttributeValues: {
        ':tid': { S: threadId },
        ...Object.fromEntries(threadFilters.map(({ valueAttributeName, value }) => [ valueAttributeName, value ])),
      },
      ...(threadFilters.length > 0 && {
        FilterExpression: threadFilters
          .map(({ attributeName, valueAttributeName }) => `${attributeName} = ${valueAttributeName}`)
          .join(' AND ')
      }),
      KeyConditionExpression: 'pk = :tid',
      ScanIndexForward: asc,
      Limit: limit,
    };
    const result = await this.db.query(query);
    const events = (result.Items || []).map(fromDBItem);
    return events.map(decode(threadEventDecoder)).filter(isNotNull);
  }

  async getFollowers({ filters, ...options }: ListOptions<Omit<FollowEventInput, 'eventType'>>): Promise<FollowEvent[]> {
    const events = await this.getThreadEvents({ ...options, filters: { eventType: 'follow', ...filters } });
    return events.map(decode(followEventDecoder)).filter(isNotNull);
  }

  async addThreadEvent(
    participantId: string,
    itemId: string,
    threadEvent: ThreadEventInput,
  ): Promise<ThreadEvent> {
    const createdThreadEvent: ThreadEvent = {
      ...threadEvent,
      pk: ForumTable.getThreadId(participantId, itemId),
      time: Date.now(),
    };
    await this.db.putItem({
      TableName: this.tableName,
      Item: toDBItem(createdThreadEvent),
    });
    return createdThreadEvent;
  }

  /**
   * Add multiple DB items in ascending order (if time not specified)
   */
  async addThreadEvents(input: (ThreadEventInput & { participantId: string, itemId: string, time?: number })[]): Promise<ThreadEvent[]> {
    const now = Date.now();
    const createdEvents: ThreadEvent[] = input.map(({ participantId, itemId, time, ...threadEventInput }, index) => ({
      ...threadEventInput,
      pk: ForumTable.getThreadId(participantId, itemId),
      // NOTE: Why `now + index`:
      // An array can issue 100~200 items per millisecond. We need to make sure created events won't override one another
      time: time ?? (now + index),
    }));

    await this.db.batchWriteItem({
      RequestItems: {
        [this.tableName]: createdEvents.map(threadEvent => ({
          PutRequest: {
            Item: toDBItem(threadEvent),
          },
        })),
      }
    });
    return createdEvents;
  }

  async removeThreadEvent(threadEvent: Pick<ThreadEvent, 'pk' | 'time'>): Promise<void> {
    await this.db.deleteItem({
      TableName: this.tableName,
      Key: {
        pk: toAttributeValue(threadEvent.pk),
        time: toAttributeValue(threadEvent.time),
      },
    });
  }
}
/* eslint-enable @typescript-eslint/naming-convention */
