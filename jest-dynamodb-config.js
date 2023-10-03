/* eslint-disable @typescript-eslint/naming-convention */
'use strict';

module.exports = {
  port: 8000,
  tables: [{
    BillingMode: 'PAY_PER_REQUEST',
    TableName: 'algorea-forum-dev',
    TimeToLiveSpecification: {
      AttributeName: 'ttl',
      Enabled: true,
    },
    AttributeDefinitions: [{
      AttributeName: 'pk',
      AttributeType: 'S',
    }, {
      AttributeName: 'time',
      AttributeType: 'N',
    }],
    KeySchema: [{
      AttributeName: 'pk',
      KeyType: 'HASH',
    }, {
      AttributeName: 'time',
      KeyType: 'RANGE',
    }],
  }],
  options: [ '-sharedDb', '-inMemory' ],
};
