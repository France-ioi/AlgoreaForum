import { ApiGatewayManagementApi } from '@aws-sdk/client-apigatewaymanagementapi';
import { APIGatewayEventDefaultAuthorizerContext, APIGatewayEventRequestContextWithAuthorizer } from 'aws-lambda';
import { FollowEvent, ThreadEvent, ThreadStatus } from './threads/table';
import { DecodingError, ServerError } from './utils/errors';

type UnfollowEvent = Omit<FollowEvent, 'eventType'> & { eventType: 'unfollow' };
interface ThreadStatusMessage {
  status: ThreadStatus,
}

type Message = ThreadEvent | UnfollowEvent | ThreadStatusMessage;

export class WSClient {
  connectionId: string;
  api: ApiGatewayManagementApi;

  constructor(requestContext: APIGatewayEventRequestContextWithAuthorizer<APIGatewayEventDefaultAuthorizerContext>) {
    if (!requestContext.connectionId) throw new DecodingError('missing connection id in request context (got: ${requestContext})');
    this.connectionId = requestContext.connectionId;

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

  async send(connectionId: string, messages: Message[]): Promise<void> {
    await this.api.postToConnection({
      // AWS uses PascalCase for naming convention while we don't. Deactivate the rule for AWS functions and re-enable it right after.
      /* eslint-disable @typescript-eslint/naming-convention */
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(messages)),
      /* eslint-enable @typescript-eslint/naming-convention */
    }).catch(err => {
      throw new ServerError(`API gateway postToConnection: ${JSON.stringify(err)}`);
    });
  }

  async sendAll(connectionIds: string[], messages: Message[]): Promise<void> {
    const uniqueIds = [ ...new Set(connectionIds) ];
    await Promise.all(uniqueIds.map(connectionId => this.send(connectionId, messages)));
  }

}
