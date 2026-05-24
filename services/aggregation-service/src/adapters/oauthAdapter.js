import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';
import { logger } from '../logger/index.js';
import { cache } from '../utils/cache.js';
import { CircuitBreaker } from '../circuitBreaker/index.js';

// Google OAuth configuration
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Circuit breaker for OAuth providers
const oauthBreaker = new CircuitBreaker({
  timeout: 8000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});

class OAuthAdapter {
  /**
   * Verify Google ID token
   * @param {string} idToken - Google ID token
   * @returns {Promise<Object>} User profile information
   */
  async verifyGoogleToken(idToken) {
    const cacheKey = `oauth:google:${idToken}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for Google OAuth: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const ticket = await oauthBreaker.fire(async () => {
        return await googleClient.verifyIdToken({
          idToken: idToken,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
      });
      
      const payload = ticket.getPayload();
      const userInfo = {
        id: payload.sub,
        email: payload.email,
        email_verified: payload.email_verified,
        name: payload.name,
        given_name: payload.given_name,
        family_name: payload.family_name,
        picture: payload.picture,
        locale: payload.locale,
        provider: 'google'
      };

      // Cache for 5 minutes
      await cache.set(cacheKey, JSON.stringify(userInfo), 300);
      logger.info(`Verified Google OAuth token for user: ${userInfo.email}`);
      return userInfo;
    } catch (error) {
      logger.error(`Google OAuth verification failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get Google user info using access token
   * @param {string} accessToken - Google access token
   * @returns {Promise<Object>} User profile information
   */
  async getGoogleUserInfo(accessToken) {
    const cacheKey = `oauth:google_info:${accessToken}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for Google user info: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const response = await oauthBreaker.fire(async () => {
        return await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      });
      
      const userInfo = {
        id: response.data.id,
        email: response.data.email,
        email_verified: response.data.verified_email,
        name: response.data.name,
        given_name: response.data.given_name,
        family_name: response.data.family_name,
        picture: response.data.picture,
        locale: response.data.locale,
        provider: 'google'
      };

      // Cache for 5 minutes
      await cache.set(cacheKey, JSON.stringify(userInfo), 300);
      logger.info(`Retrieved Google user info for: ${userInfo.email}`);
      return userInfo;
    } catch (error) {
      logger.error(`Failed to get Google user info: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify Facebook access token
   * @param {string} accessToken - Facebook access token
   * @returns {Promise<Object>} User profile information
   */
  async verifyFacebookToken(accessToken) {
    const cacheKey = `oauth:facebook:${accessToken}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for Facebook OAuth: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const response = await oauthBreaker.fire(async () => {
        return await axios.get(`https://graph.facebook.com/me`, {
          params: {
            fields: 'id,email,first_name,last_name,name,picture.width(200).height(200)',
            access_token: accessToken,
          },
        });
      });
      
      const userInfo = {
        id: response.data.id,
        email: response.data.email,
        name: response.data.name,
        first_name: response.data.first_name,
        last_name: response.data.last_name,
        picture: response.data.picture.data.url,
        provider: 'facebook'
      };

      // Cache for 5 minutes
      await cache.set(cacheKey, JSON.stringify(userInfo), 300);
      logger.info(`Verified Facebook OAuth token for user: ${userInfo.email}`);
      return userInfo;
    } catch (error) {
      logger.error(`Facebook OAuth verification failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify Apple identity token
   * @param {string} identityToken - Apple identity token
   * @returns {Promise<Object>} User profile information
   */
  async verifyAppleToken(identityToken) {
    // Note: For production, you should verify the JWT signature using Apple's public keys
    // This is a simplified version for demonstration
    
    const cacheKey = `oauth:apple:${identityToken}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for Apple OAuth: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      // Decode the JWT token (without verification for simplicity)
      // In production, use a proper JWT library to verify the signature
      const base64Url = identityToken.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));

      const payload = JSON.parse(jsonPayload);
      
      // Verify issuer and audience (simplified)
      if (payload.iss !== 'https://appleid.apple.com') {
        throw new Error('Invalid issuer');
      }
      
      if (payload.aud !== process.env.APPLE_CLIENT_ID) {
        throw new Error('Invalid audience');
      }

      const userInfo = {
        id: payload.sub,
        email: payload.email,
        email_verified: payload.email_verified || false,
        name: payload.name || '',
        provider: 'apple'
      };

      // Cache for 5 minutes
      await cache.set(cacheKey, JSON.stringify(userInfo), 300);
      logger.info(`Verified Apple OAuth token for user: ${userInfo.email}`);
      return userInfo;
    } catch (error) {
      logger.error(`Apple OAuth verification failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get Apple user info using authorization code
   * @param {string} authorizationCode - Apple authorization code
   * @returns {Promise<Object>} User profile information
   */
  async getAppleUserInfo(authorizationCode) {
    // Note: This requires making a request to Apple's token endpoint
    // For simplicity, we're skipping the implementation here
    // In production, you would exchange the code for tokens and then verify the identity token
    
    throw new Error('Apple authorization code exchange not implemented');
  }
}

export default new OAuthAdapter();