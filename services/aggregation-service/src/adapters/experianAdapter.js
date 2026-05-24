import axios from 'axios';
import { logger } from '../logger/index.js';
import { cache } from '../utils/cache.js';
import { CircuitBreaker } from '../circuitBreaker/index.js';

const EXPERIAN_BASE_URL = 'https://api.experian.com';
const EXPERIAN_CLIENT_ID = process.env.EXPERIAN_CLIENT_ID;
const EXPERIAN_CLIENT_SECRET = process.env.EXPERIAN_CLIENT_SECRET;
let experianAccessToken = null;
let tokenExpiryTime = 0;

// Circuit breaker for Experian API
const experianBreaker = new CircuitBreaker({
  timeout: 15000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});

/**
 * Get Experian access token using client credentials
 * @returns {Promise<string>} Access token
 */
async function getExperianAccessToken() {
  // Return cached token if still valid
  if (experianAccessToken && Date.now() < tokenExpiryTime) {
    return experianAccessToken;
  }

  try {
    const response = await axios.post(`${EXPERIAN_BASE_URL}/oauth2/token`, 
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: EXPERIAN_CLIENT_ID,
        client_secret: EXPERIAN_CLIENT_SECRET,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    experianAccessToken = response.data.access_token;
    // Set expiry time to 5 minutes before actual expiry to account for clock skew
    tokenExpiryTime = Date.now() + ((response.data.expires_in - 300) * 1000);
    
    logger.info('Obtained Experian access token');
    return experianAccessToken;
  } catch (error) {
    logger.error(`Failed to get Experian access token: ${error.message}`);
    throw error;
  }
}

class ExperianAdapter {
  /**
   * Get credit report for an individual
   * @param {Object} individualData - Individual's personal information
   * @returns {Promise<Object>} Credit report
   */
  async getCreditReport(individualData) {
    const cacheKey = `experian:credit_report:${individualData.ssn || individualData.email}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for Experian credit report: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const accessToken = await getExperianAccessToken();
      
      const response = await experianBreaker.fire(async () => {
        return await axios.post(`${EXPERIAN_BASE_URL}/v1/credit/report`, 
          individualData,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );
      });

      // Cache for 1 hour (credit reports don't change frequently)
      await cache.set(cacheKey, JSON.stringify(response.data), 3600);
      logger.info(`Retrieved Experian credit report for: ${individualData.ssn || individualData.email}`);
      return response.data;
    } catch (error) {
      logger.error(`Experian credit report failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get credit score for an individual
   * @param {Object} individualData - Individual's personal information
   * @returns {Promise<Object>} Credit score
   */
  async getCreditScore(individualData) {
    const cacheKey = `experian:credit_score:${individualData.ssn || individualData.email}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for Experian credit score: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const accessToken = await getExperianAccessToken();
      
      const response = await experianBreaker.fire(async () => {
        return await axios.post(`${EXPERIAN_BASE_URL}/v1/credit/score`, 
          individualData,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );
      });

      // Cache for 1 hour
      await cache.set(cacheKey, JSON.stringify(response.data), 3600);
      logger.info(`Retrieved Experian credit score for: ${individualData.ssn || individualData.email}`);
      return response.data;
    } catch (error) {
      logger.error(`Experian credit score failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify identity
   * @param {Object} individualData - Individual's personal information
   * @returns {Promise<Object>} Identity verification result
   */
  async verifyIdentity(individualData) {
    try {
      const accessToken = await getExperianAccessToken();
      
      const response = await experianBreaker.fire(async () => {
        return await axios.post(`${EXPERIAN_BASE_URL}/v1/identity/verify`, 
          individualData,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );
      });
      
      logger.info(`Performed Experian identity verification for: ${individualData.ssn || individualData.email}`);
      return response.data;
    } catch (error) {
      logger.error(`Experian identity verification failed: ${error.message}`);
      throw error;
    }
  }
}

export default new ExperianAdapter();