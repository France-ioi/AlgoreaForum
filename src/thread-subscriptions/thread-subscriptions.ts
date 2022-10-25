import * as D from 'io-ts/Decoder';
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
    const results = await this.dbRead({
      query: `SELECT connectionId FROM ${ this.tableName } WHERE pk = ?;`,
      params: [ this.pk(thread) ],
    });
    return results.map(decodeOrNull(subscriptionDecoder)).filter(isNotNull);
  }

  async getSubscribersWithConnection(thread: Thread, connectionId: string): Promise<TableKey[]> {
    const results = await this.dbRead({
      query: `SELECT pk, "time" FROM ${ this.tableName } WHERE pk = ? and connectionId = ?;`,
      params: [ this.pk(thread), connectionId ],
    });
    return results.map(decodeOrNull(tableKeyDecoder)).filter(isNotNull);
  }

  async subscribe(thread: Thread, connectionId: ConnectionId, userId: string): Promise<void> {
    await this.dbWrite({
      query: `INSERT INTO "${ this.tableName }" VALUE { 'pk': ?, 'time': ?, 'ttl': ?, 'userId': ?, 'connectionId': ? }`,
      params: [ this.pk(thread), Date.now(), ttl(), userId, connectionId ]
    });
  }

  async unsubscribe(keys: TableKey[]): Promise<void> {
    await this.dbWrite(keys.map(k => ({
      query: `DELETE FROM ${ this.tableName } WHERE pk = ? AND "time" = ?`,
      params: [ k.pk, k.time ],
    })));
  }

  private pk(thread: Thread): string {
    return `THREADSUB#${thread.participantId}#${thread.itemId}`;
  }

}