import admin from 'firebase-admin';
import config from './env.js';
import logger from '../loggers/logger.js';

class FirebaseConfig {
  constructor() {
    this.initialized = false;
  }

  parseServiceAccount() {
    if (config.firebaseServiceAccount) {
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

    if (config.firebaseProjectId && config.firebaseClientEmail && config.firebasePrivateKey) {
      return {
        project_id: config.firebaseProjectId,
        client_email: config.firebaseClientEmail,
        private_key: config.firebasePrivateKey.replace(/\\n/g, '\n'),
      };
    }

    throw new Error(
      'Firebase credentials are missing. Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.',
    );
  }

  initialize() {
    if (this.initialized || admin.apps.length) {
      this.initialized = true;
      return admin.app();
    }

    const serviceAccount = this.parseServiceAccount();
    const appConfig = {
      credential: admin.credential.cert(serviceAccount),
    };

    if (config.firebaseStorageBucket) {
      appConfig.storageBucket = config.firebaseStorageBucket;
    }

    admin.initializeApp(appConfig);

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
    if (!config.firebaseStorageBucket) {
      throw new Error('FIREBASE_STORAGE_BUCKET is missing from environment variables.');
    }

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
