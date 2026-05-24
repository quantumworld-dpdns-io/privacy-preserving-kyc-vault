import axios from 'axios';
import { logger } from '../logger/index.js';
import { cache } from '../utils/cache.js';
import { CircuitBreaker } from '../circuitBreaker/index.js';

const JUMIO_BASE_URL = 'https://netverify.com/api';
const JUMIO_API_TOKEN = process.env.JUMIO_API_TOKEN;
const JUMIO_API_SECRET = process.env.JUMIO_API_SECRET;

// Circuit breaker for Jumio API
const jumioBreaker = new CircuitBreaker({
  timeout: 10000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});

class JumioAdapter {
  /**
   * Create a verification request
   * @param {Object} verificationData - Verification details
   * @returns {Promise<Object>} Verification request response
   */
  async createVerification(verificationData) {
    const cacheKey = `jumio:verification:${verificationData.customerId}:${Date.now()}`;
    try {
      const response = await jumioBreaker.fire(async () => {
        return await axios.post(`${JUMIO_BASE_URL}/netverify/v2/create`, verificationData, {
          auth: {
            username: JUMIO_API_TOKEN,
            password: JUMIO_API_SECRET,
          },
          headers: {
            'Content-Type': 'application/json',
          },
        });
      });

      logger.info(`Created Jumio verification request: ${response.data.merchantScanReference}`);
      return response.data;
    } catch (error) {
      logger.error(`Jumio verification creation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get verification status
   * @param {string} merchantScanReference - Merchant scan reference
   * @returns {Promise<Object>} Verification status
   */
  async getVerificationStatus(merchantScanReference) {
    const cacheKey = `jumio:status:${merchantScanReference}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for Jumio status: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const response = await jumioBreaker.fire(async () => {
        return await axios.get(`${JUMIO_BASE_URL}/netverify/v2/status/${merchantScanReference}`, {
          auth: {
            username: JUMIO_API_TOKEN,
            password: JUMIO_API_SECRET,
          },
        });
      });

      // Cache for 30 seconds (status updates frequently)
      await cache.set(cacheKey, JSON.stringify(response.data), 30);
      logger.info(`Retrieved Jumio verification status: ${merchantScanReference}`);
      return response.data;
    } catch (error) {
      logger.error(`Jumio verification status failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get verification result details
   * @param {string} merchantScanReference - Merchant scan reference
   * @returns {Promise<Object>} Verification result details
   */
  async getVerificationResult(merchantScanReference) {
    try {
      const response = await jumioBreaker.fire(async () => {
        return await axios.get(`${JUMIO_BASE_URL}/netverify/v2/result/${merchantScanReference}`, {
          auth: {
            username: JUMIO_API_TOKEN,
            password: JUMIO_API_SECRET,
          },
        });
      });
      
      logger.info(`Retrieved Jumio verification result: ${merchantScanReference}`);
      return response.data;
    } catch (error) {
      logger.error(`Jumio verification result failed: ${error.message}`);
      throw error;
    }
  }
}

export default new JumioAdapter();