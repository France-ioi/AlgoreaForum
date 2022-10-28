import { TokenData } from '../utils/parsers';

export const mockTokenData = (suffix: number | string, rest?: Partial<TokenData>): TokenData => ({
  participantId: `openThreadParticipantId-${suffix}`,
  itemId: `openThreadItemId-${suffix}`,
  userId: `openThreadUserId-${suffix}`,
  isMine: true,
  canWatchParticipant: true,
  ...rest,
});
