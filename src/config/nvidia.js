import OpenAI from 'openai';
import config from './env.js';

class NvidiaConfig {
  constructor() {
    this.client = null;
  }

  getClient() {
    if (!config.nvidiaApiKey) {
      throw new Error('NVIDIA_API_KEY is missing from environment variables.');
    }

    if (!this.client) {
      this.client = new OpenAI({
        apiKey: config.nvidiaApiKey,
        baseURL: 'https://integrate.api.nvidia.com/v1',
      });
    }

    return this.client;
  }

  getModel() {
    return config.nvidiaModel;
  }
}

const nvidiaConfig = new NvidiaConfig();

export const getNvidiaClient = () => nvidiaConfig.getClient();
export const getNvidiaModel = () => nvidiaConfig.getModel();
export default nvidiaConfig;
