import type { APIGatewayProxyHandler } from 'aws-lambda';
import { openThread } from '../threads/openThread';
import { logError } from '../utils/errors';
import { parseWsMessage } from '../utils/parsers';
import { ok } from '../utils/responses';

export const handler: APIGatewayProxyHandler = async event => {

  try {
    const { wsClient, token, payload } = parseWsMessage(event);
    await openThread(wsClient, token, payload);
  } catch (err) {
    logError(err);
  }
  return ok();
};