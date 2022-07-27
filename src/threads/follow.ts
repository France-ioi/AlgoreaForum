import type { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamodb } from '../dynamodb';
import { extractTokenData } from '../utils/parsers';
import { badRequest, ok, serverError, unauthorized } from '../utils/responses';
import { send, sendAll } from './messages';
import { ForumTable } from './table';

const forumTable = new ForumTable(dynamodb);
const seconds = 1;
const minutes = 60 * seconds;
const hours = 60 * minutes;
/**
 * ttl is the TimeToLive value of the db entry expressed in seconds.
 */
export const followTtl = 12 * hours;

export const handler: APIGatewayProxyHandler = async event => {
  const { connectionId } = event.requestContext;
  if (!connectionId) return badRequest();
  const tokenData = extractTokenData(event);
  if (!tokenData) return unauthorized();
  const { participantId, itemId, userId } = tokenData;

  try {
    const [ followers, events ] = await Promise.all([
      forumTable.getFollowers({ itemId, participantId }),
      forumTable.getThreadEvents({ participantId, itemId, limit: 19, asc: false }),
    ]);
    const followEvent = await forumTable.addThreadEvent(participantId, itemId, {
      eventType: 'follow',
      connectionId,
      ttl: followTtl,
      userId,
    });

    await Promise.all([
      send(connectionId, [ followEvent, ...events ]),
      sendAll(
        followers.map(({ connectionId }) => connectionId),
        [ followEvent ],
      ),
    ]);

    return ok();
  } catch {
    return serverError();
  }
};