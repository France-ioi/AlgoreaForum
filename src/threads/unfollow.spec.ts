import * as messages from './messages';
import { mockCallback, mockContext, mockEvent } from '../testutils/lambda';
import { followEventMock, tokenData } from '../testutils/mocks';
import { handler } from './unfollow';
import { ForumTable } from './table';
import { badRequest, ok, serverError, unauthorized } from '../utils/responses';
import { deleteAll, getAll, loadFixture } from '../testutils/db';
import { toDBItem } from '../dynamodb';

describe('follow', () => {
  const connectionId = 'connectionId';

  beforeEach(async () => {
    await deleteAll();
    jest.restoreAllMocks();
  });

  it('should fail without connectionId', async () => {
    await expect(handler(mockEvent(), mockContext(), mockCallback())).resolves.toEqual(badRequest('connectionId is required'));
  });

  it('should fail when token data is invalid', async () => {
    await expect(handler(mockEvent({ connectionId }), mockContext(), mockCallback())).resolves.toEqual(unauthorized());
    // @ts-ignore
    await expect(handler(mockEvent({ connectionId, tokenData: { whatever: 42 } }), mockContext(), mockCallback()))
      .resolves
      .toEqual(unauthorized());
  });


  it('should fail when listing last events fails', async () => {
    const data = tokenData(2);
    const getThreadEventsStub = jest.spyOn(ForumTable.prototype, 'getThreadEvents');
    getThreadEventsStub.mockRejectedValue(new Error('...'));
    await expect(handler(mockEvent({ connectionId, tokenData: data }), mockContext(), mockCallback()))
      .resolves
      .toEqual(serverError());
    expect(getThreadEventsStub).toHaveBeenCalledTimes(1);
  });

  it('should not try removing the event when there is no event to remove', async () => {
    const data = tokenData(3);
    const removeThreadEventStub = jest.spyOn(ForumTable.prototype, 'removeThreadEvent');
    await expect(handler(mockEvent({ tokenData: data, connectionId }), mockContext(), mockCallback()))
      .resolves
      .toEqual(ok());
    expect(removeThreadEventStub).not.toHaveBeenCalled();
  });

  describe('with valid data', () => {
    const connectionId = 'connectionId';
    const data = tokenData(4);
    const userId1 = 'userId1';
    const connectionId1 = 'connectionId1';
    const userId2 = 'userId2';
    const connectionId2 = 'connectionId2';
    const followEventToDelete = followEventMock(data.participantId, data.itemId, { connectionId, userId: data.userId, time: 1 });
    const followEventToKeep1 = followEventMock(data.participantId, data.itemId, { connectionId: connectionId1, userId: userId1, time: 2 });
    const followEventToKeep2 = followEventMock(data.participantId, data.itemId, { connectionId: connectionId2, userId: userId2, time: 3 });
    let sendStub!: jest.SpyInstance<Promise<void>, [connectionId: string, messages: any[]]>;
    const callHandler = () => handler(mockEvent({ connectionId, tokenData: data }), mockContext(), mockCallback());

    beforeEach(async () => {
      sendStub = jest.spyOn(messages, 'send');
      sendStub.mockResolvedValue(undefined);
      await loadFixture([ followEventToDelete, followEventToKeep1, followEventToKeep2 ]);
    });

    it('should remove thread event "follow" of user matching token data only', async () => {
      await expect(callHandler()).resolves.toEqual(ok());
      const all = await getAll();
      expect(all.Items).toEqual([ toDBItem(followEventToKeep1), toDBItem(followEventToKeep2) ]);
    });

    it('should fail when removing follow event fails', async () => {
      const removeThreadEventStub = jest.spyOn(ForumTable.prototype, 'removeThreadEvent');
      removeThreadEventStub.mockRejectedValue(new Error('...'));
      await expect(callHandler()).resolves.toEqual(serverError());
      expect(removeThreadEventStub).toHaveBeenCalledTimes(1);
    });

    it('should notify other followers of the unfollow event', async () => {
      await callHandler();
      const unfollowEvent = { ...followEventToDelete, eventType: 'unfollow' };
      expect(sendStub).toHaveBeenCalledWith(connectionId1, [ unfollowEvent ]);
      expect(sendStub).toHaveBeenCalledWith(connectionId2, [ unfollowEvent ]);
    });

    it('should not notify self of the unfollow event', async () => {
      await callHandler();
      expect(sendStub).not.toHaveBeenCalledWith(connectionId, expect.anything());
    });
  });
});