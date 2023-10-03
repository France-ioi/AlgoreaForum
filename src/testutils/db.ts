/* eslint-disable @typescript-eslint/naming-convention */
import { QueryCommandOutput } from '@aws-sdk/client-dynamodb';
import { dynamodb, toDBItem } from '../dynamodb';

const putItem = async (data: Record<string, unknown>): Promise<void> => {
  await dynamodb.putItem({
    TableName: 'algorea-forum-dev',
    Item: toDBItem(data),
  });
};
export const loadFixture = async (data: Record<string, unknown>[]): Promise<void> => {
  await Promise.all(data.map(putItem));
};

export const getAll = (): Promise<QueryCommandOutput> => dynamodb.scan({ TableName: 'algorea-forum-dev' });

export const deleteAll = async (): Promise<void> => {
  const result = await getAll();
  await Promise.all((result.Items || []).map(item => {
    if (!item.pk || !item.time) return;
    return dynamodb.deleteItem({
      TableName: 'algorea-forum-dev',
      Key: { pk: item.pk, time: item.time },
    });
  }));
};
