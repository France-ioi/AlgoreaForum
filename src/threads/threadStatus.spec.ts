import { deleteAll, loadFixture } from '../testutils/db';
import { callHandler } from '../testutils/lambda';
import { mockTokenData } from '../testutils/mocks';
import { ok, serverError, unauthorized } from '../utils/responses';
import { handler } from './threadStatus';
import { ForumTable, ThreadEvent } from './table';

describe('threadStatus handler', () => {
  const tokenData = mockTokenData(1);

  beforeEach(async () => {
    await deleteAll();
  });

  it('should fail without token data', async () => {
    await expect(callHandler(handler, {})).resolves.toEqual(unauthorized());
  });

  it('should let aws error bubble', async () => {
    const stub = jest.spyOn(ForumTable.prototype, 'getThreadStatus');
    stub.mockRejectedValueOnce(new Error('oops'));
    await expect(callHandler(handler, { tokenData })).resolves.toEqual(serverError());
  });

  describe('success cases', () => {
    const pk = ForumTable.getThreadId(tokenData.participantId, tokenData.itemId);

    it('should return thread status none', async () => {
      await expect(callHandler(handler, { tokenData })).resolves.toEqual(ok(JSON.stringify({ status: 'none' })));
    });

    it('should return thread status "closed" when "closed" event is before "opened"', async () => {
      const closedEvent1: ThreadEvent = { pk, time: 1, eventType: 'thread_closed', byUserId: '1' };
      const openedEvent: ThreadEvent = { pk, time: 2, eventType: 'thread_opened', byUserId: '1' };
      const closedEvent2: ThreadEvent = { pk, time: 3, eventType: 'thread_closed', byUserId: '1' };
      await loadFixture([ openedEvent, closedEvent1, closedEvent2 ]);

      await expect(callHandler(handler, { tokenData })).resolves.toEqual(ok(JSON.stringify({ status: 'closed' })));
    });

    it('should return thread status "closed" when a "closed" event exists and a "opened" does not', async () => {
      const closedEvent: ThreadEvent = { pk, time: 2, eventType: 'thread_closed', byUserId: '1' };
      await loadFixture([ closedEvent ]);

      await expect(callHandler(handler, { tokenData })).resolves.toEqual(ok(JSON.stringify({ status: 'closed' })));
    });

    it('should return thread status "opened" when "opened" event happened after "closed"', async () => {
      const openedEvent1: ThreadEvent = { pk, time: 1, eventType: 'thread_opened', byUserId: '1' };
      const closedEvent: ThreadEvent = { pk, time: 2, eventType: 'thread_closed', byUserId: '1' };
      const openedEvent2: ThreadEvent = { pk, time: 3, eventType: 'thread_opened', byUserId: '1' };
      await loadFixture([ openedEvent1, closedEvent, openedEvent2 ]);
      await expect(callHandler(handler, { tokenData })).resolves.toEqual(ok(JSON.stringify({ status: 'opened' })));
    });

    it('should return thread status "opened" when an "opened" event exist a "closed" does not', async () => {
      const openedEvent: ThreadEvent = { pk, time: 1, eventType: 'thread_opened', byUserId: '1' };
      await loadFixture([ openedEvent ]);

      await expect(callHandler(handler, { tokenData })).resolves.toEqual(ok(JSON.stringify({ status: 'opened' })));
    });
  });
});