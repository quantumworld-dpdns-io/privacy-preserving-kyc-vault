import { Client } from '@googlemaps/google-maps-services-js';
import { logger } from '../logger/index.js';
import { cache } from '../utils/cache.js';
import { CircuitBreaker } from '../circuitBreaker/index.js';

const googleMapsClient = new Client({});

// Circuit breaker for Google Maps API
const googleMapsBreaker = new CircuitBreaker({
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});

class GoogleMapsAdapter {
  /**
   * Geocode an address (convert address to coordinates)
   * @param {string} address - Address to geocode
   * @returns {Promise<Object>} Geocoding results
   */
  async geocode(address) {
    const cacheKey = `google_maps:geocode:${encodeURIComponent(address)}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for Google Maps geocode: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const response = await googleMapsBreaker.fire(async () => {
        return await googleMapsClient.geocode({
          params: {
            address: address,
            key: process.env.GOOGLE_MAPS_API_KEY,
          },
          timeout: 5000, // milliseconds
        });
      });

      // Cache for 24 hours (geocoding results are relatively static)
      await cache.set(cacheKey, JSON.stringify(response.data), 86400);
      logger.info(`Geocoded address: ${address}`);
      return response.data;
    } catch (error) {
      logger.error(`Google Maps geocoding failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reverse geocode coordinates (convert coordinates to address)
   * @param {Object} latlng - Latitude and longitude coordinates
   * @returns {Promise<Object>} Reverse geocoding results
   */
  async reverseGeocode(latlng) {
    const cacheKey = `google_maps:reverse_geocode:${latlng.lat},${latlng.lng}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for Google Maps reverse geocode: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const response = await googleMapsBreaker.fire(async () => {
        return await googleMapsClient.reverseGeocode({
          params: {
            latlng: `${latlng.lat},${latlng.lng}`,
            key: process.env.GOOGLE_MAPS_API_KEY,
          },
          timeout: 5000, // milliseconds
        });
      });

      // Cache for 24 hours
      await cache.set(cacheKey, JSON.stringify(response.data), 86400);
      logger.info(`Reverse geocoded coordinates: ${latlng.lat},${latlng.lng}`);
      return response.data;
    } catch (error) {
      logger.error(`Google Maps reverse geocoding failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate an address
   * @param {Object} addressComponents - Address components to validate
   * @returns {Promise<Object>} Address validation results
   */
  async validateAddress(addressComponents) {
    try {
      // Construct address string from components
      const addressParts = [
        addressComponents.street_number,
        addressComponents.route,
        addressComponents.locality,
        addressComponents.administrative_area_level_1,
        addressComponents.postal_code,
        addressComponents.country
      ].filter(part => part).join(', ');
      
      const geocodeResult = await this.geocode(addressParts);
      
      // Check if we got a result and if it's a good match
      if (geocodeResult.results && geocodeResult.results.length > 0) {
        const result = geocodeResult.results[0];
        // Check if the address components match what we expect
        const addressTypes = result.address_components.map(comp => comp.types);
        const hasExpectedComponents = addressComponents.street_number && 
          addressTypes.some(types => types.includes('street_number'));
          
        logger.info(`Validated address: ${addressParts}`);
        return {
          valid: true,
          formatted_address: result.formatted_address,
          coordinates: {
            lat: result.geometry.location.lat,
            lng: result.geometry.location.lng
          },
          address_components: result.address_components,
          place_id: result.place_id
        };
      } else {
        logger.warn(`Address validation failed - no results: ${addressParts}`);
        return {
          valid: false,
          error: 'Address not found'
        };
      }
    } catch (error) {
      logger.error(`Google Maps address validation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get place details
   * @param {string} placeId - Google Place ID
   * @returns {Promise<Object>} Place details
   */
  async getPlaceDetails(placeId) {
    const cacheKey = `google_maps:place_details:${placeId}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for Google Maps place details: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const response = await googleMapsBreaker.fire(async () => {
        return await googleMapsClient.placeDetails({
          params: {
            place_id: placeId,
            key: process.env.GOOGLE_MAPS_API_KEY,
            fields: ['address_component', 'formatted_address', 'geometry', 'name', 'place_id', 'type', 'url', 'viewport']
          },
          timeout: 5000, // milliseconds
        });
      });

      // Cache for 24 hours
      await cache.set(cacheKey, JSON.stringify(response.data), 86400);
      logger.info(`Retrieved Google Maps place details: ${placeId}`);
      return response.data;
    } catch (error) {
      logger.error(`Google Maps place details failed: ${error.message}`);
      throw error;
    }
  }
}

export default new GoogleMapsAdapter();