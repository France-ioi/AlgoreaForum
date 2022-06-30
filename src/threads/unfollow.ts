import type { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamodb } from '../dynamodb';
import { extractTokenData, getConnectionId } from '../utils/parsers';
import { badRequest, ok, serverError, unauthorized } from '../utils/responses';
import { ForumTable } from './table';

const forumTable = new ForumTable(dynamodb);

export const handler: APIGatewayProxyHandler = async event => {
  const connectionId = getConnectionId(event);
  if (!connectionId) return badRequest('connectionId is required');
  const tokenData = extractTokenData(event);
  if (!tokenData) return unauthorized();
  const { participantId, itemId, userId } = tokenData;

  try {
    const [ followEvent ] = await forumTable.getFollowers({
      participantId,
      itemId,
      limit: 1,
      filters: { userId, connectionId },
    });

    if (followEvent) await forumTable.removeThreadEvent(followEvent);

    return ok();
  } catch {
    return serverError();
  }
};