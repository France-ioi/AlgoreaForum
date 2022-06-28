const sendAllStub = jest.fn(() => Promise.resolve());
jest.mock('./messages.ts', () => ({
  sendAll: sendAllStub,
}));
import { dynamodb } from '../dynamodb';
import * as parsers from '../utils/parsers';
import { deleteAll } from '../testutils/db';
import { mockCallback, mockContext, mockEvent } from '../testutils/lambda';
import { tokenData } from '../testutils/mocks';
import { badRequest, forbidden, ok, serverError, unauthorized } from '../utils/responses';
import { handler } from './openThread';
import { ForumTable } from './table';

describe('threads', () => {
  const forumTable = new ForumTable(dynamodb);
  const connectionId = 'connectionId';
  const getTokenDataStub = jest.spyOn(parsers, 'extractTokenData');
  const addThreadEventStub = jest.spyOn(ForumTable.prototype, 'addThreadEvent');
  addThreadEventStub.mockResolvedValue({} as any) ;

  beforeEach(async () => {
    jest.resetAllMocks();
    await deleteAll();
  });

  describe('open thread', () => {
    it('should fail when no connection id', async () => {
      await expect(handler(mockEvent(), mockContext(), mockCallback())).resolves.toEqual(badRequest());
    });

    it('should fail when token data is invalid', async () => {
      getTokenDataStub.mockReturnValueOnce(null);
      await expect(handler(mockEvent({ connectionId }), mockContext(), mockCallback())).resolves.toEqual(unauthorized());
    });

    it('should succeed when token data is valid', async () => {
      getTokenDataStub.mockReturnValueOnce(tokenData(1));
      await expect(handler(mockEvent({ connectionId }), mockContext(), mockCallback())).resolves.toEqual(ok());
    });

    it('should fail when adding thread event fails', async () => {
      const data = tokenData(2);
      getTokenDataStub.mockReturnValueOnce(data);
      addThreadEventStub.mockRejectedValue(new Error('...'));
      await expect(handler(mockEvent({ connectionId }), mockContext(), mockCallback())).resolves.toEqual(serverError());
      expect(addThreadEventStub).toHaveBeenCalledWith(
        data.participantId,
        data.itemId,
        { eventType: 'thread_opened', byUserId: data.userId },
      );
    });

    it('should forbid action when thread does not belong to the user and s-he cannot watch the participant', async () => {
      const data = tokenData(3, { isMine: false, canWatchParticipant: false });
      getTokenDataStub.mockReturnValueOnce(data);
      await expect(handler(mockEvent({ connectionId }), mockContext(), mockCallback())).resolves.toEqual(forbidden());
      expect(addThreadEventStub).not.toHaveBeenCalled();
    });

    it('should add an event "thread_opened" to the forum table', async () => {
      const data = tokenData(4);
      getTokenDataStub.mockReturnValueOnce(data);
      await handler(mockEvent({ connectionId }), mockContext(), mockCallback());
      expect(addThreadEventStub).toHaveBeenCalledWith(
        data.participantId,
        data.itemId,
        { eventType: 'thread_opened', byUserId: data.userId },
      );
    });

    it('should add thread opener', async () => {
      const data = tokenData(4);
      getTokenDataStub.mockReturnValueOnce(data);
      await handler(mockEvent({ connectionId }), mockContext(), mockCallback());
      expect(addThreadEventStub).toHaveBeenCalledWith(
        data.participantId,
        data.itemId,
        { eventType: 'follow', userId: data.userId, connectionId, ttl: expect.any(Number) },
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
      await handler(mockEvent({ connectionId }), mockContext(), mockCallback());
      expect(sendAllStub).toHaveBeenCalledTimes(1);
      expect(sendAllStub).toHaveBeenLastCalledWith([ followerConnectionId, connectionId ], [{
        pk: expect.any(String),
        time: expect.any(Number),
        eventType: 'thread_opened',
        byUserId: data.userId,
      }]);
    });
  });
});
