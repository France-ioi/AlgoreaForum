import type { APIGatewayProxyHandler } from 'aws-lambda';
import { ForumTable, ThreadEventInput } from './table';
import { extractTokenData, getPayload } from '../utils/parsers';
import { dynamodb } from '../dynamodb';
import { send, sendAll } from './messages';
import { followTtl } from './follow';
import { badRequest, forbidden, ok, serverError, unauthorized } from '../utils/responses';
import { pipe } from 'fp-ts/function';
import * as D from 'io-ts/Decoder';
import { dateDecoder, decode } from '../utils/decode';
import { isNotNull } from '../utils/predicates';

const forumTable = new ForumTable(dynamodb);

export const handler: APIGatewayProxyHandler = async event => {
  const { connectionId } = event.requestContext;
  if (!connectionId) return badRequest();
  const tokenData = extractTokenData(event);
  if (!tokenData) return unauthorized();
  const { participantId, itemId, userId, isMine, canWatchParticipant } = tokenData;
  if (!isMine && !canWatchParticipant) return forbidden();

  const payload = decode(D.struct({ history: D.array(activityLogDecoder) }))(getPayload(event));
  if (!payload) return badRequest('"history" is required');

  try {
    const [ selfFollower ] = await forumTable.getFollowers({ itemId, participantId, filters: { connectionId, userId } });
    const [ followEvent, threadOpenedEvent ] = await forumTable.addThreadEvents([
      { participantId, itemId, eventType: 'follow', ttl: followTtl, connectionId, userId, time: selfFollower?.time },
      { participantId, itemId, eventType: 'thread_opened', byUserId: userId },
      ...payload.history.map(activityLogToThreadData).filter(isNotNull).map(event => ({
        participantId: event.participantId,
        itemId: event.itemId,
        time: event.at.valueOf(),
        ...event.input,
      })),
    ]);
    if (!followEvent || !threadOpenedEvent) throw new Error('threadOpenedEvent and followEvent must be defined');
    const [ last20Events, followers ] = await Promise.all([
      forumTable.getThreadEvents({ itemId, participantId, asc: false, limit: 20 }),
      forumTable.getFollowers({ participantId, itemId }),
    ]);
    const connectionIds = followers.map(follower => follower.connectionId).filter(id => id !== connectionId);
    await send(connectionId, last20Events);
    await sendAll(connectionIds, [ selfFollower ? null : followEvent, threadOpenedEvent ].filter(isNotNull));

    return ok();
  } catch {
    return serverError();
  }
};

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

