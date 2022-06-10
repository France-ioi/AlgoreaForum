const sendAllStub = jest.fn(() => Promise.resolve());
jest.mock('./messages.ts', () => ({
  sendAll: sendAllStub,
}));
import { dynamodb } from '../dynamodb';
import * as parsers from '../parsers';
import { deleteAll } from '../testutils/db';
import { mockCallback, mockContext, mockEvent } from '../testutils/lambda';
import { tokenData } from '../testutils/mocks';
import { ok, serverError, unauthorized } from '../utils/responses';
import { handler } from './closeThread';
import { ForumTable } from './table';

describe('close thread', () => {
  const forumTable = new ForumTable(dynamodb);
  const getTokenDataStub = jest.spyOn(parsers, 'extractTokenData');
  const addThreadEventStub = jest.spyOn(ForumTable.prototype, 'addThreadEvent');
  addThreadEventStub.mockReturnValue(Promise.resolve({} as any));

  beforeEach(async () => {
    jest.resetAllMocks();
    await deleteAll();
  });

  it('should fail when token data is invalid', async () => {
    getTokenDataStub.mockReturnValueOnce(null);
    await expect(handler(mockEvent(), mockContext(), mockCallback())).resolves.toEqual(unauthorized());
  });

  it('should succeed when token data is valid', async () => {
    getTokenDataStub.mockReturnValueOnce(tokenData(1));
    await expect(handler(mockEvent(), mockContext(), mockCallback())).resolves.toEqual(ok());
  });

  it('should fail gracefully when adding thread closed event fails', async () => {
    const data = tokenData(2);
    getTokenDataStub.mockReturnValueOnce(data);
    addThreadEventStub.mockReturnValueOnce(Promise.reject(new Error('...')));
    await expect(handler(mockEvent(), mockContext(), mockCallback())).resolves.toEqual(serverError());
    expect(addThreadEventStub).toHaveBeenCalledTimes(1);
    expect(addThreadEventStub).toHaveBeenLastCalledWith(
      data.participantId,
      data.itemId,
      { eventType: 'thread_closed', byUserId: data.userId },
    );
  });

  it('should add an event "thread_closed" to the forum table', async () => {
    const data = tokenData(4);
    getTokenDataStub.mockReturnValueOnce(data);
    await handler(mockEvent(), mockContext(), mockCallback());
    expect(addThreadEventStub).toHaveBeenCalledTimes(1);
    expect(addThreadEventStub).toHaveBeenLastCalledWith(
      data.participantId,
      data.itemId,
      { eventType: 'thread_closed', byUserId: data.userId },
    );
  });

  it('should notify all followers', async () => {
    const data = tokenData(1);
    addThreadEventStub.mockRestore();
    getTokenDataStub.mockReturnValueOnce(data);
    const followerUserId = 'followerUserId';
    const followerConnectionId = 'followerConnectionId';
    await forumTable.addThreadEvent(data.participantId, data.itemId, {
      eventType: 'follow',
      userId: followerUserId,
      connectionId: followerConnectionId,
      ttl: 12,
    });
    await handler(mockEvent(), mockContext(), mockCallback());
    expect(sendAllStub).toHaveBeenCalledTimes(1);
    expect(sendAllStub).toHaveBeenLastCalledWith([ followerConnectionId ], [{
      pk: expect.any(String),
      time: expect.any(Number),
      eventType: 'thread_closed',
      byUserId: data.userId,
    }]);
  });
});