import admin from 'firebase-admin';
import config from './env.js';
import logger from '../loggers/logger.js';

class FirebaseConfig {
  constructor() {
    this.initialized = false;
  }

  parseServiceAccount() {
    if (!config.firebaseServiceAccount) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is missing from environment variables.');
    }

    try {
      const serviceAccount = JSON.parse(config.firebaseServiceAccount);
      if (typeof serviceAccount.private_key === 'string') {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      return serviceAccount;
    } catch (err) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT must be valid JSON: ${err.message}`);
    }
  }

  initialize() {
    if (this.initialized || admin.apps.length) {
      this.initialized = true;
      return admin.app();
    }

    if (!config.firebaseStorageBucket) {
      throw new Error('FIREBASE_STORAGE_BUCKET is missing from environment variables.');
    }

    const serviceAccount = this.parseServiceAccount();
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: config.firebaseStorageBucket,
    });

    admin.firestore().settings({ ignoreUndefinedProperties: true });
    this.initialized = true;
    logger.info('Firebase Admin initialized');
    return admin.app();
  }

  getDb() {
    this.initialize();
    return admin.firestore();
  }

  getBucket() {
    this.initialize();
    return admin.storage().bucket();
  }
}

const firebaseConfig = new FirebaseConfig();

export const initializeFirebase = () => firebaseConfig.initialize();
export const getDb = () => firebaseConfig.getDb();
export const getBucket = () => firebaseConfig.getBucket();
export { admin };
export default firebaseConfig;
