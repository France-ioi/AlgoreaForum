import type { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamodb } from '../dynamodb';
import { extractTokenData } from '../utils/parsers';
import { badRequest, ok, serverError, unauthorized } from '../utils/responses';
import { send } from './messages';
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
  if (!event.requestContext.connectionId) return badRequest();
  const tokenData = extractTokenData(event);
  if (!tokenData) return unauthorized();
  const { participantId, itemId, userId } = tokenData;

  try {
    await forumTable.addThreadEvent(participantId, itemId, {
      eventType: 'follow',
      connectionId: event.requestContext.connectionId,
      ttl: followTtl,
      userId,
    });

    const events = await forumTable.getThreadEvents({ participantId, itemId, limit: 20, asc: false });
    await send(event.requestContext.connectionId, events);

    return ok();
  } catch {
    return serverError();
  }
};