import * as parsers from '../parsers';
import * as messages from './messages';
import { mockCallback, mockContext, mockEvent } from '../testutils/lambda';
import { tokenData } from '../testutils/mocks';
import { handler } from './follow';
import { ForumTable, ThreadEvent } from './table';

describe('follow', () => {
  const connectionId = 'connectionId';
  const getTokenDataStub = jest.spyOn(parsers, 'extractTokenData');
  const getConnectionIdStub = jest.spyOn(parsers, 'getConnectionId');
  const addThreadEventStub = jest.spyOn(ForumTable.prototype, 'addThreadEvent');
  const getThreadEventsStub = jest.spyOn(ForumTable.prototype, 'getThreadEvents');

  beforeEach(() => {
    getConnectionIdStub.mockReturnValue(connectionId);
    addThreadEventStub.mockReturnValue(Promise.resolve({} as any));
    getThreadEventsStub.mockReturnValue(Promise.resolve([]));
  });

  it('should fail (401) when token data is invalid', async () => {
    getTokenDataStub.mockImplementationOnce(() => {
      throw new Error('...');
    });
    await expect(handler(mockEvent(), mockContext(), mockCallback())).resolves.toEqual({
      statusCode: 401,
      body: '',
    });
  });

  it('should fail gracefully when adding follow event fails', async () => {
    const data = tokenData(2);
    getTokenDataStub.mockReturnValueOnce(data);
    addThreadEventStub.mockReturnValueOnce(Promise.reject(new Error('...')));
    await expect(handler(mockEvent(), mockContext(), mockCallback())).resolves.toEqual({
      statusCode: 401,
      body: '',
    });
    expect(addThreadEventStub).toHaveBeenCalledTimes(1);
  });

  it('should fail gracefully when listing last events fails', async () => {
    const data = tokenData(2);
    getTokenDataStub.mockReturnValueOnce(data);
    getThreadEventsStub.mockReturnValueOnce(Promise.reject(new Error('...')));
    await expect(handler(mockEvent(), mockContext(), mockCallback())).resolves.toEqual({
      statusCode: 401,
      body: '',
    });
    expect(getThreadEventsStub).toHaveBeenCalledTimes(1);
  });

  it('should fail gracefully when parsing the connection id fails', async () => {
    const data = tokenData(2);
    getTokenDataStub.mockReturnValueOnce(data);
    getConnectionIdStub.mockImplementationOnce(() => {
      throw new Error('...');
    });
    await expect(handler(mockEvent(), mockContext(), mockCallback())).resolves.toEqual({
      statusCode: 401,
      body: '',
    });
    expect(addThreadEventStub).not.toHaveBeenCalled();
  });

  describe('with valid data', () => {
    let result: any;
    const data = tokenData(1);
    const last20Events: ThreadEvent[] = [];
    const sendStub = jest.spyOn(messages, 'send');

    beforeEach(async () => {
      sendStub.mockImplementation(() => Promise.resolve());
      getThreadEventsStub.mockReturnValue(Promise.resolve(last20Events));
      getTokenDataStub.mockReturnValue(data);
      addThreadEventStub.mockReturnValue(Promise.resolve({} as any));
      getConnectionIdStub.mockReturnValue(connectionId);
      result = await handler(mockEvent(), mockContext(), mockCallback());
    });

    it('should succeed (201) when token data is valid', () => {
      expect(result).toEqual({ statusCode: 201, body: '' });
    });

    it('should have added a thread event "follow"', () => {
      expect(addThreadEventStub).toHaveBeenCalledTimes(1);
      expect(addThreadEventStub).toHaveBeenLastCalledWith(data.participantId, data.itemId, {
        type: 'subscribe',
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