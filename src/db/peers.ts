import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { dynamodb, fromDBItem, toDBItem } from '../dynamodb';

const peersTableName = 'peersTable';

export interface Peer {
  connectionId: string,
  status: 'ASSISTANT_FREE' | 'ASSISTANT_BUSY' | 'TRAINEE_WAITING' | 'TRAINEE_BUSY',
}

export const isPeer = (data: any): data is Peer => {
  if (typeof data !== 'object' || data === null) return false;
  const { connectionId, status } = data as Record<string, unknown>;
  if (typeof connectionId !== 'string') return false;
  if (typeof status !== 'string') return false;
  if (![ 'ASSISTANT_FREE', 'ASSISTANT_BUSY', 'TRAINEE_WAITING', 'TRAINEE_BUSY' ].includes(status)) return false;
  return true;
};

// AWS uses PascalCase for everything, so we need to disable temporarily the casing lint rules
/* eslint-disable @typescript-eslint/naming-convention */
class PeersTable {
  constructor(private dynamo: DynamoDB) {}

  async add(peer: Peer): Promise<void> {
    const seconds = 1000;
    const minutes = 60*seconds;
    const hours = 60*minutes;
    const days = 24*hours;

    await this.dynamo.putItem({
      TableName: peersTableName,
      Item: toDBItem({
        connectionId: peer.connectionId,
        status: peer.status,
        expiresAt: 2*days, // for now
      }),
    });
  }

  async update(connectionId: string, status: Peer['status']): Promise<void> {
    await this.dynamo.updateItem({
      TableName: peersTableName,
      Key: toDBItem({ connectionId }),
      AttributeUpdates: {
        status: { Value: { S: status } }
      },
    });
  }

  async delete(connectionId: string): Promise<void> {
    await this.dynamo.deleteItem({
      TableName: peersTableName,
      Key: toDBItem({ connectionId }),
    });
  }

  async getByStatus(status: Peer['status']): Promise<Peer[]> {
    const result = await this.dynamo.scan({
      TableName: peersTableName,
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': { S: status } },
      FilterExpression: '#status = :status',
    });
    return (result.Items ?? []).map(fromDBItem) as unknown[] as Peer[];
  }
  async get(connectionId: string): Promise<Peer> {
    const result = await this.dynamo.getItem({
      TableName: peersTableName,
      Key: toDBItem({ connectionId }),
    });
    if (!result.Item) throw new Error(`peer "${connectionId}" not found`);
    return fromDBItem(result.Item) as unknown as Peer;
  }
}
/* eslint-enable @typescript-eslint/naming-convention */

export const peersTable = new PeersTable(dynamodb);
