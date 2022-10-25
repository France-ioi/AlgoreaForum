import type { APIGatewayProxyHandler } from 'aws-lambda';
import { publishEvents } from '../services/publishEvents';
import { logError } from '../utils/errors';
import { parseWsMessage } from '../utils/parsers';
import { ok } from '../utils/responses';

/**
 * Add the given thread events to the current thread events (db) and send them to all subscribers.
 */
export const handler: APIGatewayProxyHandler = async event => {

  try {
    const { wsClient, token, payload } = parseWsMessage(event);
    await publishEvents(wsClient, token, payload);
  } catch (err) {
    logError(err);
  }
  return ok();
};