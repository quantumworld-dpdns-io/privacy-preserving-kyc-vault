import { createApp } from './app.js';
import { getConfig } from './config.js';
import { initSchema } from './utils/weaviate.js';

const config = getConfig();
const app = createApp();

async function start() {
  try {
    await initSchema();
    
    app.listen(config.port, config.host, () => {
      console.log(`ZKP Service listening at http://${config.host}:${config.port}`);
    });
  } catch (error) {
    console.error('Failed to start ZKP service:', error);
    process.exit(1);
  }
}

start();
