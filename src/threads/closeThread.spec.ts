import { fromDBItem } from '../dynamodb';
import { deleteAll, getAll, loadFixture } from '../testutils/db';
import { callHandler } from '../testutils/lambda';
import { tokenData } from '../testutils/mocks';
import { ok, serverError, unauthorized } from '../utils/responses';
import { handler } from './closeThread';
import { ForumTable, ThreadEvent } from './table';
import * as messages from './messages';

describe('close thread', () => {
  const data = tokenData(1);
  const pk = ForumTable.getThreadId(data.participantId, data.itemId);
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
    await expect(callHandler(handler, { tokenData: data })).resolves.toEqual(ok());
  });

  it('should fail gracefully when adding thread closed event fails', async () => {
    const addThreadEventStub = jest.spyOn(ForumTable.prototype, 'addThreadEvent');
    addThreadEventStub.mockRejectedValue(new Error());
    await expect(callHandler(handler, { tokenData: data })).resolves.toEqual(serverError());
    expect(addThreadEventStub).toHaveBeenCalledTimes(1);
  });

  it('should add an event "thread_closed" to the forum table', async () => {
    await callHandler(handler, { tokenData: data });
    const result = await getAll();
    expect(result.Items?.map(fromDBItem)).toEqual([{
      pk,
      time: expect.any(Number),
      eventType: 'thread_closed',
      byUserId: data.userId,
    }]);
  });

  it('should notify all followers', async () => {
    const followEvent1: ThreadEvent = {
      pk,
      time: 1,
      eventType: 'follow',
      connectionId: 'followerConnectionId',
      userId: 'followerUserId1',
      ttl: 10000,
    };
    const followEvent2: ThreadEvent = { ...followEvent1, time: 2, connectionId: 'connectionId2', userId: 'userId2' };
    await loadFixture([ followEvent1, followEvent2 ]);
    await callHandler(handler, { tokenData: data });
    expect(sendAllStub).toHaveBeenCalledTimes(1);
    expect(sendAllStub).toHaveBeenLastCalledWith([ followEvent1.connectionId, followEvent2.connectionId ], [{
      pk: expect.any(String),
      time: expect.any(Number),
      eventType: 'thread_closed',
      byUserId: data.userId,
    }]);
  });
});