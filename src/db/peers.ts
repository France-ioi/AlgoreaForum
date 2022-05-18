import AWS from 'aws-sdk'

const dynamo = new AWS.DynamoDB.DocumentClient({
  region: 'localhost',
  endpoint: 'http://localhost:7000',
});
const peersTableName = 'peersTable'

export interface Peer {
  connectionId: string,
  status: 'ASSISTANT_FREE' | 'ASSISTANT_BUSY' | 'TRAINEE_WAITING' | 'TRAINEE_BUSY',
}
export const isPeer = (data: any): data is Peer => data && typeof data === 'object' && typeof data.connectionId === 'string' &&
  typeof data.status === 'string' && ['ASSISTANT_FREE', 'ASSISTANT_BUSY', 'TRAINEE_WAITING', 'TRAINEE_BUSY'].includes(data.status);

class PeersTable {
  constructor(private dynamo: AWS.DynamoDB.DocumentClient) {}

  async add(peer: Peer) {
    const seconds = 1000;
    const minutes = 60*seconds;
    const hours = 60*minutes;
    const days = 24*hours;

    await this.dynamo.put({
      TableName: peersTableName,
      Item: {
        connectionId: peer.connectionId,
        status: peer.status,
        expiresAt: 2*days, // for now
      },
    }).promise();
  }

  async update(connectionId: string, status: Peer['status']) {
    await this.dynamo.update({
      TableName: peersTableName,
      Key: { connectionId },
      AttributeUpdates: {
        status: { Value: status }
      },
    }).promise();
  }

  async delete(connectionId: string) {
    await this.dynamo.delete({
      TableName: peersTableName,
      Key: { connectionId },
    }).promise();
  }

  async getByStatus(status: Peer['status']): Promise<Peer[]> {
    const result = await this.dynamo.scan({
      TableName: peersTableName,
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status },
      FilterExpression: '#status = :status',
    }).promise();
    return (result.Items ?? []) as Peer[];
  }
  async get(connectionId: string): Promise<Peer> {
    const result = await this.dynamo.get({
      TableName: peersTableName,
      Key: { connectionId },
    }).promise();
    if (!result.Item) throw new Error(`peer "${connectionId}" not found`)
    return (result.Item) as Peer;
  }
}

export const peersTable = new PeersTable(dynamo);
