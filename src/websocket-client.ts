import { ApiGatewayManagementApi } from '@aws-sdk/client-apigatewaymanagementapi';
import { APIGatewayEventDefaultAuthorizerContext, APIGatewayEventRequestContextWithAuthorizer } from 'aws-lambda';
import { SubscribeEvent, ThreadEvent, ThreadStatus } from './threads/table';
import { DecodingError, errorToString } from './utils/errors';

type UnsubscribeEvent = Omit<SubscribeEvent, 'eventType'> & { eventType: 'unsubscribe' };
interface ThreadStatusMessage {
  status: ThreadStatus,
}

export interface SendResult {
  success: boolean,
  from: string,
  to: string,
  error?: unknown,
}

type Message = ThreadEvent | UnsubscribeEvent | ThreadStatusMessage;

export function invalidConnectionIds(results: SendResult[]): string[] {
  return results
    .filter(r => !r.success && r.error && r.error instanceof Error && r.error.name === 'GoneException')
    .map(r => r.to);
}

export function logSendResults(results: SendResult[]): void {
  if (results.some(r => !r.success)) {
    // eslint-disable-next-line no-console
    console.warn(
      `Message successfully sent to: ${results.filter(r => r.success).map(r => r.to).join(', ')}\n`,
      ` and got error to: ${results.filter(r => !r.success).map(r => `${r.to} [${errorToString(r.error)}]`).join(', ')}`
    );
  // eslint-disable-next-line no-console
  } else console.log(`Messages successfully sent to ${results.length} recipients.`);
}

export class WSClient {
  connectionId: string;
  api: ApiGatewayManagementApi;

  constructor(requestContext: APIGatewayEventRequestContextWithAuthorizer<APIGatewayEventDefaultAuthorizerContext>) {
    if (!requestContext.connectionId) throw new DecodingError('missing connection id in request context (got: ${requestContext})');
    this.connectionId = requestContext.connectionId;
    // eslint-disable-next-line no-console
    console.info(`WsClient initialized with connectionId ${this.connectionId}`);

    if (process.env.STAGE === 'local') {
      this.api = new ApiGatewayManagementApi({ apiVersion: '2018-11-29', endpoint: 'http://localhost:3001' });
    } else {
      if (!requestContext.domainName || !requestContext.stage) {
        throw new DecodingError(`expecting domainName and stage in the request context. (got: ${JSON.stringify(requestContext)})`);
      }
      const endpoint = `https://${requestContext.domainName}/${requestContext.stage}`;
      this.api = new ApiGatewayManagementApi({ apiVersion: '2018-11-29', endpoint: endpoint });
    }
  }

  private async sendMessages(connectionId: string, messages: Message[]): Promise<SendResult> {
    return await this.api.postToConnection({
      // AWS uses PascalCase for naming convention while we don't. Deactivate the rule for AWS functions and re-enable it right after.
      /* eslint-disable @typescript-eslint/naming-convention */
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(messages)),
      /* eslint-enable @typescript-eslint/naming-convention */
    })
      .then(() => ({ success: true, from: this.connectionId, to: connectionId }))
      .catch(err => ({ success: false, from: this.connectionId, to: connectionId, error: err as unknown }));
  }

  /**
   * Sends messages to the given `connectionId`. The promise never fails but the retruned result may be a success or a failure.
   */
  async send(connectionId: string, messages: Message[]): Promise<SendResult> {
    return this.sendMessages(connectionId, messages);
  }

  /**
   * Sends messages to the given `connectionId`'s. The promise never fails but the returned results may be successes or failures.
   */
  async sendAll(connectionIds: string[], messages: Message[]): Promise<SendResult[]> {
    const uniqueIds = [ ...new Set(connectionIds) ];
    return await Promise.all(uniqueIds.map(connectionId => this.sendMessages(connectionId, messages)));
  }

}
