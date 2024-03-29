import * as D from 'io-ts/Decoder';
import { DynamoDB, ExecuteStatementCommandOutput } from '@aws-sdk/client-dynamodb';
import { fromDBItem, toDBItem, toDBParameters } from './dynamodb';
import { DBError } from './utils/errors';

export const tableKeyDecoder = D.struct({
  pk: D.string,
  time: D.number,
});

export type TableKey = D.TypeOf<typeof tableKeyDecoder>;

export interface DBStatement {
  query: string,
  params: unknown[],
  limit?: number,
}

export class ForumTable {
  protected tableName: string;

  constructor(protected db: DynamoDB) {
    const tableName = process.env.TABLE_NAME;
    if (tableName === undefined || !tableName.length) throw new Error('env variable "TABLE_NAME" not set!');
    this.tableName = tableName;
  }

  protected async sqlWrite(statements: DBStatement[]|DBStatement): Promise<void> {
    try {
      /* eslint-disable @typescript-eslint/naming-convention */
      if (Array.isArray(statements)) {
        await this.db.executeTransaction({
          TransactStatements: statements.map(s => ({
            Statement: s.query,
            Parameters: toDBParameters(s.params),
          })),
        });
      } else await this.db.executeStatement({ Statement: statements.query, Parameters: toDBParameters(statements.params) });
      /* eslint-enable @typescript-eslint/naming-convention */
    } catch (err) {
      if (err instanceof Error) throw new DBError(`[${err.name}] ${err.message}`, JSON.stringify(statements));
      else throw err;
    }
  }

  protected async sqlRead(statement: DBStatement): Promise<Record<string, unknown>[]> {
    let output: ExecuteStatementCommandOutput;
    try {
      /* eslint-disable @typescript-eslint/naming-convention */
      output = await this.db.executeStatement({
        Statement: statement.query,
        Parameters: toDBParameters(statement.params),
        Limit: statement.limit
      });
      /* eslint-enable @typescript-eslint/naming-convention */
    } catch (err) {
      if (err instanceof Error) throw new DBError(`[${err.name}] ${err.message}`, JSON.stringify(statement));
      else throw err;
    }
    if (!output.Items) throw new DBError('(unexpected) no items in output', JSON.stringify(statement));
    return output.Items.map(fromDBItem);
  }

  protected async batchUpdate<T extends TableKey>(items: T[]): Promise<void> {
    const chunkSize = 25; // the max size of 'RequestItems' for the dynamoDB APi
    for (let i = 0; i < items.length; i += chunkSize) {
      await this.db.batchWriteItem({
        /* eslint-disable @typescript-eslint/naming-convention */
        RequestItems: {
          [this.tableName]: items.slice(i, i + chunkSize).map(i => ({
            PutRequest: {
              Item: toDBItem(i),
            },
          })),
        }
        /* eslint-enable @typescript-eslint/naming-convention */
      });
    }

  }

}