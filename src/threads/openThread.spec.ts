import { fromDBItem } from '../dynamodb';
import * as messages from './messages';
import { deleteAll, getAll, loadFixture } from '../testutils/db';
import { callHandler } from '../testutils/lambda';
import { historyMocks, tokenData } from '../testutils/mocks';
import { badRequest, forbidden, ok, serverError, unauthorized } from '../utils/responses';
import { activityLogToThreadData, handler } from './openThread';
import { ForumTable, ThreadEvent } from './table';

describe('threads', () => {
  const connectionId = 'connectionId';
  const body = { history: [] };
  const data = tokenData(1);
  const pk = ForumTable.getThreadId(data.participantId, data.itemId);
  let sendAllStub = jest.spyOn(messages, 'sendAll');

  beforeEach(async () => {
    jest.restoreAllMocks();
    sendAllStub = jest.spyOn(messages, 'sendAll');
    sendAllStub.mockResolvedValue();
    await deleteAll();
  });

  describe('open thread', () => {
    it('should fail when no connection id', async () => {
      await expect(callHandler(handler)).resolves.toEqual(badRequest());
    });

    it('should fail without token data', async () => {
      await expect(callHandler(handler, { connectionId }))
        .resolves
        .toEqual(unauthorized());
    });

    it('should fail when no history is provided in body', async () => {
      await expect(callHandler(handler, { connectionId, tokenData: data }))
        .resolves
        .toEqual(badRequest('"history" is required'));
    });

    it('should forbid action when thread does not belong to the user and s-he cannot watch the participant', async () => {
      const data = tokenData(3, { isMine: false, canWatchParticipant: false });
      await expect(callHandler(handler, { connectionId, tokenData: data, body }))
        .resolves
        .toEqual(forbidden());
    });

    it('should fail when adding thread events fails', async () => {
      const stub = jest.spyOn(ForumTable.prototype, 'addThreadEvents');
      stub.mockRejectedValue(new Error('...'));
      await expect(callHandler(handler, { connectionId, tokenData: data, body }))
        .resolves
        .toEqual(serverError());
      expect(stub).toHaveBeenCalled();
    });

    it('should succeed when token data is valid', async () => {
      await expect(callHandler(handler, { connectionId, tokenData: data, body })).resolves.toEqual(ok());
    });

    it('should add an event "thread_opened" to the forum table', async () => {
      await callHandler(handler, { connectionId, tokenData: data, body });
      const result = await getAll();
      expect(result.Items?.map(fromDBItem)).toContainEqual({
        pk,
        time: expect.any(Number),
        eventType: 'thread_opened',
        byUserId: data.userId,
      });
    });

    it('should add thread opener as follower', async () => {
      await callHandler(handler, { connectionId, tokenData: data, body });
      const result = await getAll();
      expect(result.Items?.map(fromDBItem)).toContainEqual({
        pk,
        time: expect.any(Number),
        eventType: 'follow',
        userId: data.userId,
        connectionId,
        ttl: expect.any(Number),
      });
    });

    it('should add history as thread events', async () => {
      const resultStarted = historyMocks.resultStarted({ item: { id: data.itemId }, participant: { id: data.participantId } });
      const resultValidated = historyMocks.resultValidated({ item: { id: data.itemId }, participant: { id: data.participantId } });
      await expect(callHandler(handler, {
        connectionId,
        tokenData: data,
        body: {
          history: [ resultStarted, resultValidated ],
        },
      })).resolves.toEqual(ok());
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
      const resultStarted = historyMocks.resultStarted({ item: { id: data.itemId }, participant: { id: data.participantId } });
      const resultValidated = historyMocks.resultValidated({ item: { id: data.itemId }, participant: { id: data.participantId } });
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
      await loadFixture([ followEvent ]);
      await callHandler(handler, {
        connectionId,
        tokenData: data,
        body: { history: [ resultStarted, resultValidated ] },
      });
      expect(sendAllStub).toHaveBeenCalledTimes(1);
      expect(sendAllStub).toHaveBeenLastCalledWith([ followerConnectionId, connectionId ], [
        expect.objectContaining({ eventType: 'attempt_started' }),
        expect.objectContaining({ eventType: 'submission' }),
        expect.objectContaining({ eventType: 'thread_opened', byUserId: data.userId }),
      ]);

      const result = await getAll();
      expect(result.Items?.map(fromDBItem)).toEqual([
        expect.objectContaining({ eventType: 'attempt_started' }),
        expect.objectContaining({ eventType: 'submission' }),
        expect.objectContaining({ eventType: 'follow', userId: followerUserId }),
        expect.objectContaining({ eventType: 'follow', userId: data.userId }),
        expect.objectContaining({ eventType: 'thread_opened', byUserId: data.userId }),
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
