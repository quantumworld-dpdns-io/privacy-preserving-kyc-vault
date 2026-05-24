import twilio from 'twilio';
import { logger } from '../logger/index.js';
import { CircuitBreaker } from '../circuitBreaker/index.js';

// Twilio client configuration
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Circuit breaker for Twilio API
const twilioBreaker = new CircuitBreaker({
  timeout: 8000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});

class TwilioAdapter {
  /**
   * Send an SMS message
   * @param {Object} messageData - SMS details
   * @returns {Promise<Object>} Message response
   */
  async sendSms(messageData) {
    try {
      const message = await twilioBreaker.fire(async () => {
        return await twilioClient.messages.create({
          body: messageData.body,
          from: messageData.from || process.env.TWILIO_PHONE_NUMBER,
          to: messageData.to,
        });
      });
      
      logger.info(`Sent Twilio SMS: ${message.sid}`);
      return message;
    } catch (error) {
      logger.error(`Twilio SMS sending failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send a WhatsApp message
   * @param {Object} messageData - WhatsApp message details
   * @returns {Promise<Object>} Message response
   */
  async sendWhatsApp(messageData) {
    try {
      const message = await twilioBreaker.fire(async () => {
        return await twilioClient.messages.create({
          body: messageData.body,
          from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886'}`,
          to: `whatsapp:${messageData.to}`,
        });
      });
      
      logger.info(`Sent Twilio WhatsApp message: ${message.sid}`);
      return message;
    } catch (error) {
      logger.error(`Twilio WhatsApp sending failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Make a phone call
   * @param {Object} callData - Call details
   * @returns {Promise<Object>} Call response
   */
  async makeCall(callData) {
    try {
      const call = await twilioBreaker.fire(async () => {
        return await twilioClient.calls.create({
          url: callData.url,
          to: callData.to,
          from: callData.from || process.env.TWILIO_PHONE_NUMBER,
          method: callData.method || 'GET',
        });
      });
      
      logger.info(`Made Twilio call: ${call.sid}`);
      return call;
    } catch (error) {
      logger.error(`Twilio call failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify a phone number
   * @param {Object} verifyData - Verification details
   * @returns {Promise<Object>} Verification response
   */
  async verifyPhone(verifyData) {
    try {
      const verification = await twilioBreaker.fire(async () => {
        return await twilioClient.verify
          .services(process.env.TWILIO_VERIFY_SERVICE_SID)
          .verifications
          .create({
            to: verifyData.to,
            channel: verifyData.channel || 'sms',
          });
      });
      
      logger.info(`Started Twilio phone verification: ${verifyData.to}`);
      return verification;
    } catch (error) {
      logger.error(`Twilio phone verification failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check verification code
   * @param {Object} checkData - Check details
   * @returns {Promise<Object>} Verification check response
   */
  async checkVerification(checkData) {
    try {
      const verificationCheck = await twilioBreaker.fire(async () => {
        return await twilioClient.verify
          .services(process.env.TWILIO_VERIFY_SERVICE_SID)
          .verificationChecks
          .create({
            to: checkData.to,
            code: checkData.code,
          });
      });
      
      logger.info(`Checked Twilio verification for: ${checkData.to}`);
      return verificationCheck;
    } catch (error) {
      logger.error(`Twilio verification check failed: ${error.message}`);
      throw error;
    }
  }
}

export default new TwilioAdapter();