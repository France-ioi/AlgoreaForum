import * as D from 'io-ts/Decoder';
import { DynamoDB, ExecuteStatementCommandOutput } from '@aws-sdk/client-dynamodb';
import { fromDBItem, toDBParameters } from './dynamodb';
import { DBError } from './utils/errors';

export const tableKeyDecoder = D.struct({
  pk: D.string,
  time: D.number,
});

export type TableKey = D.TypeOf<typeof tableKeyDecoder>;

export interface DBStatement {
  query: string,
  params: unknown[],
}

export class ForumTable {
  protected tableName = 'forumTable';

  constructor(protected db: DynamoDB) {}

  async dbWrite(statements: DBStatement[]|DBStatement): Promise<void> {
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

  async dbRead(statement: DBStatement): Promise<Record<string, unknown>[]> {
    let output: ExecuteStatementCommandOutput;
    try {
      /* eslint-disable @typescript-eslint/naming-convention */
      output = await this.db.executeStatement({ Statement: statement.query, Parameters: toDBParameters(statement.params) });
      /* eslint-enable @typescript-eslint/naming-convention */
    } catch (err) {
      if (err instanceof Error) throw new DBError(`[${err.name}] ${err.message}`, JSON.stringify(statement));
      else throw err;
    }
    if (!output.Items) throw new DBError('(unexpected) no items in output', JSON.stringify(statement));
    return output.Items.map(fromDBItem);
  }

}