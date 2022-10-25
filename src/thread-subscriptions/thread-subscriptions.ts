import { AttributeValue } from '@aws-sdk/client-dynamodb';
import * as D from 'io-ts/Decoder';
import { fromDBItem, toDBParameters } from '../dynamodb';
import { ForumTable, TableKey, tableKeyDecoder } from '../forum-table';
import { Thread } from '../threads/thread';
import { decodeOrNull } from '../utils/decode';
import { isNotNull } from '../utils/predicates';

export type ConnectionId = string;

function ttl(): number {
  /**
   * ttl is the TimeToLive value of the db entry expressed in *seconds*.
   * It is contrained by the connection duration for WebSocket API on API Gateway, which is 2h.
   * https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html
   */
  const subscribeTtl = 7_200; // 2 hours
  return Date.now()/1000 + subscribeTtl;
}

const subscriptionDecoder = D.struct({
  connectionId: D.string,
});
type Subscription = D.TypeOf<typeof subscriptionDecoder>;

export class ThreadSubscriptions extends ForumTable {

  async getSubscribers(thread: Thread): Promise<Subscription[]> {
    const results = await this.execSelect(
      `SELECT connectionId FROM ${ this.tableName } WHERE pk = ?;`,
      toDBParameters([ this.pk(thread) ])
    );
    return results.map(decodeOrNull(subscriptionDecoder)).filter(isNotNull);
  }

  async getSubscribersWithConnection(thread: Thread, connectionId: string): Promise<TableKey[]> {
    const results = await this.execSelect(
      `SELECT pk, time FROM ${ this.tableName } WHERE pk = ? and connectionId = ?;`,
      toDBParameters([ this.pk(thread), connectionId ])
    );
    return results.map(decodeOrNull(tableKeyDecoder)).filter(isNotNull);
  }

  async subscribe(thread: Thread, connectionId: ConnectionId, userId: string): Promise<void> {
    /* eslint-disable @typescript-eslint/naming-convention */
    await this.db.executeTransaction({
      TransactStatements: [{
        Statement: `INSERT INTO "${ this.tableName }" VALUE { 'pk': ?, 'time': ?, 'ttl': ?, 'userId': ?, 'connectionId': ? }`,
        Parameters: toDBParameters([ this.pk(thread), Date.now(), ttl(), userId, connectionId ]),
      }]
    });
    /* eslint-enable @typescript-eslint/naming-convention */
    return;
  }

  async unsubscribe(keys: TableKey[]): Promise<void> {
    /* eslint-disable @typescript-eslint/naming-convention */
    await this.db.executeTransaction({
      TransactStatements: keys.map(k => ({
        Statement: `DELETE FROM ${ this.tableName } WHERE pk = ? AND time = ?`,
        Parameters: toDBParameters([ k.pk, k.time ]),
      }))
    });
    /* eslint-enable @typescript-eslint/naming-convention */
    return;
  }

  private pk(thread: Thread): string {
    return `THREADSUB#${thread.participantId}#${thread.itemId}`;
  }

  private async execSelect(statement: string, parameters: AttributeValue[]): Promise<Record<string, unknown>[]> {
    /* eslint-disable @typescript-eslint/naming-convention */
    const output = await this.db.executeStatement({ Statement: statement, Parameters: parameters });
    /* eslint-enable @typescript-eslint/naming-convention */
    return (output.Items || []).map(i => fromDBItem(i));

  }

}