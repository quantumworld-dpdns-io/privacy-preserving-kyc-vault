import AWS from 'aws-sdk';
import { logger } from '../logger/index.js';
import { CircuitBreaker } from '../circuitBreaker/index.js';

// Configure AWS SES
const ses = new AWS.SES({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

// Circuit breaker for SES API
const sesBreaker = new CircuitBreaker({
  timeout: 8000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});

class SesAdapter {
  /**
   * Send an email using AWS SES
   * @param {Object} emailData - Email details
   * @returns {Promise<Object>} Email response
   */
  async sendEmail(emailData) {
    const params = {
      Destination: {
        ToAddresses: Array.isArray(emailData.to) ? emailData.to : [emailData.to],
        CcAddresses: emailData.cc ? (Array.isArray(emailData.cc) ? emailData.cc : [emailData.cc]) : [],
        BccAddresses: emailData.bcc ? (Array.isArray(emailData.bcc) ? emailData.bcc : [emailData.bcc]) : [],
      },
      Message: {
        Body: {
          Html: { Charset: 'UTF-8', Data: emailData.html },
          Text: { Charset: 'UTF-8', Data: emailData.text },
        },
        Subject: { Charset: 'UTF-8', Data: emailData.subject },
      },
      Source: emailData.from || process.env.SES_FROM_EMAIL,
    };

    // Add reply-to addresses if provided
    if (emailData.replyTo) {
      params.ReplyToAddresses = Array.isArray(emailData.replyTo) ? emailData.replyTo : [emailData.replyTo];
    }

    try {
      const response = await sesBreaker.fire(async () => {
        return await ses.sendEmail(params).promise();
      });
      
      logger.info(`Sent SES email to: ${emailData.to}`);
      return response;
    } catch (error) {
      logger.error(`SES email sending failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send raw email (useful for attachments)
   * @param {Object} emailData - Email details including raw message
   * @returns {Promise<Object>} Email response
   */
  async sendRawEmail(emailData) {
    const params = {
      Source: emailData.from || process.env.SES_FROM_EMAIL,
      Destinations: Array.isArray(emailData.to) ? emailData.to : [emailData.to],
      RawMessage: {
        Data: Buffer.from(emailData.rawMessage),
      },
    };

    // Add reply-to addresses if provided
    if (emailData.replyTo) {
      params.ReplyToAddresses = Array.isArray(emailData.replyTo) ? emailData.replyTo : [emailData.replyTo];
    }

    try {
      const response = await sesBreaker.fire(async () => {
        return await ses.sendRawEmail(params).promise();
      });
      
      logger.info(`Sent SES raw email to: ${emailData.to}`);
      return response;
    } catch (error) {
      logger.error(`SES raw email sending failed: ${error.message}`);
      throw error;
    }
  }
}

export default new SesAdapter();