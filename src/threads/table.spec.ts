import { dynamodb } from '../dynamodb';
import { deleteAll, getAll, loadFixture } from '../testutils/db';
import { ForumTable, ThreadEvent } from './table';

describe('Forum table', () => {
  const forumTable = new ForumTable(dynamodb);
  const consoleErrorStub = jest.spyOn(global.console, 'error');
  consoleErrorStub.mockImplementation(() => {});
  beforeEach(async () => {
    await deleteAll();
  });

  describe('getThreadEvents()', () => {
    const participantId = 'participantId';
    const itemId = 'itemId';
    const pk = `THREAD#${participantId}#${itemId}`;
    // @ts-ignore
    const queryStub = jest.spyOn(forumTable.db, 'query');

    it('should omit wrong entries', async () => {
      await loadFixture([{ pk, time: 1, eventType: 'unknown_type' }, { pk, time: 2, eventType: 'thread_opened', byUserId: '12' }]);
      await expect(forumTable.getThreadEvents({ participantId, itemId })).resolves.toEqual([
        { pk, time: 2, eventType: 'thread_opened', byUserId: '12' },
      ]);
    });

    it('should succeed retrieving multiple thread events', async () => {
      const userId1 = 'userId1';
      const userId2 = 'userId2';
      await loadFixture([
        { pk, time: 2, eventType: 'thread_opened', byUserId: userId1 },
        { pk, time: 3, eventType: 'thread_closed', byUserId: userId2 },
      ]);
      await expect(forumTable.getThreadEvents({ participantId, itemId })).resolves.toEqual([{
        pk,
        time: 2,
        eventType: 'thread_opened',
        byUserId: userId1,
      }, {
        pk,
        time: 3,
        eventType: 'thread_closed',
        byUserId: userId2,
      }]);
    });

    it('should succeed with no matching records', async () => {
      await expect(forumTable.getThreadEvents({ participantId: 'abc', itemId: 'def' })).resolves.toEqual([]);
    });

    it('should let aws errors bubble', async () => {
      const error = new Error('oops');
      queryStub.mockImplementationOnce(() => {
        throw error;
      });
      await expect(forumTable.getThreadEvents({ participantId: 'abc', itemId: 'def' })).rejects.toBe(error);
    });

    it('should retrieve events in reverse order', async () => {
      const userId1 = 'userId1';
      const userId2 = 'userId2';
      await loadFixture([
        { pk, time: 2, eventType: 'thread_opened', byUserId: userId1 },
        { pk, time: 3, eventType: 'thread_closed', byUserId: userId2 },
      ]);
      await expect(forumTable.getThreadEvents({ participantId, itemId, asc: false })).resolves.toEqual([{
        pk,
        time: 3,
        eventType: 'thread_closed',
        byUserId: userId2,
      }, {
        pk,
        time: 2,
        eventType: 'thread_opened',
        byUserId: userId1,
      }]);
    });

    it('should apply a limit', async () => {
      const userId1 = 'userId1';
      const userId2 = 'userId2';
      await loadFixture([
        { pk, time: 2, eventType: 'thread_opened', byUserId: userId1 },
        { pk, time: 3, eventType: 'thread_closed', byUserId: userId2 },
      ]);
      await expect(forumTable.getThreadEvents({ participantId, itemId, limit: 1 })).resolves.toEqual([{
        pk,
        time: 2,
        eventType: 'thread_opened',
        byUserId: userId1,
      }]);
    });

    it('should filter by type', async () => {
      const userId1 = 'userId1';
      const userId2 = 'userId2';
      await loadFixture([
        { pk, time: 2, eventType: 'thread_opened', byUserId: userId1 },
        { pk, time: 3, eventType: 'thread_closed', byUserId: userId2 },
        { pk, time: 4, eventType: 'thread_opened', byUserId: userId2 },
      ]);
      await expect(forumTable.getThreadEvents({ participantId, itemId, filters: { eventType: 'thread_opened' } })).resolves.toEqual([
        { pk, time: 2, eventType: 'thread_opened', byUserId: userId1 },
        { pk, time: 4, eventType: 'thread_opened', byUserId: userId2 },
      ]);
    });

    it('should filter by type and user id', async () => {
      const userId1 = 'userId1';
      const userId2 = 'userId2';
      await loadFixture([
        { pk, time: 2, eventType: 'thread_opened', byUserId: userId1 },
        { pk, time: 3, eventType: 'thread_closed', byUserId: userId2 },
        { pk, time: 4, eventType: 'thread_opened', byUserId: userId2 },
      ]);
      await expect(forumTable.getThreadEvents({
        participantId,
        itemId,
        filters: { eventType: 'thread_opened', byUserId: userId2 },
      })).resolves.toEqual([
        { pk, time: 4, eventType: 'thread_opened', byUserId: userId2 },
      ]);
    });
  });

  describe('addThreadEvent()', () => {
    const participantId = 'addThreadParticipantId';
    const itemId = 'addThreadItemId';
    const pk = `THREAD#${participantId}#${itemId}`;
    const userId1 = 'userId1';
    // @ts-ignore
    const putItemStub = jest.spyOn(forumTable.db, 'putItem');

    it('should add an event', async () => {
      expect.assertions(1);
      await forumTable.addThreadEvent(participantId, itemId, { eventType: 'thread_opened', byUserId: userId1 });
      await expect(getAll()).resolves.toMatchObject({
        Items: [{
          pk: { S: pk },
          time: { N: expect.stringMatching(/^[0-9.]+$/) },
          eventType: { S: 'thread_opened' },
          byUserId: { S: userId1 },
        }],
      });
    });

    it('should let aws errors bubble', async () => {
      const error = new Error('oops');
      putItemStub.mockImplementationOnce(() => {
        throw error;
      });
      await expect(forumTable.addThreadEvent('abc', 'def', { eventType: 'thread_opened', byUserId: 'toto' })).rejects.toBe(error);
    });
  });

  describe('addThreadEvents()', () => {
    const participantId = 'addMultiThreadParticipantId';
    const itemId = 'addMultiThreadItemId';
    const pk = `THREAD#${participantId}#${itemId}`;
    const userId2 = 'userId2';
    // @ts-ignore
    const batchWriteItemStub = jest.spyOn(forumTable.db, 'batchWriteItem');

    it('should add events', async () => {
      expect.assertions(1);
      await forumTable.addThreadEvents([
        { participantId, itemId, eventType: 'thread_opened', byUserId: userId2 },
        { participantId, itemId, eventType: 'thread_closed', byUserId: userId2 },
      ]);
      await expect(getAll()).resolves.toMatchObject({
        Items: [{
          pk: { S: pk },
          time: { N: expect.stringMatching(/^[0-9.]+$/) },
          eventType: { S: 'thread_opened' },
          byUserId: { S: userId2 },
        }, {
          pk: { S: pk },
          time: { N: expect.stringMatching(/^[0-9.]+$/) },
          eventType: { S: 'thread_closed' },
          byUserId: { S: userId2 },
        }],
      });
    });

    it('should add events with time', async () => {
      expect.assertions(1);
      const time = 42;
      await forumTable.addThreadEvents([{ participantId, itemId, eventType: 'thread_opened', byUserId: userId2, time }]);
      await expect(getAll()).resolves.toMatchObject({
        Items: [{
          pk: { S: pk },
          time: { N: time.toString() },
          eventType: { S: 'thread_opened' },
          byUserId: { S: userId2 },
        }],
      });
    });

    it('should let aws errors bubble', async () => {
      const error = new Error('oops');
      batchWriteItemStub.mockImplementationOnce(() => {
        throw error;
      });
      await expect(forumTable.addThreadEvents([
        { participantId: 'abc', itemId: 'def', eventType: 'thread_opened', byUserId: 'toto' },
      ])).rejects.toBe(error);
    });
  });

  describe('removeThreadEvent()', () => {
    const participantId = 'addMultiThreadParticipantId';
    const itemId = 'addMultiThreadItemId';
    // @ts-ignore
    const deleteItemStub = jest.spyOn(forumTable.db, 'deleteItem');

    it('should remove the targeted event only', async () => {
      const pk = ForumTable.getThreadId(participantId, itemId);
      const time = 1;
      const userId = 'userId';
      const threadOpened: ThreadEvent = { pk, time, eventType: 'thread_opened', byUserId: userId };
      await loadFixture([
        threadOpened,
        { pk, time: 2, eventType: 'thread_opened', byUserId: 'otherUserId' },
      ]);
      await forumTable.removeThreadEvent({ pk, time });
      const all = await getAll();
      expect(all.Items).toBeDefined();
      expect(all.Items).toHaveLength(1);
      expect(all.Items).not.toContainEqual(threadOpened);
    });

    it('should let aws errors bubble', async () => {
      const error = new Error('oops');
      deleteItemStub.mockImplementationOnce(() => {
        throw error;
      });
      await expect(forumTable.removeThreadEvent({ pk: '1234', time: 1 })).rejects.toBe(error);
    });
  });
});
