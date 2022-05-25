import { createDynamoDBClient } from '../dynamodb';

const tableName = 'forumTable';

interface BaseEvent {
  threadId: string,
  timestamp: number,
  type: string,
}

interface ThreadOpenedEvent extends BaseEvent {
  type: 'thread_opened',
  byUserId: string,
}
interface ThreadClosedEvent extends BaseEvent {
  type: 'thread_closed',
  byUserId: string,
}

export type ThreadEvent =
  | ThreadOpenedEvent
  | ThreadClosedEvent;

// AWS uses PascalCase for everything, so we need to disable temporarily the casing lint rules
/* eslint-disable @typescript-eslint/naming-convention */
class ForumTable {
  constructor(private db: AWS.DynamoDB.DocumentClient) {}

  private getThreadId(participantId: string, itemId: string): string {
    return `THREAD#${participantId}#${itemId}`;
  }

  async getThreadEvents(participantId: string, itemId: string): Promise<ThreadEvent[]> {
    const threadId = this.getThreadId(participantId, itemId);
    const result = await this.db.query({
      TableName: tableName,
      ExpressionAttributeNames: { '#threadId': 'threadId' },
      ExpressionAttributeValues: { ':threadId': threadId },
      KeyConditionExpression: '#threadId = :threadId',
    }).promise();
    const events = result.Items || [];
    return events as ThreadEvent[];
  }

  async addThreadEvent(participantId: string, itemId: string, threadEvent: Omit<ThreadEvent, 'threadId' | 'timestamp'>): Promise<void> {
    const threadId = this.getThreadId(participantId, itemId);
    await this.db.put({
      TableName: tableName,
      Item: {
        ...threadEvent,
        threadId,
        timestamp: Date.now(),
        timeToLive: 1000 * 60 * 60 * 12, // 12 hours
      },
    }).promise();
  }
}
/* eslint-enable @typescript-eslint/naming-convention */

export const forumTable = new ForumTable(createDynamoDBClient());
