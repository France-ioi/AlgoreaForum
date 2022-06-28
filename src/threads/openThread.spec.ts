const sendAllStub = jest.fn(() => Promise.resolve());
jest.mock('./messages.ts', () => ({
  sendAll: sendAllStub,
}));
import { dynamodb } from '../dynamodb';
import * as parsers from '../utils/parsers';
import { deleteAll } from '../testutils/db';
import { mockCallback, mockContext, mockEvent } from '../testutils/lambda';
import { historyMocks, tokenData } from '../testutils/mocks';
import { badRequest, forbidden, ok, serverError, unauthorized } from '../utils/responses';
import { activityLogToThreadData, handler } from './openThread';
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
      await expect(handler(mockEvent({ connectionId, body: { history: [] } }), mockContext(), mockCallback()))
        .resolves
        .toEqual(unauthorized());
    });

    it('should fail when no history is provided in body', async () => {
      getTokenDataStub.mockReturnValueOnce(tokenData(1));
      await expect(handler(mockEvent({ connectionId }), mockContext(), mockCallback()))
        .resolves
        .toEqual(badRequest('"history" is required'));
    });

    it('should succeed when token data is valid', async () => {
      getTokenDataStub.mockReturnValueOnce(tokenData(1));
      await expect(handler(mockEvent({ connectionId, body: { history: [] } }), mockContext(), mockCallback())).resolves.toEqual(ok());
    });

    it('should fail when adding thread event fails', async () => {
      const data = tokenData(2);
      getTokenDataStub.mockReturnValueOnce(data);
      addThreadEventStub.mockRejectedValue(new Error('...'));
      await expect(handler(mockEvent({ connectionId, body: { history: [] } }), mockContext(), mockCallback()))
        .resolves
        .toEqual(serverError());
      expect(addThreadEventStub).toHaveBeenCalledWith(
        data.participantId,
        data.itemId,
        { eventType: 'thread_opened', byUserId: data.userId },
      );
    });

    it('should forbid action when thread does not belong to the user and s-he cannot watch the participant', async () => {
      const data = tokenData(3, { isMine: false, canWatchParticipant: false });
      getTokenDataStub.mockReturnValueOnce(data);
      await expect(handler(mockEvent({ connectionId, body: { history: [] } }), mockContext(), mockCallback()))
        .resolves
        .toEqual(forbidden());
      expect(addThreadEventStub).not.toHaveBeenCalled();
    });

    it('should add an event "thread_opened" to the forum table', async () => {
      const data = tokenData(4);
      getTokenDataStub.mockReturnValueOnce(data);
      await handler(mockEvent({ connectionId, body: { history: [] } }), mockContext(), mockCallback());
      expect(addThreadEventStub).toHaveBeenCalledWith(
        data.participantId,
        data.itemId,
        { eventType: 'thread_opened', byUserId: data.userId },
      );
    });

    it('should add thread opener', async () => {
      const data = tokenData(4);
      getTokenDataStub.mockReturnValueOnce(data);
      await handler(mockEvent({ connectionId, body: { history: [] } }), mockContext(), mockCallback());

      expect(addThreadEventStub).toHaveBeenCalledWith(
        data.participantId,
        data.itemId,
        { eventType: 'follow', userId: data.userId, connectionId, ttl: expect.any(Number) },
      );
    });

    it('should add history as thread events', async () => {
      const data = tokenData(10);
      getTokenDataStub.mockReturnValueOnce(data);
      await expect(handler(mockEvent({
        connectionId,
        body: {
          history: [
            historyMocks.resultStarted({ item: { id: data.itemId }, participant: { id: data.participantId } }),
            historyMocks.resultValidated({ item: { id: data.itemId }, participant: { id: data.participantId } }),
          ],
        },
      }), mockContext(), mockCallback())).resolves.toEqual(ok());
      expect(addThreadEventStub).toHaveBeenCalledWith(
        data.participantId,
        data.itemId,
        expect.objectContaining({ eventType: 'attempt_started' }),
      );
      expect(addThreadEventStub).toHaveBeenCalledWith(
        data.participantId,
        data.itemId,
        expect.objectContaining({ eventType: 'submission' }),
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
      await handler(mockEvent({ connectionId, body: { history: [] } }), mockContext(), mockCallback());

      expect(sendAllStub).toHaveBeenCalledTimes(1);
      expect(sendAllStub).toHaveBeenLastCalledWith([ followerConnectionId, connectionId ], [{
        pk: expect.any(String),
        time: expect.any(Number),
        eventType: 'thread_opened',
        byUserId: data.userId,
      }]);
    });
  });

  describe('activityLogToThreadData', () => {
    it('should return null when data is not convertible', () => {
      // @ts-ignore
      expect(activityLogToThreadData({ activityType: 'something_else' })).toBe(null);
    });

    it('should convert "result_started" log into a thread input "attempt_started"', () => {
      const mock = historyMocks.resultStarted();
      expect(activityLogToThreadData(mock)).toEqual({
        itemId: mock.item.id,
        participantId: mock.participant.id,
        input: {
          eventType: 'attempt_started',
          attemptId: mock.attemptId,
        },
      });
    });

    it('should convert "result_validated" log into a thread input "submission"', () => {
      const mock = historyMocks.resultValidated();
      expect(activityLogToThreadData(mock)).toEqual({
        itemId: mock.item.id,
        participantId: mock.participant.id,
        input: {
          eventType: 'submission',
          attemptId: mock.attemptId,
          answerId: mock.answerId,
          score: mock.score,
          validated: true,
        },
      });
    });

    it('should not convert (return null) "result_validated" log without answerId', () => {
      const mock = historyMocks.resultValidated({ answerId: undefined });
      expect(activityLogToThreadData(mock)).toBe(null);
    });

    it('should convert "result_validated" log without score into a thread input "submission"', () => {
      const mock = historyMocks.resultValidated({ score: undefined });
      expect(activityLogToThreadData(mock)).toEqual({
        itemId: mock.item.id,
        participantId: mock.participant.id,
        input: {
          eventType: 'submission',
          attemptId: mock.attemptId,
          answerId: mock.answerId,
          score: mock.score,
          validated: true,
        },
      });
    });

    it('should not convert (return null) "submission" log without answerId', () => {
      const mock = historyMocks.submission({ answerId: undefined });
      expect(activityLogToThreadData(mock)).toBe(null);
    });

    it('should convert "submission" log without score into a thread input "submission"', () => {
      const mock = historyMocks.submission({ score: undefined });
      expect(activityLogToThreadData(mock)).toEqual({
        itemId: mock.item.id,
        participantId: mock.participant.id,
        input: {
          eventType: 'submission',
          attemptId: mock.attemptId,
          answerId: mock.answerId,
          score: mock.score,
          validated: false,
        },
      });
    });

    it('should convert "submission" log into a thread input "submission"', () => {
      const mock = historyMocks.submission({ score: 42 });
      expect(activityLogToThreadData(mock)).toEqual({
        itemId: mock.item.id,
        participantId: mock.participant.id,
        input: {
          eventType: 'submission',
          attemptId: mock.attemptId,
          answerId: mock.answerId,
          score: mock.score,
          validated: false,
        },
      });
    });

    it('should convert "submission" log with score of 100 into a thread input "submission"', () => {
      const mock = historyMocks.submission({ score: 100 });
      expect(activityLogToThreadData(mock)).toEqual({
        itemId: mock.item.id,
        participantId: mock.participant.id,
        input: {
          eventType: 'submission',
          attemptId: mock.attemptId,
          answerId: mock.answerId,
          score: mock.score,
          validated: true,
        },
      });
    });
  });
});
