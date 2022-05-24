import type { APIGatewayProxyHandler } from 'aws-lambda';
import fs from 'fs';
import path from 'path';

export const html: APIGatewayProxyHandler = async event => ({
  statusCode: 200,
  body: fs.readFileSync(path.resolve(process.cwd(), 'public/index.html'), 'utf-8'),
  headers: {
    'content-type': 'text/html',
  },
});

export const js: APIGatewayProxyHandler = async event => ({
  statusCode: 200,
  body: fs.readFileSync(path.resolve(process.cwd(), 'public/main.js'), 'utf-8'),
  headers: {
    'content-type': 'application/javascript',
  },
});
