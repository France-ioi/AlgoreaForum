import * as parsers from '../parsers';
import { mockCallback, mockContext, mockEvent } from '../testutils/lambda';
import { tokenData } from '../testutils/mocks';
import { handler } from './follow';
import { ForumTable } from './table';

describe('follow', () => {
  const connectionId = 'connectionId';
  const getTokenDataStub = jest.spyOn(parsers, 'extractTokenData');
  const getConnectionIdStub = jest.spyOn(parsers, 'getConnectionId');
  getConnectionIdStub.mockReturnValue(connectionId);
  const addThreadEventStub = jest.spyOn(ForumTable.prototype, 'addThreadEvent');
  addThreadEventStub.mockReturnValue(Promise.resolve({} as any));

  it('should fail (401) when token data is invalid', async () => {
    getTokenDataStub.mockImplementationOnce(() => {
      throw new Error('...');
    });
    await expect(handler(mockEvent(), mockContext(), mockCallback())).resolves.toEqual({
      statusCode: 401,
      body: '',
    });
  });

  it('should succeed (201) when token data is valid', async () => {
    getTokenDataStub.mockReturnValueOnce(tokenData(1));
    await expect(handler(mockEvent(), mockContext(), mockCallback())).resolves.toEqual({
      statusCode: 201,
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
    expect(addThreadEventStub).toHaveBeenLastCalledWith(
      data.participantId,
      data.itemId,
      {
        type: 'subscribe',
        connectionId,
        userId: data.userId,
        ttl: expect.any(Number),
      },
    );
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
});