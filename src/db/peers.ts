import AWS from 'aws-sdk'

const dynamo = new AWS.DynamoDB.DocumentClient({
  region: 'localhost',
  endpoint: 'http://localhost:7000',
});
const peersTableName = 'peersTable'

export interface Peer {
  is: 'assistant' | 'trainee',
  connectionId: string,
  involvedWith: string | null, // connection id of other peer.If not involved, free or waiting. If involved, busy.
}
export const isPeer = (data: any): data is Peer => data && typeof data === 'object' &&
  typeof data.connectionId === 'string' && // validate peer.connectionId
  typeof data.is === 'string' && ['assistant', 'trainee'].includes(data.is) && // validate peer.is
  (data.involvedWith === null || typeof data.involvedWith === 'string'); // validate peer.involvedWith

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
        is: peer.is,
        connectionId: peer.connectionId,
        involvedWith: peer.involvedWith || null,
        expiresAt: 2*days, // for now
      },
    }).promise();
  }

  private async update(connectionId: string, involvedWith: Peer['involvedWith']) {
    await this.dynamo.update({
      TableName: peersTableName,
      Key: { connectionId },
      AttributeUpdates: {
        involvedWith: { Value: involvedWith },
      },
    }).promise();
  }

  async updateInvolvedWith(peer: Peer, involvedWith: Peer['involvedWith']) {
    await Promise.all([
      this.update(peer.connectionId, involvedWith),
      involvedWith && this.update(involvedWith, peer.connectionId), // if a peer becomes involved with another, mark the other as involved too.
      peer.involvedWith && peer.involvedWith !== involvedWith && this.update(peer.involvedWith, null), // remove old involvement
    ].filter(Boolean));
  }

  private async deleteById(connectionId: string) {
    await this.dynamo.delete({
      TableName: peersTableName,
      Key: { connectionId },
    }).promise();
  }
  async delete(peer: Peer) {
    await Promise.all([
      this.deleteById(peer.connectionId),
      peer.involvedWith && this.update(peer.involvedWith, null), // involved peer becomes uninvolved
    ].filter(Boolean));
  }

  private async getAll({ is, busy }: { is: Peer['is'], busy: boolean }) {
    const result = await this.dynamo.scan({
      TableName: peersTableName,
      ExpressionAttributeNames: {
        '#involvedWith': 'involvedWith',
        '#is': 'is',
      },
      ExpressionAttributeValues: {
        ':is': is,
        ':null': null,
      },
      FilterExpression: [
        '#is = :is',
        `#involvedWith ${busy ? '<>' : '='} :null`,
      ].join(' AND '),
    }).promise();
    console.info({ is, busy }, result.Items);
    return (result.Items || []) as Peer[];
  }

  async getFreeAssistants() {
    return this.getAll({ is: 'assistant', busy: false })
  }
  async getBusyAssistants() {
    return this.getAll({ is: 'assistant', busy: true })
  }
  async getAwaitingTrainees() {
    return this.getAll({ is: 'trainee', busy: false })
  }
  async getBusyTrainees() {
    return this.getAll({ is: 'trainee', busy: true })
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
