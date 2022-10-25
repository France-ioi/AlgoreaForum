import type { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamodb } from '../dynamodb';
import { ok, serverError, unauthorized } from '../utils/responses';
import { extractTokenData } from '../utils/parsers';
import { Threads } from '../thread-models/thread-events';

const threads = new Threads(dynamodb);

export const handler: APIGatewayProxyHandler = async event => {
  const tokenData = extractTokenData(event);
  if (!tokenData) return unauthorized();
  const { participantId, itemId } = tokenData;

  try {
    const status = await threads.getThreadStatus(participantId, itemId);
    return ok(JSON.stringify({ status }));
  } catch {
    return serverError();
  }
};