import axios from 'axios';
import { logger } from '../logger/index.js';
import { cache } from '../utils/cache.js';
import { CircuitBreaker } from '../circuitBreaker/index.js';

const ONFIDO_BASE_URL = 'https://api.onfido.com/v3';
const ONFIDO_API_TOKEN = process.env.ONFIDO_API_TOKEN;

// Circuit breaker for Onfido API
const onfidoBreaker = new CircuitBreaker({
  timeout: 10000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});

class OnfidoAdapter {
  /**
   * Create an applicant
   * @param {Object} applicantData - Applicant details
   * @returns {Promise<Object>} Applicant response
   */
  async createApplicant(applicantData) {
    try {
      const response = await onfidoBreaker.fire(async () => {
        return await axios.post(`${ONFIDO_BASE_URL}/applicants`, applicantData, {
          headers: {
            Authorization: `Token token=${ONFIDO_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
        });
      });
      
      logger.info(`Created Onfido applicant: ${response.data.id}`);
      return response.data;
    } catch (error) {
      logger.error(`Onfido applicant creation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Upload a document
   * @param {string} applicantId - Applicant ID
   * @param {File} file - Document file
   * @param {string} fileType - Type of document (e.g., 'passport', 'driving_licence')
   * @returns {Promise<Object>} Document response
   */
  async uploadDocument(applicantId, file, fileType) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('file_type', fileType);
      
      const response = await onfidoBreaker.fire(async () => {
        return await axios.post(`${ONFIDO_BASE_URL}/applicants/${applicantId}/documents`, formData, {
          headers: {
            Authorization: `Token token=${ONFIDO_API_TOKEN}`,
            'Content-Type': 'multipart/form-data',
          },
        });
      });
      
      logger.info(`Uploaded document for Onfido applicant: ${applicantId}`);
      return response.data;
    } catch (error) {
      logger.error(`Onfido document upload failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a check
   * @param {Object} checkData - Check details
   * @returns {Promise<Object>} Check response
   */
  async createCheck(checkData) {
    try {
      const response = await onfidoBreaker.fire(async () => {
        return await axios.post(`${ONFIDO_BASE_URL}/checks`, checkData, {
          headers: {
            Authorization: `Token token=${ONFIDO_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
        });
      });
      
      logger.info(`Created Onfido check: ${response.data.id}`);
      return response.data;
    } catch (error) {
      logger.error(`Onfido check creation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get check status
   * @param {string} checkId - Check ID
   * @returns {Promise<Object>} Check status
   */
  async getCheckStatus(checkId) {
    const cacheKey = `onfido:check:${checkId}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for Onfido check status: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const response = await onfidoBreaker.fire(async () => {
        return await axios.get(`${ONFIDO_BASE_URL}/checks/${checkId}`, {
          headers: {
            Authorization: `Token token=${ONFIDO_API_TOKEN}`,
          },
        });
      });

      // Cache for 30 seconds (status updates frequently)
      await cache.set(cacheKey, JSON.stringify(response.data), 30);
      logger.info(`Retrieved Onfido check status: ${checkId}`);
      return response.data;
    } catch (error) {
      logger.error(`Onfido check status failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get check result
   * @param {string} checkId - Check ID
   * @returns {Promise<Object>} Check result
   */
  async getCheckResult(checkId) {
    try {
      const response = await onfidoBreaker.fire(async () => {
        return await axios.get(`${ONFIDO_BASE_URL}/checks/${checkId}`, {
          headers: {
            Authorization: `Token token=${ONFIDO_API_TOKEN}`,
          },
        });
      });
      
      logger.info(`Retrieved Onfido check result: ${checkId}`);
      return response.data;
    } catch (error) {
      logger.error(`Onfido check result failed: ${error.message}`);
      throw error;
    }
  }
}

export default new OnfidoAdapter();