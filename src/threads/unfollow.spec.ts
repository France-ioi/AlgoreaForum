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
    const data = tokenData(4);
    const otherUserId = 'otherUserId';
    const followEventToDelete = followEventMock(data.participantId, data.itemId, { connectionId, userId: data.userId, time: 1 });
    const followEventToKeep = followEventMock(data.participantId, data.itemId, { connectionId, userId: otherUserId, time: 2 });
    const sendStub = jest.spyOn(messages, 'send');
    const callHandler = () => handler(mockEvent({ connectionId, tokenData: data }), mockContext(), mockCallback());

    beforeEach(async () => {
      sendStub.mockImplementation(() => Promise.resolve());
      await loadFixture([ followEventToDelete, followEventToKeep ]);
    });

    it('should remove thread event "follow" of user matching token data only', async () => {
      await expect(callHandler()).resolves.toEqual(ok());
      const all = await getAll();
      expect(all.Items).toEqual([ toDBItem(followEventToKeep) ]);
    });

    it('should fail when removing follow event fails', async () => {
      const removeThreadEventStub = jest.spyOn(ForumTable.prototype, 'removeThreadEvent');
      removeThreadEventStub.mockRejectedValue(new Error('...'));
      await expect(callHandler()).resolves.toEqual(serverError());
      expect(removeThreadEventStub).toHaveBeenCalledTimes(1);
    });
  });
});