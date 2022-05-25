import { forumTable } from './table';

describe('Forum table', () => {
  const participantId = '12';
  const itemId = '42';
  const userId = '1001';

  it('should add a thread event and retrieve new event in thread events', async () => {
    await expect(forumTable.addThreadEvent(participantId, itemId, { type: 'thread_opened', byUserId: userId })).resolves.toBe(undefined);
    await expect(forumTable.getThreadEvents(participantId, itemId)).resolves.toMatchObject([{
      threadId: expect.any(String),
      timestamp: expect.any(Number),
      type: 'thread_opened',
      byUserId: userId,
    }]);
  });
});
