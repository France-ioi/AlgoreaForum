import AWS from 'aws-sdk';

const dynamoOptions = (): ConstructorParameters<typeof AWS.DynamoDB.DocumentClient>[0] => {
  switch (process.env.NODE_ENV) {
    case 'production':
      throw new Error('unhandled');
    case 'test':
      return {
        endpoint: 'localhost:8000',
        sslEnabled: false,
        region: 'local-env',
        credentials: {
          accessKeyId: 'fakeMyKeyId',
          secretAccessKey: 'fakeSecretAccessKey'
        }
      };
    default:
      return {
        region: 'localhost',
        endpoint: 'http://localhost:7000',
      };
  }
};

export const createDynamoDBClient = (): AWS.DynamoDB.DocumentClient => new AWS.DynamoDB.DocumentClient(dynamoOptions());