import { ForumTable, ThreadEventInput } from './table';
import { TokenData } from '../utils/parsers';
import { dynamodb } from '../dynamodb';
import { pipe } from 'fp-ts/function';
import * as D from 'io-ts/Decoder';
import { dateDecoder, decode2 } from '../utils/decode';
import { isNotNull } from '../utils/predicates';
import { Forbidden, OperationSkipped, ServerError } from '../utils/errors';
import { WSClient } from '../websocket-client';

const forumTable = new ForumTable(dynamodb);

export async function openThread(wsClient: WSClient, token: TokenData, payload: unknown): Promise<void> {
  const { participantId, itemId, userId, isMine, canWatchParticipant } = token;
  if (!isMine && !canWatchParticipant) {
    throw new Forbidden(`This operation required isMine or canWatchParticipant, got ${JSON.stringify({ isMine, canWatchParticipant })} `);
  }
  const content = decode2(D.struct({ history: D.array(activityLogDecoder) }))(payload);

  const statusBeforeOpening = await forumTable.getThreadStatus(participantId, itemId);
  if (statusBeforeOpening === 'opened') throw new OperationSkipped(`Thread (${participantId}, ${itemId}) is already opened`);

  const [ threadOpenedEvent ] = await forumTable.addThreadEvents([
    { participantId, itemId, eventType: 'thread_opened', byUserId: userId },
    ...content.history.map(activityLogToThreadData).filter(isNotNull).map(event => ({
      participantId: event.participantId,
      itemId: event.itemId,
      time: event.at.valueOf(),
      ...event.input,
    })),
  ]);

  if (!threadOpenedEvent) throw new ServerError('threadOpenedEvent should be defined');

  const [ last20Events, followers ] = await Promise.all([
    forumTable.getThreadEvents({ itemId, participantId, asc: false, limit: 20 }),
    forumTable.getFollowers({ participantId, itemId }),
  ]);
  const lastEventsExceptFollow = last20Events.filter(event => event.eventType !== 'follow');
  // Send the last events to opener except 'follow' because s-he already received those
  await wsClient.send(wsClient.connectionId, last20Events);

  const isFirstOpening = statusBeforeOpening === 'none';
  const otherConnectionIds = followers.map(follower => follower.connectionId).filter(id => id !== wsClient.connectionId);
  // if thread is opened for the first time, send to other followers the last events except 'follow' because they already received those
  await wsClient.sendAll(otherConnectionIds, isFirstOpening ? lastEventsExceptFollow : [ threadOpenedEvent ]);
}

const activityLogDecoder = pipe(
  D.struct({
    activityType: D.literal('result_started', 'submission', 'result_validated', 'saved_answer', 'current_answer'),
    attemptId: D.string,
    at: dateDecoder,
    item: D.struct({
      id: D.string,
    }),
    participant: D.struct({
      id: D.string,
    }),
  }),
  D.intersect(
    D.partial({
      answerId: D.string,
      score: D.number,
    }),
  ),
);

export type ActivityLog = D.TypeOf<typeof activityLogDecoder>;
interface ThreadData {
  participantId: string,
  itemId: string,
  at: Date,
  input: ThreadEventInput,
}

export const activityLogToThreadData = (log: ActivityLog): ThreadData | null => {
  switch (log.activityType) {
    case 'result_started':
      return {
        itemId: log.item.id,
        participantId: log.participant.id,
        at: log.at,
        input: {
          eventType: 'attempt_started',
          attemptId: log.attemptId,
        },
      };
    case 'result_validated':
    case 'submission':
      if (!log.answerId) return null;
      return {
        itemId: log.item.id,
        participantId: log.participant.id,
        at: log.at,
        input: {
          eventType: 'submission',
          attemptId: log.attemptId,
          answerId: log.answerId,
          score: log.score,
          validated: log.activityType === 'result_validated' || log.score === 100,
        },
      };
    default:
      return null;
  }
};

