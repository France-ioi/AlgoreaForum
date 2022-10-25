import { Threads } from '../thread-models/thread-events';
import { TokenData } from '../utils/parsers';
import { dynamodb } from '../dynamodb';
import { pipe } from 'fp-ts/function';
import * as D from 'io-ts/Decoder';
import { dateDecoder, decode2 } from '../utils/decode';
import { isNotNull } from '../utils/predicates';
import { Forbidden, OperationSkipped, ServerError } from '../utils/errors';
import { invalidConnectionIds, logSendResults, WSClient } from '../websocket-client';
import { cleanupConnections } from '../cleanup';
import { ThreadSubscriptions } from '../thread-models/thread-subscriptions';
import { ThreadEventInput } from '../ws-messages/inbound-messages';

const subscriptions = new ThreadSubscriptions(dynamodb);
const threads = new Threads(dynamodb);

export async function openThread(wsClient: WSClient, token: TokenData, payload: unknown): Promise<void> {
  const { participantId, itemId, userId, isMine, canWatchParticipant } = token;
  if (!isMine && !canWatchParticipant) {
    throw new Forbidden(`This operation required isMine or canWatchParticipant, got ${JSON.stringify({ isMine, canWatchParticipant })} `);
  }
  const content = decode2(D.struct({ history: D.array(activityLogDecoder) }))(payload);

  const statusBeforeOpening = await threads.getThreadStatus(participantId, itemId);
  if (statusBeforeOpening === 'opened') throw new OperationSkipped(`Thread (${participantId}, ${itemId}) is already opened`);

  const [ threadOpenedEvent ] = await threads.addThreadEvents([
    { participantId, itemId, eventType: 'thread_opened', byUserId: userId },
    ...content.history.map(activityLogToThreadData).filter(isNotNull).map(event => ({
      participantId: event.participantId,
      itemId: event.itemId,
      time: event.at.valueOf(),
      ...event.input,
    })),
  ]);

  if (!threadOpenedEvent) throw new ServerError('threadOpenedEvent should be defined');

  const [ last20Events, subscribers ] = await Promise.all([
    threads.getThreadEvents({ itemId, participantId, asc: false, limit: 20 }),
    subscriptions.getSubscribers({ participantId, itemId }),
  ]);
  await wsClient.send(wsClient.connectionId, last20Events).then(r => logSendResults([ r ]));

  const isFirstOpening = statusBeforeOpening === 'none';
  const otherConnectionIds = subscribers.map(subscriber => subscriber.connectionId).filter(id => id !== wsClient.connectionId);
  // if thread is opened for the first time, send to other subscribers the last events except 'subscribe' because they already received them
  const sendResults = await wsClient.sendAll(otherConnectionIds, isFirstOpening ? last20Events : [ threadOpenedEvent ]);
  logSendResults(sendResults);
  await cleanupConnections(participantId, itemId, invalidConnectionIds(sendResults));
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

