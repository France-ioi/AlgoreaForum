/* eslint-disable @typescript-eslint/naming-convention */
import { QueryCommandOutput } from '@aws-sdk/client-dynamodb';
import { dynamodb, toDBItem } from '../dynamodb';

const putItem = async (data: Record<string, unknown>): Promise<void> => {
  await dynamodb.putItem({
    TableName: 'forumTable',
    Item: toDBItem(data),
  });
};
export const loadFixture = async (data: Record<string, unknown>[]): Promise<void> => {
  await Promise.all(data.map(putItem));
};

export const getAll = (): Promise<QueryCommandOutput> => dynamodb.scan({ TableName: 'forumTable' });

export const deleteAll = async (): Promise<void> => {
  const result = await getAll();
  await Promise.all((result.Items || []).map(item => {
    if (!item.threadId || !item.timestamp) return;
    return dynamodb.deleteItem({
      TableName: 'forumTable',
      Key: { threadId: item.threadId, timestamp: item.timestamp },
    });
  }));
};
