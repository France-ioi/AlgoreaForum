import * as messages from './messages';
import { callHandler } from '../testutils/lambda';
import { mockTokenData } from '../testutils/mocks';
import { handler } from './unsubscribe';
import { ForumTable, ThreadEvent } from './table';
import { badRequest, ok, serverError, unauthorized } from '../utils/responses';
import { deleteAll, getAll, loadFixture } from '../testutils/db';
import { fromDBItem } from '../dynamodb';

describe('subscribe', () => {
  let sendAllStub = jest.spyOn(messages, 'sendAll');
  const connectionId = 'connectionId';
  const tokenData = mockTokenData(1);
  const pk = ForumTable.getThreadId(tokenData.participantId, tokenData.itemId);

  beforeEach(async () => {
    jest.restoreAllMocks();
    sendAllStub = jest.spyOn(messages, 'sendAll');
    sendAllStub.mockResolvedValue();
    await deleteAll();
  });

  it('should fail without connectionId', async () => {
    await expect(callHandler(handler)).resolves.toEqual(badRequest('connectionId is required'));
  });

  it('should fail when token data is invalid', async () => {
    await expect(callHandler(handler, { connectionId })).resolves.toEqual(unauthorized());
    // @ts-ignore
    await expect(callHandler(handler, { connectionId, tokenData: { whatever: 42 } })).resolves.toEqual(unauthorized());
  });


  it('should fail when listing last events fails', async () => {
    const getThreadEventsStub = jest.spyOn(ForumTable.prototype, 'getThreadEvents');
    getThreadEventsStub.mockRejectedValue(new Error('...'));
    await expect(callHandler(handler, { connectionId, tokenData })).resolves.toEqual(serverError());
    expect(getThreadEventsStub).toHaveBeenCalledTimes(1);
  });

  it('should not try removing the event when there is no event to remove', async () => {
    const removeThreadEventStub = jest.spyOn(ForumTable.prototype, 'removeThreadEvent');
    await expect(callHandler(handler, { tokenData, connectionId })).resolves.toEqual(ok());
    expect(removeThreadEventStub).not.toHaveBeenCalled();
  });

  describe('with valid data', () => {
    const userId1 = 'userId1';
    const connectionId1 = 'connectionId1';
    const userId2 = 'userId2';
    const connectionId2 = 'connectionId2';
    const ttl = 10000;
    const subscribeEventToDelete: ThreadEvent = { pk, time: 1, eventType: 'subscribe', connectionId, userId: tokenData.userId, ttl };
    const subscribeEventToKeep1: ThreadEvent = { pk, time: 2, eventType: 'subscribe', connectionId: connectionId1, userId: userId1, ttl };
    const subscribeEventToKeep2: ThreadEvent = { pk, time: 3, eventType: 'subscribe', connectionId: connectionId2, userId: userId2, ttl };
    let sendAllStub = jest.spyOn(messages, 'sendAll');

    beforeEach(async () => {
      sendAllStub = jest.spyOn(messages, 'sendAll');
      sendAllStub.mockResolvedValue();
      await loadFixture([ subscribeEventToDelete, subscribeEventToKeep1, subscribeEventToKeep2 ]);
    });

    it('should remove thread event "subscribe" of user matching token data only', async () => {
      await expect(callHandler(handler, { connectionId, tokenData })).resolves.toEqual(ok());
      const all = await getAll();
      expect(all.Items?.map(fromDBItem)).toEqual([ subscribeEventToKeep1, subscribeEventToKeep2 ]);
    });

    it('should fail when removing subscribe event fails', async () => {
      const removeThreadEventStub = jest.spyOn(ForumTable.prototype, 'removeThreadEvent');
      removeThreadEventStub.mockRejectedValue(new Error('...'));
      await expect(callHandler(handler, { connectionId, tokenData })).resolves.toEqual(serverError());
      expect(removeThreadEventStub).toHaveBeenCalledTimes(1);
    });

    it('should notify other subscribers of the unsubscribe event', async () => {
      await callHandler(handler, { connectionId, tokenData });
      const unsubscribeEvent = { ...subscribeEventToDelete, time: expect.any(Number), eventType: 'unsubscribe' };
      expect(sendAllStub).toHaveBeenCalledWith([ connectionId1, connectionId2 ], [ unsubscribeEvent ]);
    });
  });
});