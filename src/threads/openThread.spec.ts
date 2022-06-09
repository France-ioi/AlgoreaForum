const sendAllStub = jest.fn(() => Promise.resolve());
jest.mock('./messages.ts', () => ({
  sendAll: sendAllStub,
}));
import { dynamodb } from '../dynamodb';
import * as parsers from '../parsers';
import { deleteAll } from '../testutils/db';
import { mockContext, mockEvent } from '../testutils/lambda';
import { tokenData } from '../testutils/mocks';
import { handler } from './openThread';
import { ForumTable } from './table';

describe('threads', () => {
  const forumTable = new ForumTable(dynamodb);
  const getTokenDataStub = jest.spyOn(parsers, 'extractTokenData');
  const getConnectionIdStub = jest.spyOn(parsers, 'getConnectionId');
  const addThreadEventStub = jest.spyOn(ForumTable.prototype, 'addThreadEvent');
  addThreadEventStub.mockResolvedValue({} as any) ;

  beforeEach(async () => {
    jest.resetAllMocks();
    await deleteAll();
  });

  describe('open thread', () => {
    it('should fail when token data is invalid', async () => {
      getTokenDataStub.mockImplementationOnce(() => {
        throw new Error('...');
      });
      await expect(handler(mockEvent(), mockContext())).rejects.toThrow(Error);
    });

    it('should succeed when token data is valid', async () => {
      getTokenDataStub.mockReturnValueOnce(tokenData(1));
      await expect(handler(mockEvent(), mockContext())).resolves.not.toThrow();
    });

    it('should fail when adding thread event fails', async () => {
      const data = tokenData(2);
      getTokenDataStub.mockReturnValueOnce(data);
      addThreadEventStub.mockRejectedValue(new Error('...'));
      await expect(handler(mockEvent(), mockContext())).rejects.toThrow(Error);
      expect(addThreadEventStub).toHaveBeenCalledWith(
        data.participantId,
        data.itemId,
        { eventType: 'thread_opened', byUserId: data.userId },
      );
    });

    it('should forbid action when thread does not belong to the user and s-he cannot watch the participant', async () => {
      const data = tokenData(3, { isMine: false, canWatchParticipant: false });
      getTokenDataStub.mockReturnValueOnce(data);
      await expect(handler(mockEvent(), mockContext())).rejects.toThrow(Error);
      expect(addThreadEventStub).not.toHaveBeenCalled();
    });

    it('should add an event "thread_opened" to the forum table', async () => {
      const data = tokenData(4);
      getTokenDataStub.mockReturnValueOnce(data);
      await handler(mockEvent(), mockContext());
      expect(addThreadEventStub).toHaveBeenCalledWith(
        data.participantId,
        data.itemId,
        { eventType: 'thread_opened', byUserId: data.userId },
      );
    });

    it('should add thread opener', async () => {
      const data = tokenData(4);
      const connectionId = 'connectionId';
      getConnectionIdStub.mockReturnValueOnce(connectionId);
      getTokenDataStub.mockReturnValueOnce(data);
      await handler(mockEvent(), mockContext());
      expect(addThreadEventStub).toHaveBeenCalledWith(
        data.participantId,
        data.itemId,
        { eventType: 'follow', userId: data.userId, connectionId, ttl: expect.any(Number) },
      );
    });

    it('should notify all followers', async () => {
      const data = tokenData(1);
      addThreadEventStub.mockRestore();
      getConnectionIdStub.mockRestore();
      const connectionId = 'connectionId';
      getTokenDataStub.mockReturnValueOnce(data);
      const followerUserId = 'followerUserId';
      const followerConnectionId = 'followerConnectionId';
      await forumTable.addThreadEvent(data.participantId, data.itemId, {
        eventType: 'follow',
        userId: followerUserId,
        connectionId: followerConnectionId,
        ttl: 12,
      });
      await handler(mockEvent({ connectionId }), mockContext());
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
