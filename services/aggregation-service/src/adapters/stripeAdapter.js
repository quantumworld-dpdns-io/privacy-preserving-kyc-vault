import Stripe from 'stripe';
import { logger } from '../logger/index.js';
import { cache } from '../utils/cache.js';
import { CircuitBreaker } from '../circuitBreaker/index.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

// Circuit breaker for Stripe API
const stripeBreaker = new CircuitBreaker({
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});

class StripeAdapter {
  /**
   * Create a payment intent
   * @param {Object} paymentData - Payment details
   * @returns {Promise<Object>} Payment intent
   */
  async createPaymentIntent(paymentData) {
    const cacheKey = `stripe:payment_intent:${paymentData.amount}:${paymentData.currency}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for stripe payment intent: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const paymentIntent = await stripeBreaker.fire(async () => {
        return await stripe.paymentIntents.create({
          amount: paymentData.amount,
          currency: paymentData.currency,
          metadata: paymentData.metadata,
        });
      });

      // Cache for 30 seconds
      await cache.set(cacheKey, JSON.stringify(paymentIntent), 30);
      logger.info(`Created stripe payment intent: ${paymentIntent.id}`);
      return paymentIntent;
    } catch (error) {
      logger.error(`Stripe payment intent creation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Retrieve a payment intent
   * @param {string} paymentIntentId - Payment intent ID
   * @returns {Promise<Object>} Payment intent
   */
  async retrievePaymentIntent(paymentIntentId) {
    const cacheKey = `stripe:payment_intent:${paymentIntentId}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for stripe payment intent: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const paymentIntent = await stripeBreaker.fire(async () => {
        return await stripe.paymentIntents.retrieve(paymentIntentId);
      });

      // Cache for 1 minute
      await cache.set(cacheKey, JSON.stringify(paymentIntent), 60);
      logger.info(`Retrieved stripe payment intent: ${paymentIntentId}`);
      return paymentIntent;
    } catch (error) {
      logger.error(`Stripe payment intent retrieval failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Confirm a payment intent
   * @param {string} paymentIntentId - Payment intent ID
   * @param {Object} confirmData - Confirmation data
   * @returns {Promise<Object>} Confirmed payment intent
   */
  async confirmPaymentIntent(paymentIntentId, confirmData) {
    try {
      const paymentIntent = await stripeBreaker.fire(async () => {
        return await stripe.paymentIntents.confirm(paymentIntentId, confirmData);
      });
      logger.info(`Confirmed stripe payment intent: ${paymentIntentId}`);
      return paymentIntent;
    } catch (error) {
      logger.error(`Stripe payment intent confirmation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a refund
   * @param {Object} refundData - Refund details
   * @returns {Promise<Object>} Refund
   */
  async createRefund(refundData) {
    try {
      const refund = await stripeBreaker.fire(async () => {
        return await stripe.refunds.create(refundData);
      });
      logger.info(`Created stripe refund: ${refund.id}`);
      return refund;
    } catch (error) {
      logger.error(`Stripe refund creation failed: ${error.message}`);
      throw error;
    }
  }
}

export default new StripeAdapter();