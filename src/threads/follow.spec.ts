import * as parsers from '../utils/parsers';
import * as messages from './messages';
import { mockCallback, mockContext, mockEvent } from '../testutils/lambda';
import { tokenData } from '../testutils/mocks';
import { handler } from './follow';
import { ForumTable, ThreadEvent } from './table';
import { badRequest, serverError, unauthorized } from '../utils/responses';

describe('follow', () => {
  const connectionId = 'connectionId';
  const getTokenDataStub = jest.spyOn(parsers, 'extractTokenData');
  const getConnectionIdStub = jest.spyOn(parsers, 'getConnectionId');
  const addThreadEventStub = jest.spyOn(ForumTable.prototype, 'addThreadEvent');
  const getThreadEventsStub = jest.spyOn(ForumTable.prototype, 'getThreadEvents');

  beforeEach(() => {
    jest.resetAllMocks();
    getConnectionIdStub.mockReturnValue(connectionId);
    addThreadEventStub.mockReturnValue(Promise.resolve({} as any));
    getThreadEventsStub.mockReturnValue(Promise.resolve([]));
  });

  it('should fail when token data is invalid', async () => {
    getTokenDataStub.mockReturnValueOnce(null);
    await expect(handler(mockEvent(), mockContext(), mockCallback())).resolves.toEqual(unauthorized());
  });

  it('should fail when adding follow event fails', async () => {
    const data = tokenData(2);
    getTokenDataStub.mockReturnValueOnce(data);
    addThreadEventStub.mockReturnValueOnce(Promise.reject(new Error('...')));
    await expect(handler(mockEvent(), mockContext(), mockCallback())).resolves.toEqual(serverError());
    expect(addThreadEventStub).toHaveBeenCalledTimes(1);
  });

  it('should fail when listing last events fails', async () => {
    const data = tokenData(2);
    getTokenDataStub.mockReturnValueOnce(data);
    getThreadEventsStub.mockReturnValueOnce(Promise.reject(new Error('...')));
    await expect(handler(mockEvent(), mockContext(), mockCallback())).resolves.toEqual(serverError());
    expect(getThreadEventsStub).toHaveBeenCalledTimes(1);
  });

  it('should fail when parsing the connection id fails', async () => {
    const data = tokenData(2);
    getTokenDataStub.mockReturnValueOnce(data);
    getConnectionIdStub.mockImplementationOnce(() => null);
    await expect(handler(mockEvent(), mockContext(), mockCallback())).resolves.toEqual(badRequest());
    expect(addThreadEventStub).not.toHaveBeenCalled();
  });

  describe('with valid data', () => {
    const data = tokenData(1);
    const last20Events: ThreadEvent[] = [];
    const sendStub = jest.spyOn(messages, 'send');

    beforeEach(async () => {
      sendStub.mockImplementation(() => Promise.resolve());
      getThreadEventsStub.mockReturnValue(Promise.resolve(last20Events));
      getTokenDataStub.mockReturnValue(data);
      addThreadEventStub.mockReturnValue(Promise.resolve({} as any));
      getConnectionIdStub.mockReturnValue(connectionId);
      await handler(mockEvent(), mockContext(), mockCallback());
    });

    it('should have added a thread event "follow"', () => {
      expect(addThreadEventStub).toHaveBeenCalledTimes(1);
      expect(addThreadEventStub).toHaveBeenLastCalledWith(data.participantId, data.itemId, {
        eventType: 'follow',
        connectionId,
        userId: data.userId,
        ttl: expect.any(Number),
      });
    });

    it('should send last 20 events to new connection', () => {
      expect(getThreadEventsStub).toHaveBeenCalledTimes(1);
      expect(getThreadEventsStub).toHaveBeenLastCalledWith(data.participantId, data.itemId, {
        limit: 20,
        asc: false,
      });
      expect(sendStub).toHaveBeenCalledTimes(1);
      expect(sendStub).toHaveBeenLastCalledWith(connectionId, last20Events);
    });
  });
});