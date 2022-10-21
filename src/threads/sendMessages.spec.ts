import { deleteAll, getAll, loadFixture } from '../testutils/db';
import { callHandler } from '../testutils/lambda';
import { mockTokenData } from '../testutils/mocks';
import { badRequest, ok, serverError, unauthorized } from '../utils/responses';
import { handler } from './sendMessage';
import * as messages from './messages';
import { ForumTable, ThreadEvent } from './table';
import { fromDBItem } from '../dynamodb';

describe('sendMessage handler', () => {
  const connectionId = 'connectionId';
  const tokenData = mockTokenData(1);
  const payload = { message: 'Hello world' };
  let sendAllStub = jest.spyOn(messages, 'sendAll');

  beforeEach(async () => {
    jest.restoreAllMocks();
    sendAllStub = jest.spyOn(messages, 'sendAll');
    sendAllStub.mockImplementation(() => Promise.resolve());
    await deleteAll();
  });

  it('should return "bad request" when no connection id', async () => {
    await expect(callHandler(handler)).resolves.toEqual(badRequest());
  });

  it('should return "unauthorized" when no token data', async () => {
    await expect(callHandler(handler, { connectionId })).resolves.toEqual(unauthorized());
  });

  it('should return "bad request" when no payload', async () => {
    await expect(callHandler(handler, { connectionId, tokenData })).resolves.toEqual(badRequest());
  });

  it('should return "bad request" when message is empty', async () => {
    await expect(callHandler(handler, { connectionId, tokenData, body: { message: '' } })).resolves.toEqual(badRequest());
  });

  it('should let aws errors bubble when it happens on "add" operation', async () => {
    const stub = jest.spyOn(ForumTable.prototype, 'addThreadEvent');
    stub.mockRejectedValue(new Error());
    await expect(callHandler(handler, { connectionId, tokenData, body: payload })).resolves.toEqual(serverError());
  });

  it('should let aws errors bubble when it happens on "get subscribers" operation', async () => {
    const stub = jest.spyOn(ForumTable.prototype, 'getSubscribers');
    stub.mockRejectedValue(new Error());
    await expect(callHandler(handler, { connectionId, tokenData, body: payload })).resolves.toEqual(serverError());
  });

  describe('success cases', () => {
    const pk = ForumTable.getThreadId(tokenData.participantId, tokenData.itemId);
    const ttl = 10000;
    const subscriber1: ThreadEvent = { pk, time: 1, eventType: 'subscribe', connectionId, ttl, userId: tokenData.userId };
    const subscriber2: ThreadEvent = { pk, time: 2, eventType: 'subscribe', connectionId: 'connectionId', ttl, userId: 'userId2' };
    const expectedCreatedEvent: ThreadEvent = {
      pk,
      time: expect.any(Number),
      eventType: 'message',
      userId: tokenData.userId,
      content: payload.message,
    };

    beforeEach(async () => {
      await loadFixture([ subscriber1, subscriber2 ]);
    });

    it('should add thread event "message"', async () => {
      await expect(callHandler(handler, { connectionId, tokenData, body: payload })).resolves.toEqual(ok());
      const results = await getAll();
      expect(results.Items?.map(fromDBItem)).toContainEqual(expectedCreatedEvent);
    });

    it('should send new thread event "message" to subscribers', async () => {
      await expect(callHandler(handler, { connectionId, tokenData, body: payload })).resolves.toEqual(ok());
      expect(sendAllStub).toHaveBeenCalledWith([ subscriber1.connectionId, subscriber2.connectionId ], [ expectedCreatedEvent ]);
    });
  });
});
