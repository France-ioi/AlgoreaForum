import { TokenData } from '../utils/parsers';
import { ActivityLog } from '../threads/openThread';

export const tokenData = (n: number, rest?: Partial<TokenData>): TokenData => ({
  participantId: `openThreadParticipantId-${n}`,
  itemId: `openThreadItemId-${n}`,
  userId: `openThreadUserId-${n}`,
  isMine: true,
  canWatchParticipant: true,
  ...rest,
});

export const historyMocks = {
  resultStarted: (overrides?: Partial<ActivityLog>): ActivityLog => ({
    activityType: 'result_started',
    attemptId: 'resultStartedAttemptId',
    item: { id: 'resultStartedItemId' },
    participant: { id: 'resultStartedParticipantId' },
    answerId: 'resultStartedAnswerId',
    score: 50,
    ...overrides,
  }),
  submission: (overrides?: Partial<ActivityLog>): ActivityLog => ({
    activityType: 'submission',
    attemptId: 'submissionAttemptId',
    item: { id: 'submissionItemId' },
    participant: { id: 'submissionParticipantId' },
    answerId: 'submissionAnswerId',
    score: 50,
    ...overrides,
  }),
  resultValidated: (overrides?: Partial<ActivityLog>): ActivityLog => ({
    activityType: 'result_validated',
    attemptId: 'validatedAttemptId',
    item: { id: 'validatedItemId' },
    participant: { id: 'validatedParticipantId' },
    answerId: 'validatedAnswerId',
    score: 50,
    ...overrides,
  }),
};
