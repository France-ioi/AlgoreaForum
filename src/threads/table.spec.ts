import { AttributeValue } from '@aws-sdk/client-dynamodb';
import { dynamodb, toDBItem } from '../dynamodb';
import { ForumTable } from './table';

const putItem = (threadId: string, timestamp: number, data: Record<string, unknown>) => dynamodb.putItem({
  TableName: 'forumTable',
  Item: toDBItem({ threadId, timestamp, ...data }),
});
const getAll = (threadId: string) => dynamodb.query({
  TableName: 'forumTable',
  ExpressionAttributeValues: { ':tid': { S: threadId } },
  KeyConditionExpression: 'threadId = :tid',
});
const deleteAllItems = async (threadId: string) => {
  const result = await getAll(threadId);
  await Promise.all((result.Items || []).map(item => dynamodb.deleteItem({
    TableName: 'forumTable',
    Key: { threadId: item.threadId as AttributeValue, timestamp: item.timestamp as AttributeValue },
  })));
};

describe('Forum table', () => {
  const forumTable = new ForumTable(dynamodb);
  const consoleErrorStub = jest.spyOn(global.console, 'error');
  consoleErrorStub.mockImplementation(() => {});

  describe('getThreadEvents()', () => {
    const participantId = 'participantId';
    const itemId = 'itemId';
    const threadId = `THREAD#${participantId}#${itemId}`;

    afterEach(async () => {
      await deleteAllItems(threadId);
    });

    it('should fail at decode step', async () => {
      await putItem(threadId, 1, { type: 'unknown_type' });
      await expect(forumTable.getThreadEvents(participantId, itemId)).rejects.toBeInstanceOf(Error);
    });

    it('should succeed retrieving multiple thread events', async () => {
      const userId1 = 'userId1';
      const userId2 = 'userId2';
      await Promise.all([
        putItem(threadId, 2, { type: 'thread_opened', byUserId: userId1 }),
        putItem(threadId, 3, { type: 'thread_closed', byUserId: userId2 }),
      ]);
      await expect(forumTable.getThreadEvents(participantId, itemId)).resolves.toEqual([{
        threadId,
        timestamp: 2,
        type: 'thread_opened',
        byUserId: userId1,
      }, {
        threadId,
        timestamp: 3,
        type: 'thread_closed',
        byUserId: userId2,
      }]);
    });
  });

  describe('addThreadEvent()', () => {
    const participantId = 'addThreadParticipantId';
    const itemId = 'addThreadItemId';
    const threadId = `THREAD#${participantId}#${itemId}`;
    const userId1 = 'userId1';

    afterEach(async () => {
      await deleteAllItems(threadId);
    });

    it('should add an event', async () => {
      expect.assertions(1);
      await forumTable.addThreadEvent(participantId, itemId, { type: 'thread_opened', byUserId: userId1 });
      await expect(getAll(threadId)).resolves.toMatchObject({
        Items: [{
          threadId: { S: threadId },
          timestamp: { N: expect.stringMatching(/^[0-9.]+$/) },
          type: { S: 'thread_opened' },
          byUserId: { S: userId1 },
        }],
      });
    });
  });
});
