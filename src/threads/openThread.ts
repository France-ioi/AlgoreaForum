import type { APIGatewayProxyHandler } from 'aws-lambda';
import { ForumTable } from './table';
import { extractTokenData, getConnectionId } from '../utils/parsers';
import { dynamodb } from '../dynamodb';
import { sendAll } from './messages';
import { followTtl } from './follow';
import { badRequest, forbidden, ok, serverError, unauthorized } from '../utils/responses';

const forumTable = new ForumTable(dynamodb);

export const handler: APIGatewayProxyHandler = async event => {
  const connectionId = getConnectionId(event);
  if (!connectionId) return badRequest();
  const tokenData = extractTokenData(event);
  if (!tokenData) return unauthorized();
  const { participantId, itemId, userId, isMine, canWatchParticipant } = tokenData;

  if (!isMine && !canWatchParticipant) return forbidden();

  try {
    const [ threadOpenedEvent ] = await Promise.all([
      forumTable.addThreadEvent(participantId, itemId, {
        eventType: 'thread_opened',
        byUserId: userId,
      }),
      forumTable.addThreadEvent(participantId, itemId, {
        eventType: 'follow',
        ttl: followTtl,
        connectionId,
        userId,
      }),
    ]);
    const followers = await forumTable.getFollowers(participantId, itemId);
    const connectionIds = followers.map(follower => follower.connectionId);
    await sendAll(connectionIds, [ threadOpenedEvent ]);

    return ok();
  } catch {
    return serverError();
  }
};
