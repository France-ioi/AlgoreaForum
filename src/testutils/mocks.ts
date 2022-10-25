import { TokenData } from '../utils/parsers';
import { ActivityLog } from '../services/openThread';

export const mockTokenData = (suffix: number | string, rest?: Partial<TokenData>): TokenData => ({
  participantId: `openThreadParticipantId-${suffix}`,
  itemId: `openThreadItemId-${suffix}`,
  userId: `openThreadUserId-${suffix}`,
  isMine: true,
  canWatchParticipant: true,
  ...rest,
});

const addDays = (count: number) => (from: Date): Date => {
  const date = new Date(from);
  date.setDate(date.getDate() + count);
  return date;
};
const today = (timeInMs = 0): Date => {
  const timeless = new Date(new Date().toISOString().slice(0, 10));
  return new Date(timeless.valueOf() + timeInMs);
};
const yesterday = (timeInMs = 0): Date => addDays(-1)(today(timeInMs));

export const historyMocks = {
  resultStarted: (overrides?: Partial<ActivityLog>): ActivityLog => ({
    activityType: 'result_started',
    attemptId: 'resultStartedAttemptId',
    at: yesterday(10),
    item: { id: 'resultStartedItemId' },
    participant: { id: 'resultStartedParticipantId' },
    answerId: 'resultStartedAnswerId',
    score: 50,
    ...overrides,
  }),
  submission: (overrides?: Partial<ActivityLog>): ActivityLog => ({
    activityType: 'submission',
    attemptId: 'submissionAttemptId',
    at: yesterday(20),
    item: { id: 'submissionItemId' },
    participant: { id: 'submissionParticipantId' },
    answerId: 'submissionAnswerId',
    score: 50,
    ...overrides,
  }),
  resultValidated: (overrides?: Partial<ActivityLog>): ActivityLog => ({
    activityType: 'result_validated',
    attemptId: 'validatedAttemptId',
    at: yesterday(30),
    item: { id: 'validatedItemId' },
    participant: { id: 'validatedParticipantId' },
    answerId: 'validatedAnswerId',
    score: 50,
    ...overrides,
  }),
};
