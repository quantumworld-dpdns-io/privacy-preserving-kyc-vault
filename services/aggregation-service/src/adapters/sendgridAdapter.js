import sgMail from '@sendgrid/mail';
import { logger } from '../logger/index.js';
import { CircuitBreaker } from '../circuitBreaker/index.js';

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Circuit breaker for SendGrid API
const sendgridBreaker = new CircuitBreaker({
  timeout: 8000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});

class SendGridAdapter {
  /**
   * Send an email
   * @param {Object} emailData - Email details
   * @returns {Promise<Object>} Email response
   */
  async sendEmail(emailData) {
    const msg = {
      to: emailData.to,
      from: emailData.from || process.env.SENDGRID_FROM_EMAIL,
      subject: emailData.subject,
      text: emailData.text,
      html: emailData.html,
    };

    // Add attachments if provided
    if (emailData.attachments) {
      msg.attachments = emailData.attachments;
    }

    try {
      const response = await sendgridBreaker.fire(async () => {
        return await sgMail.send(msg);
      });
      
      logger.info(`Sent SendGrid email to: ${emailData.to}`);
      return response[0]; // SendGrid returns an array with the response as first element
    } catch (error) {
      logger.error(`SendGrid email sending failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send multiple emails
   * @param {Array<Object>} emailDataArray - Array of email details
   * @returns {Promise<Array>} Array of email responses
   */
  async sendMultipleEmails(emailDataArray) {
    const messages = emailDataArray.map(emailData => ({
      to: emailData.to,
      from: emailData.from || process.env.SENDGRID_FROM_EMAIL,
      subject: emailData.subject,
      text: emailData.text,
      html: emailData.html,
      attachments: emailData.attachments || [],
    }));

    try {
      const responses = await sendgridBreaker.fire(async () => {
        return await sgMail.send(messages);
      });
      
      logger.info(`Sent ${emailDataArray.length} SendGrid emails`);
      return responses;
    } catch (error) {
      logger.error(`SendGrid bulk email sending failed: ${error.message}`);
      throw error;
    }
  }
}

export default new SendGridAdapter();