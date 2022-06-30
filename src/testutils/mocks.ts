import { TokenData } from '../utils/parsers';
import { ActivityLog } from '../threads/openThread';
import { FollowEvent, ForumTable, ThreadEvent } from '../threads/table';

export const tokenData = (n: number, rest?: Partial<TokenData>): TokenData => ({
  participantId: `openThreadParticipantId-${n}`,
  itemId: `openThreadItemId-${n}`,
  userId: `openThreadUserId-${n}`,
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

export const followEventMock = (participantId: string, itemId: string, overrides: Partial<FollowEvent>): ThreadEvent => ({
  eventType: 'follow',
  connectionId: 'connectionId',
  // @ts-ignore
  pk: ForumTable.getThreadId(participantId, itemId),
  time: 42,
  ttl: 3600,
  userId: 'userId',
  ...overrides,
});
