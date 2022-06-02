// import AWS from 'aws-sdk';
import { ApiGatewayManagementApi } from '@aws-sdk/client-apigatewaymanagementapi';
import type { ThreadEvent } from './table';

const gatewayApi = new ApiGatewayManagementApi({
  apiVersion: '2018-11-29',
  endpoint: 'http://localhost:3001',
});

export const send = async (connectionId: string, message: ThreadEvent): Promise<void> => {
  // AWS uses PascalCase for naming convention while we don't. Deactivate the rule for AWS functions and re-enable it right after.
  /* eslint-disable @typescript-eslint/naming-convention */
  await gatewayApi.postToConnection({
    ConnectionId: connectionId,
    Data: Buffer.from(JSON.stringify(message)),
  });
  /* eslint-enable @typescript-eslint/naming-convention */
};

export const sendAll = async (connectionIds: string[], message: ThreadEvent): Promise<void> => {
  await Promise.all(connectionIds.map(connectionId => send(connectionId, message)));
};
