import type { APIGatewayProxyHandler } from 'aws-lambda';
import { subscribe } from '../threads/subscribe';
import { logError } from '../utils/errors';
import { parseWsMessage } from '../utils/parsers';
import { ok } from '../utils/responses';

export const handler: APIGatewayProxyHandler = async event => {

  try {
    const { wsClient, token } = parseWsMessage(event);
    await subscribe(wsClient, token);
  } catch (err) {
    logError(err);
  }
  return ok();
};
