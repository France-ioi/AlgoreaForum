import { TokenData } from '../parsers';

export const tokenData = (n: number, rest?: Partial<TokenData>): TokenData => ({
  participantId: `openThreadParticipantId-${n}`,
  itemId: `openThreadItemId-${n}`,
  userId: `openThreadUserId-${n}`,
  isMine: true,
  canWatchParticipant: true,
  ...rest,
});
