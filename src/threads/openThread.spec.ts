import { fromDBItem } from '../dynamodb';
import * as messages from './messages';
import { deleteAll, getAll, loadFixture } from '../testutils/db';
import { callHandler } from '../testutils/lambda';
import { historyMocks, mockTokenData } from '../testutils/mocks';
import { badRequest, forbidden, ok, serverError, unauthorized } from '../utils/responses';
import { activityLogToThreadData, handler } from './openThread';
import { ForumTable, ThreadEvent } from './table';

describe('threads', () => {
  const connectionId = 'connectionId';
  const body = { history: [] };
  const tokenData = mockTokenData(1);
  const pk = ForumTable.getThreadId(tokenData.participantId, tokenData.itemId);
  let sendAllStub = jest.spyOn(messages, 'sendAll');

  beforeEach(async () => {
    jest.restoreAllMocks();
    sendAllStub = jest.spyOn(messages, 'sendAll');
    sendAllStub.mockResolvedValue();
    await deleteAll();
  });

  describe('open thread', () => {
    const item = { id: tokenData.itemId };
    const participant = { id: tokenData.participantId };

    it('should fail when no connection id', async () => {
      await expect(callHandler(handler)).resolves.toEqual(badRequest());
    });

    it('should fail without token data', async () => {
      await expect(callHandler(handler, { connectionId }))
        .resolves
        .toEqual(unauthorized());
    });

    it('should fail when no history is provided in body', async () => {
      await expect(callHandler(handler, { connectionId, tokenData }))
        .resolves
        .toEqual(badRequest('"history" is required'));
    });

    it('should forbid action when thread does not belong to the user and s-he cannot watch the participant', async () => {
      const tokenData = mockTokenData(3, { isMine: false, canWatchParticipant: false });
      await expect(callHandler(handler, { connectionId, tokenData, body }))
        .resolves
        .toEqual(forbidden());
    });

    it('should fail when adding thread events fails', async () => {
      const stub = jest.spyOn(ForumTable.prototype, 'addThreadEvents');
      stub.mockRejectedValue(new Error('...'));
      await expect(callHandler(handler, { connectionId, tokenData, body }))
        .resolves
        .toEqual(serverError());
      expect(stub).toHaveBeenCalled();
    });

    it('should succeed when token data is valid', async () => {
      await expect(callHandler(handler, { connectionId, tokenData, body })).resolves.toEqual(ok());
    });

    it('should add an event "thread_opened" to the forum table', async () => {
      await callHandler(handler, { connectionId, tokenData, body });
      const result = await getAll();
      expect(result.Items?.map(fromDBItem)).toContainEqual({
        pk,
        time: expect.any(Number),
        eventType: 'thread_opened',
        byUserId: tokenData.userId,
      });
    });

    it('should add thread opener as follower', async () => {
      await callHandler(handler, { connectionId, tokenData, body });
      const result = await getAll();
      expect(result.Items?.map(fromDBItem)).toContainEqual({
        pk,
        time: expect.any(Number),
        eventType: 'follow',
        userId: tokenData.userId,
        connectionId,
        ttl: expect.any(Number),
      });
    });

    it('should add history as thread events', async () => {
      const resultStarted = historyMocks.resultStarted({ item, participant });
      const resultValidated = historyMocks.resultValidated({ item, participant });
      const body = { history: [ resultStarted, resultValidated ] };
      await expect(callHandler(handler, { connectionId, tokenData, body })).resolves.toEqual(ok());
      const result = await getAll();
      const threadEvents = result.Items?.map(fromDBItem);
      expect(threadEvents).toContainEqual({
        pk,
        time: resultStarted.at.valueOf(),
        eventType: 'attempt_started',
        attemptId: resultStarted.attemptId,
      });
      expect(threadEvents).toContainEqual({
        pk,
        time: resultValidated.at.valueOf(),
        eventType: 'submission',
        attemptId: resultValidated.attemptId,
        answerId: resultValidated.answerId,
        score: resultValidated.score,
        validated: true,
      });
    });

    it('should notify all followers', async () => {
      const resultStarted = historyMocks.resultStarted({ item, participant });
      const resultValidated = historyMocks.resultValidated({ item, participant });
      const followerUserId = 'followerUserId';
      const followerConnectionId = 'followerConnectionId';
      const followEvent: ThreadEvent = {
        pk,
        time: Date.now() - 100000, // a tiny bit in the past
        eventType: 'follow',
        userId: followerUserId,
        connectionId: followerConnectionId,
        ttl: 1000,
      };
      const body = { history: [ resultStarted, resultValidated ] };
      await loadFixture([ followEvent ]);
      await callHandler(handler, { connectionId, tokenData, body });
      expect(sendAllStub).toHaveBeenCalledTimes(1);
      expect(sendAllStub).toHaveBeenLastCalledWith([ followerConnectionId, connectionId ], [
        expect.objectContaining({ eventType: 'attempt_started' }),
        expect.objectContaining({ eventType: 'submission' }),
        expect.objectContaining({ eventType: 'thread_opened', byUserId: tokenData.userId }),
      ]);

      const result = await getAll();
      expect(result.Items?.map(fromDBItem)).toEqual([
        expect.objectContaining({ eventType: 'attempt_started' }),
        expect.objectContaining({ eventType: 'submission' }),
        expect.objectContaining({ eventType: 'follow', userId: followerUserId }),
        expect.objectContaining({ eventType: 'follow', userId: tokenData.userId }),
        expect.objectContaining({ eventType: 'thread_opened', byUserId: tokenData.userId }),
      ]);
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
        at: mock.at,
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
        at: mock.at,
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
        at: mock.at,
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
        at: mock.at,
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
        at: mock.at,
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
        at: mock.at,
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
