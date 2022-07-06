import * as messages from './messages';
import { callHandler } from '../testutils/lambda';
import { tokenData } from '../testutils/mocks';
import { handler } from './follow';
import { ForumTable, ThreadEvent } from './table';
import { badRequest, serverError, unauthorized } from '../utils/responses';
import { deleteAll, getAll, loadFixture } from '../testutils/db';
import { fromDBItem } from '../dynamodb';

describe('follow', () => {
  const connectionId = 'connectionId';
  const data = tokenData(1);
  let sendStub = jest.spyOn(messages, 'send');

  beforeEach(() => {
    jest.restoreAllMocks();
    sendStub = jest.spyOn(messages, 'send');
    sendStub.mockImplementation(() => Promise.resolve());
  });

  it('should return "bad request" when no connection id', async () => {
    await expect(callHandler(handler)).resolves.toEqual(badRequest());
  });

  it('should fail when token data is invalid', async () => {
    await expect(callHandler(handler, { connectionId })).resolves.toEqual(unauthorized());
  });

  it('should fail when adding follow event fails', async () => {
    const stub = jest.spyOn(ForumTable.prototype, 'addThreadEvent');
    stub.mockRejectedValue(new Error());
    await expect(callHandler(handler, { connectionId, tokenData: data })).resolves.toEqual(serverError());
    expect(stub).toHaveBeenCalledTimes(1);
  });

  it('should fail when listing last events fails', async () => {
    const stub = jest.spyOn(ForumTable.prototype, 'getThreadEvents');
    stub.mockRejectedValue(new Error());
    await expect(callHandler(handler, { connectionId, tokenData: data })).resolves.toEqual(serverError());
    expect(stub).toHaveBeenCalledTimes(1);
  });

  describe('with valid data', () => {
    const pk = ForumTable.getThreadId(data.participantId, data.itemId);
    const last20Events = Array.from({ length: 20 }, (_, index): ThreadEvent => ({
      pk,
      time: (index + 1) * 10,
      eventType: index % 2 === 0 ? 'thread_opened' : 'thread_closed',
      byUserId: `${data.userId}-${index + 1}`,
    }));
    const last19Events = last20Events.slice(1).reverse();

    beforeEach(async () => {
      await deleteAll();
      await loadFixture(last20Events);
      await callHandler(handler, { connectionId, tokenData: data });
    });

    it('should have added a thread event "follow"', async () => {
      const result = await getAll();
      expect(result.Items?.map(fromDBItem)).toContainEqual({
        pk: expect.any(String),
        time: expect.any(Number),
        eventType: 'follow',
        connectionId,
        userId: data.userId,
        ttl: expect.any(Number),
      });
    });

    it('should send last 20 events to new connection including new "follow" event', () => {
      expect(sendStub).toHaveBeenCalledTimes(1);
      expect(sendStub).toHaveBeenLastCalledWith(connectionId, [
        expect.objectContaining({
          pk: expect.any(String),
          time: expect.any(Number),
          eventType: 'follow', // the event we added by actually following the thread
          userId: data.userId,
          connectionId,
          ttl: expect.any(Number),
        }),
        ...last19Events,
      ]);
    });
  });
});