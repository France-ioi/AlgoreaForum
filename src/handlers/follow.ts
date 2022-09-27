import type { APIGatewayProxyHandler } from 'aws-lambda';
import { follow } from '../threads/follow';
import { logError } from '../utils/errors';
import { parseWsMessage } from '../utils/parsers';
import { ok } from '../utils/responses';

export const handler: APIGatewayProxyHandler = async event => {

  try {
    const { wsClient, token } = parseWsMessage(event);
    await follow(wsClient, token);
  } catch (err) {
    logError(err);
  }
  return ok();
};
