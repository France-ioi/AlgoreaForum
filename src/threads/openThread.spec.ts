import * as parsers from '../parsers';
import { handler } from './openThread';
import { ForumTable } from './table';

const mockEvent = (): any => ({});
const mockContext = (): any => ({});

describe('threads', () => {
  const getTokenDataStub = jest.spyOn(parsers, 'extractTokenData');
  const addThreadEventStub = jest.spyOn(ForumTable.prototype, 'addThreadEvent');
  addThreadEventStub.mockReturnValue(Promise.resolve({} as any));

  const tokenData = (n: number, rest?: Partial<parsers.TokenData>): parsers.TokenData => ({
    participantId: `openThreadParticipantId-${n}`,
    itemId: `openThreadItemId-${n}`,
    userId: `openThreadUserId-${n}`,
    isMine: true,
    canWatchParticipant: true,
    ...rest,
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('open thread', () => {
    it('should fail (401) when token data is invalid', async () => {
      getTokenDataStub.mockImplementationOnce(() => {
        throw new Error('...');
      });
      await expect(handler(mockEvent(), mockContext())).rejects.toThrow(Error);
    });

    it('should succeed (201) when token data is valid', async () => {
      getTokenDataStub.mockReturnValueOnce(tokenData(1));
      await expect(handler(mockEvent(), mockContext())).resolves.not.toThrow();
    });

    it('should fail gracefully when adding thread opened event fails', async () => {
      const data = tokenData(2);
      getTokenDataStub.mockReturnValueOnce(data);
      addThreadEventStub.mockReturnValueOnce(Promise.reject(new Error('...')));
      await expect(handler(mockEvent(), mockContext())).rejects.toThrow(Error);
      expect(addThreadEventStub).toHaveBeenCalledTimes(1);
      expect(addThreadEventStub).toHaveBeenLastCalledWith(
        data.participantId,
        data.itemId,
        { type: 'thread_opened', byUserId: data.userId },
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
      expect(addThreadEventStub).toHaveBeenCalledTimes(1);
      expect(addThreadEventStub).toHaveBeenLastCalledWith(
        data.participantId,
        data.itemId,
        { type: 'thread_opened', byUserId: data.userId },
      );
    });
  });
});
