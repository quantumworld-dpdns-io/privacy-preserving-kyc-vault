import { createSchema, createYoga } from 'graphql-yoga';
import { stitchSchemas } from '@graphql-tools/stitch';
import { loadFilesSync } from '@graphql-tools/load-files';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { logger } from '../logger/index.js';
import stripeAdapter from '../adapters/stripeAdapter.js';
import plaidAdapter from '../adapters/plaidAdapter.js';
import jumioAdapter from '../adapters/jumioAdapter.js';
import onfidoAdapter from '../adapters/onfidoAdapter.js';
import experianAdapter from '../adapters/experianAdapter.js';
import equifaxAdapter from '../adapters/equifaxAdapter.js';
import googleMapsAdapter from '../adapters/googleMapsAdapter.js';
import twilioAdapter from '../adapters/twilioAdapter.js';
import sendgridAdapter from '../adapters/sendgridAdapter.js';
import sesAdapter from '../adapters/sesAdapter.js';
import s3Adapter from '../adapters/s3Adapter.js';
import web3Adapter from '../adapters/web3Adapter.js';
import oauthAdapter from '../adapters/oauthAdapter.js';

// Load GraphQL type definitions
const typeDefs = loadFilesSync(`${__dirname}/**/*.graphql`);

// Resolvers
const resolvers = {
  Query: {
    // Stripe queries
    getPaymentIntent: async (_, { id }) => {
      return await stripeAdapter.retrievePaymentIntent(id);
    },
    
    // Plaid queries
    getPlaidAccounts: async (_, { accessToken }) => {
      return await plaidAdapter.getAccounts(accessToken);
    },
    getPlaidTransactions: async (_, { accessToken, startDate, endDate, count, offset }) => {
      return await plaidAdapter.getTransactions({
        accessToken,
        startDate,
        endDate,
        count,
        offset
      });
    },
    getPlaidIdentity: async (_, { accessToken }) => {
      return await plaidAdapter.getIdentity(accessToken);
    },
    
    // Jumio queries
    getJumioVerificationStatus: async (_, { merchantScanReference }) => {
      return await jumioAdapter.getVerificationStatus(merchantScanReference);
    },
    getJumioVerificationResult: async (_, { merchantScanReference }) => {
      return await jumioAdapter.getVerificationResult(merchantScanReference);
    },
    
    // Onfido queries
    getOnfidoCheckStatus: async (_, { checkId }) => {
      return await onfidoAdapter.getCheckStatus(checkId);
    },
    getOnfidoCheckResult: async (_, { checkId }) => {
      return await onfidoAdapter.getCheckResult(checkId);
    },
    
    // Experian queries
    getExperianCreditReport: async (_, { individualData }) => {
      return await experianAdapter.getCreditReport(individualData);
    },
    getExperianCreditScore: async (_, { individualData }) => {
      return await experianAdapter.getCreditScore(individualData);
    },
    verifyExperianIdentity: async (_, { individualData }) => {
      return await experianAdapter.verifyIdentity(individualData);
    },
    
    // Equifax queries
    getEquifaxCreditReport: async (_, { individualData }) => {
      return await equifaxAdapter.getCreditReport(individualData);
    },
    getEquifaxCreditScore: async (_, { individualData }) => {
      return await equifaxAdapter.getCreditScore(individualData);
    },
    verifyEquifaxIdentity: async (_, { individualData }) => {
      return await equifaxAdapter.verifyIdentity(individualData);
    },
    
    // Google Maps queries
    geocodeAddress: async (_, { address }) => {
      return await googleMapsAdapter.geocode(address);
    },
    reverseGeocode: async (_, { lat, lng }) => {
      return await googleMapsAdapter.reverseGeocode({ lat, lng });
    },
    validateAddress: async (_, { addressComponents }) => {
      return await googleMapsAdapter.validateAddress(addressComponents);
    },
    getPlaceDetails: async (_, { placeId }) => {
      return await googleMapsAdapter.getPlaceDetails(placeId);
    },
    
    // Web3 queries
    getEthBalance: async (_, { address }) => {
      const balanceWei = await web3Adapter.getBalance(address, 'ethereum');
      return {
        balanceWei,
        balanceEth: parseInt(balanceWei) / Math.pow(10, 18)
      };
    },
    getTokenBalance: async (_, { tokenContractAddress, walletAddress, network }) => {
      return await web3Adapter.getTokenBalance(tokenContractAddress, walletAddress, network);
    },
    getBlockNumber: async (_, { network }) => {
      const blockNumber = await web3Adapter.getBlockNumber(network);
      return { blockNumber };
    },
    
    // OAuth queries
    verifyGoogleToken: async (_, { idToken }) => {
      return await oauthAdapter.verifyGoogleToken(idToken);
    },
    getGoogleUserInfo: async (_, { accessToken }) => {
      return await oauthAdapter.getGoogleUserInfo(accessToken);
    },
    verifyFacebookToken: async (_, { accessToken }) => {
      return await oauthAdapter.verifyFacebookToken(accessToken);
    },
    verifyAppleToken: async (_, { identityToken }) => {
      return await oauthAdapter.verifyAppleToken(identityToken);
    }
  },
  
  Mutation: {
    // Stripe mutations
    createPaymentIntent: async (_, { paymentData }) => {
      return await stripeAdapter.createPaymentIntent(paymentData);
    },
    confirmPaymentIntent: async (_, { paymentIntentId, confirmData }) => {
      return await stripeAdapter.confirmPaymentIntent(paymentIntentId, confirmData);
    },
    createRefund: async (_, { refundData }) => {
      return await stripeAdapter.createRefund(refundData);
    },
    
    // Plaid mutations
    createPlaidLinkToken: async (_, { userData }) => {
      return await plaidAdapter.createLinkToken(userData);
    },
    exchangePlaidPublicToken: async (_, { publicToken }) => {
      return await plaidAdapter.exchangePublicToken(publicToken);
    },
    
    // Jumio mutations
    createJumioVerification: async (_, { verificationData }) => {
      return await jumioAdapter.createVerification(verificationData);
    },
    
    // Onfido mutations
    createOnfidoApplicant: async (_, { applicantData }) => {
      return await onfidoAdapter.createApplicant(applicantData);
    },
    uploadOnfidoDocument: async (_, { applicantId, file, fileType }) => {
      // Note: File upload would need special handling in GraphQL
      // This is a simplified version
      return await onfidoAdapter.uploadDocument(applicantId, file, fileType);
    },
    createOnfidoCheck: async (_, { checkData }) => {
      return await onfidoAdapter.createCheck(checkData);
    },
    
    // Twilio mutations
    sendTwilioSms: async (_, { messageData }) => {
      return await twilioAdapter.sendSms(messageData);
    },
    sendTwilioWhatsApp: async (_, { messageData }) => {
      return await twilioAdapter.sendWhatsApp(messageData);
    },
    makeTwilioCall: async (_, { callData }) => {
      return await twilioAdapter.makeCall(callData);
    },
    verifyTwilioPhone: async (_, { verifyData }) => {
      return await twilioAdapter.verifyPhone(verifyData);
    },
    checkTwilioVerification: async (_, { checkData }) => {
      return await twilioAdapter.checkVerification(checkData);
    },
    
    // SendGrid mutations
    sendSendGridEmail: async (_, { emailData }) => {
      return await sendgridAdapter.sendEmail(emailData);
    },
    sendSendGridMultipleEmails: async (_, { emailDataArray }) => {
      return await sendgridAdapter.sendMultipleEmails(emailDataArray);
    },
    
    // SES mutations
    sendSesEmail: async (_, { emailData }) => {
      return await sesAdapter.sendEmail(emailData);
    },
    sendSesRawEmail: async (_, { emailData }) => {
      return await sesAdapter.sendRawEmail(emailData);
    },
    
    // S3 mutations
    uploadS3File: async (_, { uploadParams }) => {
      return await s3Adapter.uploadFile(uploadParams);
    },
    deleteS3File: async (_, { deleteParams }) => {
      return await s3Adapter.deleteFile(deleteParams);
    },
    getS3SignedUrl: async (_, { urlParams }) => {
      return await s3Adapter.getSignedUrl(urlParams);
    }
  }
};

// Create the schema
const schema = makeExecutableSchema({
  typeDefs,
  resolvers
});

// Create GraphQL Yoga server
const yoga = createYoga({
  schema,
  graphqlEndpoint: '/graphql',
  logging: {
    debug: (...args) => logger.debug(...args),
    info: (...args) => logger.info(...args),
    warn: (...args) => logger.warn(...args),
    error: (...args) => logger.error(...args),
  },
  context: async ({ request }) => {
    return {
      headers: request.headers,
      userAgent: request.headers.get('user-agent') || '',
    };
  }
});

export default yoga;