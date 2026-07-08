const AWS = require('aws-sdk');
const logger = require('./logger');

class S3Config {
  constructor() {
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.bucketName = process.env.S3_BUCKET_NAME || 'flora-documents';
    this.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    this.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    // Initialize S3 client
    this.s3 = new AWS.S3({
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      region: this.region,
      maxRetries: 3,
      retryDelayOptions: {
        customBackoff: function(retryCount) {
          return Math.pow(2, retryCount) * 100;
        }
      }
    });

    logger.info('S3 configuration initialized', {
      bucket: this.bucketName,
      region: this.region
    });
  }

  getClient() {
    return this.s3;
  }

  getBucketName() {
    return this.bucketName;
  }

  getRegion() {
    return this.region;
  }
}

module.exports = new S3Config();
