import * as messages from './messages';
import { callHandler } from '../testutils/lambda';
import { mockTokenData } from '../testutils/mocks';
import { handler } from './subscribe';
import { ForumTable, ThreadEvent } from './table';
import { badRequest, serverError, unauthorized } from '../utils/responses';
import { deleteAll, getAll, loadFixture } from '../testutils/db';
import { fromDBItem } from '../dynamodb';

describe('subscribe', () => {
  const connectionId = 'connectionId';
  const tokenData = mockTokenData(1);
  let sendStub = jest.spyOn(messages, 'send');
  let sendAllStub = jest.spyOn(messages, 'sendAll');

  beforeEach(() => {
    jest.restoreAllMocks();
    sendStub = jest.spyOn(messages, 'send');
    sendStub.mockImplementation(() => Promise.resolve());
    sendAllStub = jest.spyOn(messages, 'sendAll');
    sendAllStub.mockImplementation(() => Promise.resolve());
  });

  it('should return "bad request" when no connection id', async () => {
    await expect(callHandler(handler)).resolves.toEqual(badRequest());
  });

  it('should fail when token data is invalid', async () => {
    await expect(callHandler(handler, { connectionId })).resolves.toEqual(unauthorized());
  });

  it('should fail when adding subscribe event fails', async () => {
    const stub = jest.spyOn(ForumTable.prototype, 'addThreadEvent');
    stub.mockRejectedValue(new Error());
    await expect(callHandler(handler, { connectionId, tokenData })).resolves.toEqual(serverError());
    expect(stub).toHaveBeenCalledTimes(1);
  });

  it('should fail when listing last events fails', async () => {
    const stub = jest.spyOn(ForumTable.prototype, 'getThreadEvents');
    stub.mockRejectedValue(new Error());
    await expect(callHandler(handler, { connectionId, tokenData })).resolves.toEqual(serverError());
    expect(stub).toHaveBeenCalled();
  });

  describe('with valid data', () => {
    const pk = ForumTable.getThreadId(tokenData.participantId, tokenData.itemId);
    const last20Events = Array.from({ length: 20 }, (_, index): ThreadEvent => ({
      pk,
      time: (index + 1) * 10,
      eventType: index % 2 === 0 ? 'thread_opened' : 'thread_closed',
      byUserId: `${tokenData.userId}-${index + 1}`,
    }));
    const last19Events = last20Events.slice(1).reverse();

    beforeEach(async () => {
      await deleteAll();
      await loadFixture(last20Events);
      await callHandler(handler, { connectionId, tokenData });
    });

    it('should have added a thread event "subscribe"', async () => {
      const result = await getAll();
      expect(result.Items?.map(fromDBItem)).toContainEqual({
        pk: expect.any(String),
        time: expect.any(Number),
        eventType: 'subscribe',
        connectionId,
        userId: tokenData.userId,
        ttl: expect.any(Number),
      });
    });

    it('should send last 20 events to new connection including new "subscribe" event', () => {
      expect(sendStub).toHaveBeenLastCalledWith(connectionId, [
        expect.objectContaining({
          pk: expect.any(String),
          time: expect.any(Number),
          eventType: 'subscribe', // the event we added by actually subscribing the thread
          userId: tokenData.userId,
          connectionId,
          ttl: expect.any(Number),
        }),
        ...last19Events,
      ]);
    });

    it('should send the new subscribe event to other subscribers', () => {
      expect(sendAllStub).toHaveBeenCalledWith(expect.anything(), [
        expect.objectContaining({
          pk: expect.any(String),
          time: expect.any(Number),
          eventType: 'subscribe',
          userId: tokenData.userId,
          connectionId,
          ttl: expect.any(Number),
        }),
      ]);
    });
  });
});