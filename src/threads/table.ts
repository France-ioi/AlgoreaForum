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

const subscribeEventInputDecoder = D.struct({
  eventType: D.literal('subscribe'),
  userId: D.string,
  connectionId: D.string,
  ttl: D.number,
});
type SubscribeEventInput = D.TypeOf<typeof subscribeEventInputDecoder>;

const subscribeEventDecoder = pipe(
  subscribeEventInputDecoder,
  D.intersect(baseEventDecoder),
);
export type SubscribeEvent = D.TypeOf<typeof subscribeEventDecoder>;

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

const messageEventDecoder = D.struct({
  eventType: D.literal('message'),
  userId: D.string,
  content: D.string,
});

const threadEventInput = D.union(
  threadOpenedEventDecoder,
  threadClosedEventDecoder,
  subscribeEventInputDecoder,
  attemptStartedEventDecoder,
  submissionEventDecoder,
  messageEventDecoder,
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

export type ThreadStatus = 'none' | 'closed' | 'opened';

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

  async getSubscribers({ filters, ...options }: ListOptions<Omit<SubscribeEventInput, 'eventType'>>): Promise<SubscribeEvent[]> {
    const events = await this.getThreadEvents({ ...options, filters: { eventType: 'subscribe', ...filters } });
    return events.map(decode(subscribeEventDecoder)).filter(isNotNull);
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
    const createdEvents: ThreadEvent[] = input.map(({ participantId, itemId, time, ...threadEventInput }) => ({
      ...threadEventInput,
      pk: ForumTable.getThreadId(participantId, itemId),
      time: time ?? now,
    }));

    await this.db.batchWriteItem({
      RequestItems: {
        [this.tableName]: withUniqueTime(createdEvents).map(threadEvent => ({
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

  async getThreadStatus(participantId: string, itemId: string): Promise<ThreadStatus> {
    const pk = ForumTable.getThreadId(participantId, itemId);
    const result = await this.db.query({
      TableName: this.tableName,
      KeyConditionExpression: 'pk = :tid',
      FilterExpression: 'eventType = :opened OR eventType = :closed',
      ScanIndexForward: false,
      ExpressionAttributeValues: {
        ':tid': toAttributeValue(pk),
        ':opened': toAttributeValue('thread_opened'),
        ':closed': toAttributeValue('thread_closed'),
      },
    });
    const events = (result.Items || [])
      .map(fromDBItem)
      .map(decode(threadEventDecoder))
      .filter(isNotNull);
    const opened = events.find(event => event.eventType === 'thread_opened');
    const closed = events.find(event => event.eventType === 'thread_closed');
    return this.threadStatusFromEvents(opened, closed);
  }

  private threadStatusFromEvents(threadOpenedEvent?: ThreadEvent, threadClosedEvent?: ThreadEvent): ThreadStatus {
    if (!threadOpenedEvent && !threadClosedEvent) return 'none';
    const threadOpenedTime = threadOpenedEvent?.time || 0;
    if (!threadClosedEvent || threadClosedEvent.time < threadOpenedTime) return 'opened';
    return 'closed';
  }
}
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * Finds time duplicates in an ordered manner:
 * `findTimeDuplicate([{ pk: 'A', time: 1 }, { pk: 'B', time: 1 }])` returns B
 */
const findTimeDuplicate = <T extends { time: number }>(items: T[]): T | undefined => {
  for (let i = 0; i < items.length; i++) {
    const target = items[i]!;

    // Start from i + 1 because if there was a duplicate before the target item, it would have already be found.
    for (let j = i + 1; j < items.length; j++) {
      const item = items[j]!;
      const isDuplicate = item.time === target.time;
      if (isDuplicate) return item;
    }
  }
  return undefined;
};

/**
 * Ensure time unicity in an array by adding a millisecond to duplicates and repeating treatment over and over on provided array.
 */
const withUniqueTime = <T extends { time: number }>(items: T[]): T[] => {
  const copy = items.map(item => ({ ...item }));
  let duplicate = findTimeDuplicate(copy);
  while (duplicate) {
    duplicate.time += 1; // the array is also modified since we keep the object reference in the `copy` array.
    duplicate = findTimeDuplicate(copy);
  }
  return copy;
};
