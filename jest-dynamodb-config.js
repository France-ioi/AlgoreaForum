/* eslint-disable @typescript-eslint/naming-convention */
'use strict';

module.exports = {
  port: 8000,
  tables: [{
    BillingMode: 'PAY_PER_REQUEST',
    TableName: 'forumTable',
    TimeToLiveSpecification: {
      AttributeName: 'expiresAt',
      Enabled: true,
    },
    AttributeDefinitions: [{
      AttributeName: 'threadId',
      AttributeType: 'S',
    }, {
      AttributeName: 'timestamp',
      AttributeType: 'N',
    }],
    KeySchema: [{
      AttributeName: 'threadId',
      KeyType: 'HASH',
    }, {
      AttributeName: 'timestamp',
      KeyType: 'RANGE',
    }],
  }],
};
