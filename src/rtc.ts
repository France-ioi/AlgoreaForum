import { APIGatewayProxyHandler } from 'aws-lambda'

export const sendOfferToConnectedPeers: APIGatewayProxyHandler = async (event) => {
  return {
    statusCode: 418,
    body: '',
  };
};

export const answerToOffer: APIGatewayProxyHandler = async (event) => {
  return {
    statusCode: 418,
    body: '',
  };
};

export const acceptAnswer: APIGatewayProxyHandler = async (event) => {
    return {
    statusCode: 418,
    body: '',
  };
};
