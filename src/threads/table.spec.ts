import { dynamodb } from '../dynamodb';
import { deleteAll, getAll, loadFixture } from '../testutils/db';
import { ForumTable } from './table';

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
      await loadFixture([{ pk, time: 1, type: 'unknown_type' }]);
      await expect(forumTable.getThreadEvents(participantId, itemId)).resolves.toEqual([]);
    });

    it('should succeed retrieving multiple thread events', async () => {
      const userId1 = 'userId1';
      const userId2 = 'userId2';
      await loadFixture([
        { pk, time: 2, type: 'thread_opened', byUserId: userId1 },
        { pk, time: 3, type: 'thread_closed', byUserId: userId2 },
      ]);
      await expect(forumTable.getThreadEvents(participantId, itemId)).resolves.toEqual([{
        pk,
        time: 2,
        type: 'thread_opened',
        byUserId: userId1,
      }, {
        pk,
        time: 3,
        type: 'thread_closed',
        byUserId: userId2,
      }]);
    });

    it('should succeed with no matching records', async () => {
      await expect(forumTable.getThreadEvents('abc', 'def')).resolves.toEqual([]);
    });

    it('should let aws errors bubble', async () => {
      const error = new Error('oops');
      queryStub.mockImplementationOnce(() => {
        throw error;
      });
      await expect(forumTable.getThreadEvents('abc', 'def')).rejects.toBe(error);
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
      await forumTable.addThreadEvent(participantId, itemId, { type: 'thread_opened', byUserId: userId1 });
      await expect(getAll()).resolves.toMatchObject({
        Items: [{
          pk: { S: pk },
          time: { N: expect.stringMatching(/^[0-9.]+$/) },
          type: { S: 'thread_opened' },
          byUserId: { S: userId1 },
        }],
      });
    });

    it('should let aws errors bubble', async () => {
      const error = new Error('oops');
      putItemStub.mockImplementationOnce(() => {
        throw error;
      });
      await expect(forumTable.addThreadEvent('abc', 'def', { type: 'thread_opened', byUserId: 'toto' })).rejects.toBe(error);
    });
  });
});
