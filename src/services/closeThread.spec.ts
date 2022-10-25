import { fromDBItem } from '../dynamodb';
import { deleteAll, getAll, loadFixture } from '../testutils/db';
import { callHandler } from '../testutils/lambda';
import { mockTokenData } from '../testutils/mocks';
import { ok, serverError, unauthorized } from '../utils/responses';
import { handler } from './closeThread';
import { ThreadEvent } from '../thread-models/thread-events';
import * as messages from './messages';
import { ForumTable } from '../forum-table';

describe('close thread', () => {
  const tokenData = mockTokenData(1);
  // const pk = ForumTable.getThreadId(tokenData.participantId, tokenData.itemId);
  let sendAllStub = jest.spyOn(messages, 'sendAll');

  beforeEach(async () => {
    jest.restoreAllMocks();
    sendAllStub = jest.spyOn(messages, 'sendAll');
    sendAllStub.mockImplementation(() => Promise.resolve());
    await deleteAll();
  });

  it('should fail when token data is invalid', async () => {
    await expect(callHandler(handler)).resolves.toEqual(unauthorized());
  });

  it('should succeed when token data is valid', async () => {
    await expect(callHandler(handler, { tokenData })).resolves.toEqual(ok());
  });

  it('should fail gracefully when adding thread closed event fails', async () => {
    const addThreadEventStub = jest.spyOn(ForumTable.prototype, 'addThreadEvent');
    addThreadEventStub.mockRejectedValue(new Error());
    await expect(callHandler(handler, { tokenData })).resolves.toEqual(serverError());
    expect(addThreadEventStub).toHaveBeenCalledTimes(1);
  });

  it('should add an event "thread_closed" to the forum table', async () => {
    await callHandler(handler, { tokenData });
    const result = await getAll();
    expect(result.Items?.map(fromDBItem)).toEqual([{
      pk,
      time: expect.any(Number),
      eventType: 'thread_closed',
      byUserId: tokenData.userId,
    }]);
  });

  it('should notify all subscribers', async () => {
    const subscribeEvent1: ThreadEvent = {
      pk,
      time: 1,
      eventType: 'subscribe',
      connectionId: 'subscriberConnectionId',
      userId: 'subscriberUserId1',
      ttl: 10000,
    };
    const subscribeEvent2: ThreadEvent = { ...subscribeEvent1, time: 2, connectionId: 'connectionId2', userId: 'userId2' };
    await loadFixture([ subscribeEvent1, subscribeEvent2 ]);
    await callHandler(handler, { tokenData });
    expect(sendAllStub).toHaveBeenCalledTimes(1);
    expect(sendAllStub).toHaveBeenLastCalledWith([ subscribeEvent1.connectionId, subscribeEvent2.connectionId ], [{
      pk: expect.any(String),
      time: expect.any(Number),
      eventType: 'thread_closed',
      byUserId: tokenData.userId,
    }]);
  });
});