import { ApiGatewayManagementApi } from '@aws-sdk/client-apigatewaymanagementapi';
import type { Peer } from './db/peers';

export type Message =
  | { type: 'waiting-trainees', peers: Peer[] }
  | { type: 'trainee-status-change', trainee: Peer } // used to update trainee or assistant status in UI.
  | { type: 'assistant-disconnected', assistant: Peer }
  | { type: 'trainee-disconnected', trainee: Peer }
  | { type: 'help-offer', assistant: Peer }
  | { type: 'accept-offer', trainee: Peer }
  | { type: 'help-ended' }; // sent to trainees when assistants end the process. Might be reused for other purposes later on.

const gatewayApi = new ApiGatewayManagementApi({
  apiVersion: '2018-11-29',
  endpoint: 'http://localhost:3001',
});

export const send = async (connectionId: string, message: Message): Promise<void> => {
  // AWS uses PascalCase for naming convention while we don't. Deactivate the rule for AWS functions and re-enable it right after.
  /* eslint-disable @typescript-eslint/naming-convention */
  await gatewayApi.postToConnection({
    ConnectionId: connectionId,
    Data: Buffer.from(JSON.stringify(message)),
  });
  /* eslint-enable @typescript-eslint/naming-convention */
};

export const sendAll = async (connectionIds: string[], message: Message): Promise<void> => {
  await Promise.all(connectionIds.map(connectionId => send(connectionId, message)));
};
