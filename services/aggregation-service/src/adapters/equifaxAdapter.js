import axios from 'axios';
import { logger } from '../logger/index.js';
import { cache } from '../utils/cache.js';
import { CircuitBreaker } from '../circuitBreaker/index.js';

const EQUIFAX_BASE_URL = 'https://api.equifax.com';
const EQUIFAX_CLIENT_ID = process.env.EQUIFAX_CLIENT_ID;
const EQUIFAX_CLIENT_SECRET = process.env.EQUIFAX_CLIENT_SECRET;
let equifaxAccessToken = null;
let tokenExpiryTime = 0;

// Circuit breaker for Equifax API
const equifaxBreaker = new CircuitBreaker({
  timeout: 15000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});

/**
 * Get Equifax access token using client credentials
 * @returns {Promise<string>} Access token
 */
async function getEquifaxAccessToken() {
  // Return cached token if still valid
  if (equifaxAccessToken && Date.now() < tokenExpiryTime) {
    return equifaxAccessToken;
  }

  try {
    const response = await axios.post(`${EQUIFAX_BASE_URL}/oauth/token`, 
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: EQUIFAX_CLIENT_ID,
        client_secret: EQUIFAX_CLIENT_SECRET,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    equifaxAccessToken = response.data.access_token;
    // Set expiry time to 5 minutes before actual expiry to account for clock skew
    tokenExpiryTime = Date.now() + ((response.data.expires_in - 300) * 1000);
    
    logger.info('Obtained Equifax access token');
    return equifaxAccessToken;
  } catch (error) {
    logger.error(`Failed to get Equifax access token: ${error.message}`);
    throw error;
  }
}

class EquifaxAdapter {
  /**
   * Get credit report for an individual
   * @param {Object} individualData - Individual's personal information
   * @returns {Promise<Object>} Credit report
   */
  async getCreditReport(individualData) {
    const cacheKey = `equifax:credit_report:${individualData.ssn || individualData.email}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for Equifax credit report: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const accessToken = await getEquifaxAccessToken();
      
      const response = await equifaxBreaker.fire(async () => {
        return await axios.post(`${EQUIFAX_BASE_URL}/commercial/v1/credit-report`, 
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
      logger.info(`Retrieved Equifax credit report for: ${individualData.ssn || individualData.email}`);
      return response.data;
    } catch (error) {
      logger.error(`Equifax credit report failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get credit score for an individual
   * @param {Object} individualData - Individual's personal information
   * @returns {Promise<Object>} Credit score
   */
  async getCreditScore(individualData) {
    const cacheKey = `equifax:credit_score:${individualData.ssn || individualData.email}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for Equifax credit score: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const accessToken = await getEquifaxAccessToken();
      
      const response = await equifaxBreaker.fire(async () => {
        return await axios.post(`${EQUIFAX_BASE_URL}/commercial/v1/credit-score`, 
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
      logger.info(`Retrieved Equifax credit score for: ${individualData.ssn || individualData.email}`);
      return response.data;
    } catch (error) {
      logger.error(`Equifax credit score failed: ${error.message}`);
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
      const accessToken = await getEquifaxAccessToken();
      
      const response = await equifaxBreaker.fire(async () => {
        return await axios.post(`${EQUIFAX_BASE_URL}/commercial/v1/identity-verification`, 
          individualData,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );
      });
      
      logger.info(`Performed Equifax identity verification for: ${individualData.ssn || individualData.email}`);
      return response.data;
    } catch (error) {
      logger.error(`Equifax identity verification failed: ${error.message}`);
      throw error;
    }
  }
}

export default new EquifaxAdapter();