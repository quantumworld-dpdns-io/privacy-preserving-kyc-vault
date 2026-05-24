import AWS from 'aws-sdk';
import { logger } from '../logger/index.js';
import { cache } from '../utils/cache.js';
import { CircuitBreaker } from '../circuitBreaker/index.js';

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

// Circuit breaker for S3 API
const s3Breaker = new CircuitBreaker({
  timeout: 10000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});

class S3Adapter {
  /**
   * Upload a file to S3
   * @param {Object} uploadParams - Upload parameters
   * @returns {Promise<Object>} Upload response
   */
  async uploadFile(uploadParams) {
    const cacheKey = `s3:upload:${uploadParams.Key}`;
    try {
      const params = {
        Bucket: uploadParams.Bucket || process.env.AWS_S3_BUCKET,
        Key: uploadParams.Key,
        Body: uploadParams.Body,
        ContentType: uploadParams.ContentType || 'application/octet-stream',
        Metadata: uploadParams.Metadata || {},
        ACL: uploadParams.ACL || 'private',
      };

      // Add server-side encryption if specified
      if (uploadParams.ServerSideEncryption) {
        params.ServerSideEncryption = uploadParams.ServerSideEncryption;
      }

      const response = await s3Breaker.fire(async () => {
        return await s3.upload(params).promise();
      });
      
      logger.info(`Uploaded file to S3: ${params.Key}`);
      return response;
    } catch (error) {
      logger.error(`S3 file upload failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download a file from S3
   * @param {Object} downloadParams - Download parameters
   * @returns {Promise<Object>} File data
   */
  async downloadFile(downloadParams) {
    const cacheKey = `s3:download:${downloadParams.Key}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for S3 download: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const params = {
        Bucket: downloadParams.Bucket || process.env.AWS_S3_BUCKET,
        Key: downloadParams.Key,
      };

      const response = await s3Breaker.fire(async () => {
        return await s3.getObject(params).promise();
      });

      // Cache for 5 minutes (adjust based on your needs)
      await cache.set(cacheKey, JSON.stringify({
        Body: response.Body.toString('base64'),
        ContentType: response.ContentType,
        Metadata: response.Metadata
      }), 300);
      
      logger.info(`Downloaded file from S3: ${params.Key}`);
      return response;
    } catch (error) {
      logger.error(`S3 file download failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a file from S3
   * @param {Object} deleteParams - Delete parameters
   * @returns {Promise<Object>} Delete response
   */
  async deleteFile(deleteParams) {
    try {
      const params = {
        Bucket: deleteParams.Bucket || process.env.AWS_S3_BUCKET,
        Key: deleteParams.Key,
      };

      const response = await s3Breaker.fire(async () => {
        return await s3.deleteObject(params).promise();
      });
      
      logger.info(`Deleted file from S3: ${params.Key}`);
      return response;
    } catch (error) {
      logger.error(`S3 file deletion failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * List files in S3 bucket with optional prefix
   * @param {Object} listParams - List parameters
   * @returns {Promise<Object>} List response
   */
  async listFiles(listParams) {
    const cacheKey = `s3:list:${listParams.Prefix || ''}:${listParams.Bucket || ''}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for S3 list: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const params = {
        Bucket: listParams.Bucket || process.env.AWS_S3_BUCKET,
        Prefix: listParams.Prefix || '',
        MaxKeys: listParams.MaxKeys || 1000,
      };

      const response = await s3Breaker.fire(async () => {
        return await s3.listObjectsV2(params).promise();
      });

      // Cache for 1 minute
      await cache.set(cacheKey, JSON.stringify(response), 60);
      logger.info(`Listed files in S3 bucket: ${params.Bucket} with prefix: ${params.Prefix}`);
      return response;
    } catch (error) {
      logger.error(`S3 file listing failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get file metadata
   * @param {Object} headParams - Head object parameters
   * @returns {Promise<Object>} File metadata
   */
  async getFileMetadata(headParams) {
    const cacheKey = `s3:head:${headParams.Key}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for S3 head: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const params = {
        Bucket: headParams.Bucket || process.env.AWS_S3_BUCKET,
        Key: headParams.Key,
      };

      const response = await s3Breaker.fire(async () => {
        return await s3.headObject(params).promise();
      });

      // Cache for 5 minutes
      await cache.set(cacheKey, JSON.stringify(response), 300);
      logger.info(`Retrieved S3 file metadata: ${params.Key}`);
      return response;
    } catch (error) {
      logger.error(`S3 head object failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate a pre-signed URL for temporary access
   * @param {Object} urlParams - URL parameters
   * @returns {Promise<string>} Pre-signed URL
   */
  async getSignedUrl(urlParams) {
    try {
      const params = {
        Bucket: urlParams.Bucket || process.env.AWS_S3_BUCKET,
        Key: urlParams.Key,
        Expires: urlParams.Expires || 3600, // 1 hour default
      };

      // Add response headers if specified
      if (urlParams.ResponseContentType) {
        params.ResponseContentType = urlParams.ResponseContentType;
      }
      if (urlParams.ResponseContentDisposition) {
        params.ResponseContentDisposition = urlParams.ResponseContentDisposition;
      }

      const url = await s3Breaker.fire(async () => {
        return await s3.getSignedUrlPromise('getObject', params);
      });
      
      logger.info(`Generated S3 signed URL for: ${params.Key}`);
      return url;
    } catch (error) {
      logger.error(`S3 signed URL generation failed: ${error.message}`);
      throw error;
    }
  }
}

export default new S3Adapter();