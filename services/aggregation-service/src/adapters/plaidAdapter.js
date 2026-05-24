import plaid from 'plaid';
import { logger } from '../logger/index.js';
import { cache } from '../utils/cache.js';
import { CircuitBreaker } from '../circuitBreaker/index.js';

// Plaid client configuration
const plaidClient = new plaid.Client({
  clientID: process.env.PLAID_CLIENT_ID,
  secret: process.env.PLAID_SECRET,
  env: plaidEnvironmentToString(process.env.PLAID_ENV || 'sandbox'),
  options: {
    version: '2020-09-14',
  },
});

// Circuit breaker for Plaid API
const plaidBreaker = new CircuitBreaker({
  timeout: 8000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});

/**
 * Convert plaid environment string to plaid enum
 * @param {string} env - Environment string
 * @returns {plaid.Environment} Plaid environment enum
 */
function plaidEnvironmentToString(env) {
  switch (env.toLowerCase()) {
    case 'sandbox':
      return plaid.environments.sandbox;
    case 'development':
      return plaid.environments.development;
    case 'production':
      return plaid.environments.production;
    default:
      return plaid.environments.sandbox;
  }
}

class PlaidAdapter {
  /**
   * Create a link token for Plaid integration
   * @param {Object} userData - User data for link token
   * @returns {Promise<Object>} Link token response
   */
  async createLinkToken(userData) {
    const cacheKey = `plaid:link_token:${userData.client_user_id}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for plaid link token: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const linkTokenResponse = await plaidBreaker.fire(async () => {
        return await plaidClient.createLinkToken({
          user: {
            client_user_id: userData.client_user_id,
          },
          client_name: 'Privacy Preserving KYC Vault',
          products: userData.products || ['auth', 'transactions'],
          country_codes: userData.country_codes || ['US'],
          language: userData.language || 'en',
          webhook: userData.webhook || `${process.env.BASE_URL}/webhook/plaid`,
        });
      });

      // Cache for 1 hour (link tokens expire)
      await cache.set(cacheKey, JSON.stringify(linkTokenResponse), 3600);
      logger.info(`Created plaid link token for user: ${userData.client_user_id}`);
      return linkTokenResponse;
    } catch (error) {
      logger.error(`Plaid link token creation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Exchange public token for access token
   * @param {string} publicToken - Public token from Plaid Link
   * @returns {Promise<Object>} Access token response
   */
  async exchangePublicToken(publicToken) {
    try {
      const tokenResponse = await plaidBreaker.fire(async () => {
        return await plaidClient.itemPublicTokenExchange({
          public_token: publicToken,
        });
      });
      
      logger.info(`Exchanged plaid public token for item: ${tokenResponse.item_id}`);
      return tokenResponse;
    } catch (error) {
      logger.error(`Plaid public token exchange failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get account information
   * @param {string} accessToken - Plaid access token
   * @returns {Promise<Object>} Account information
   */
  async getAccounts(accessToken) {
    const cacheKey = `plaid:accounts:${accessToken}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for plaid accounts: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const accountsResponse = await plaidBreaker.fire(async () => {
        return await plaidClient.accountsGet({
          access_token: accessToken,
        });
      });

      // Cache for 5 minutes
      await cache.set(cacheKey, JSON.stringify(accountsResponse), 300);
      logger.info(`Retrieved plaid accounts for token: ${accessToken.substring(0, 10)}...`);
      return accountsResponse;
    } catch (error) {
      logger.error(`Plaid accounts retrieval failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get transaction history
   * @param {Object} params - Parameters for transaction retrieval
   * @returns {Promise<Object>} Transaction history
   */
  async getTransactions(params) {
    try {
      const transactionsResponse = await plaidBreaker.fire(async () => {
        return await plaidClient.transactionsGet({
          access_token: params.accessToken,
          start_date: params.startDate,
          end_date: params.endDate,
          options: {
            count: params.count || 100,
            offset: params.offset || 0,
          },
        });
      });
      
      logger.info(`Retrieved plaid transactions for token: ${params.accessToken.substring(0, 10)}...`);
      return transactionsResponse;
    } catch (error) {
      logger.error(`Plaid transactions retrieval failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get identity verification data
   * @param {string} accessToken - Plaid access token
   * @returns {Promise<Object>} Identity data
   */
  async getIdentity(accessToken) {
    const cacheKey = `plaid:identity:${accessToken}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for plaid identity: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const identityResponse = await plaidBreaker.fire(async () => {
        return await plaidClient.identityGet({
          access_token: accessToken,
        });
      });

      // Cache for 1 hour
      await cache.set(cacheKey, JSON.stringify(identityResponse), 3600);
      logger.info(`Retrieved plaid identity for token: ${accessToken.substring(0, 10)}...`);
      return identityResponse;
    } catch (error) {
      logger.error(`Plaid identity retrieval failed: ${error.message}`);
      throw error;
    }
  }
}

export default new PlaidAdapter();