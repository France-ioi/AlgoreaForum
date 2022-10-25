import * as D from 'io-ts/Decoder';
import { pipe } from 'fp-ts/function';

const threadOpenedEventDecoder = D.struct({
  eventType: D.literal('thread_opened'),
  byUserId: D.string,
});

const threadClosedEventDecoder = D.struct({
  eventType: D.literal('thread_closed'),
  byUserId: D.string,
});

const attemptStartedEventDecoder = D.struct({
  eventType: D.literal('attempt_started'),
  attemptId: D.string,
});

const submissionEventDecoder = pipe(
  D.struct({
    eventType: D.literal('submission'),
    attemptId: D.string,
    answerId: D.string,
  }),
  D.intersect(D.partial({
    score: D.number,
    validated: D.boolean,
  }))
);

const messageEventDecoder = D.struct({
  eventType: D.literal('message'),
  userId: D.string,
  content: D.string,
});

export const threadEventInput = D.union(
  threadOpenedEventDecoder,
  threadClosedEventDecoder,
  attemptStartedEventDecoder,
  submissionEventDecoder,
  messageEventDecoder,
);
export type ThreadEventInput = D.TypeOf<typeof threadEventInput>;
