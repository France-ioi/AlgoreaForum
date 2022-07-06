import type { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamodb } from '../dynamodb';
import { badRequest, ok, serverError, unauthorized } from '../utils/responses';
import { send } from './messages';
import { extractTokenData } from '../utils/parsers';
import { ForumTable } from './table';

const forumTable = new ForumTable(dynamodb);

export const handler: APIGatewayProxyHandler = async event => {
  if (!event.requestContext.connectionId) return badRequest();

  const tokenData = extractTokenData(event);
  if (!tokenData) return unauthorized();
  const { participantId, itemId } = tokenData;

  try {
    const status = await forumTable.getThreadStatus(participantId, itemId);

    await send(event.requestContext.connectionId, [{ status }]);

    return ok();
  } catch {
    return serverError();
  }
};
