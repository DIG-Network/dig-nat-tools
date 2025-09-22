import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { NodeConfig } from './types.js';

const require = createRequire(import.meta.url);
const { Service } = require('node-windows');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ServiceOptions {
  name?: string;
  description?: string;
  config?: NodeConfig;
  configPath?: string;
}

export class DigNodeServiceManager {
  private serviceName: string;
  private serviceDescription: string;
  private scriptPath: string;
  private configPath: string;

  constructor(options: ServiceOptions = {}) {
    this.serviceName = options.name || 'DigNodeService';
    this.serviceDescription = options.description || 'DIG Network File Sharing Node';
    this.scriptPath = path.resolve(__dirname, 'service-wrapper.js');
    this.configPath = options.configPath || path.resolve('dig-node-service-config.json');

    // Create service config if provided
    if (options.config) {
      this.saveServiceConfig(options.config);
    }
  }

  private saveServiceConfig(config: NodeConfig): void {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  public async install(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create the service wrapper script
      this.createServiceWrapper();

      const svc = new Service({
        name: this.serviceName,
        description: this.serviceDescription,
        script: this.scriptPath,
        nodeOptions: [
          '--loader', './loader.mjs'
        ],
        env: {
          name: 'DIG_NODE_CONFIG_PATH',
          value: this.configPath
        }
      });

      svc.on('install', () => {
        console.log('✅ Service installed successfully');
        resolve();
      });

      svc.on('invalidinstallation', () => {
        reject(new Error('Service installation failed - invalid installation'));
      });

      svc.on('alreadyinstalled', () => {
        reject(new Error('Service is already installed'));
      });

      svc.install();
    });
  }

  public async uninstall(): Promise<void> {
    return new Promise((resolve, reject) => {
      const svc = new Service({
        name: this.serviceName,
        script: this.scriptPath
      });

      svc.on('uninstall', () => {
        console.log('✅ Service uninstalled successfully');
        // Clean up service wrapper
        if (fs.existsSync(this.scriptPath)) {
          fs.unlinkSync(this.scriptPath);
        }
        resolve();
      });

      svc.on('doesnotexist', () => {
        reject(new Error('Service does not exist'));
      });

      svc.uninstall();
    });
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const svc = new Service({
        name: this.serviceName,
        script: this.scriptPath
      });

      svc.on('start', () => {
        console.log('✅ Service started successfully');
        resolve();
      });

      svc.on('error', (error: Error) => {
        reject(error);
      });

      svc.start();
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      const svc = new Service({
        name: this.serviceName,
        script: this.scriptPath
      });

      svc.on('stop', () => {
        console.log('✅ Service stopped successfully');
        resolve();
      });

      svc.on('error', (error: Error) => {
        reject(error);
      });

      svc.stop();
    });
  }

  public getStatus(): Promise<{ isInstalled: boolean; isRunning: boolean }> {
    return new Promise((resolve) => {
      const svc = new Service({
        name: this.serviceName,
        script: this.scriptPath
      });

      let isInstalled = false;
      let isRunning = false;

      svc.on('start', () => {
        isInstalled = true;
        isRunning = true;
        resolve({ isInstalled, isRunning });
      });

      svc.on('stop', () => {
        isInstalled = true;
        isRunning = false;
        resolve({ isInstalled, isRunning });
      });

      svc.on('alreadyrunning', () => {
        isInstalled = true;
        isRunning = true;
        resolve({ isInstalled, isRunning });
      });

      svc.on('invalidinstallation', () => {
        isInstalled = false;
        isRunning = false;
        resolve({ isInstalled, isRunning });
      });

      svc.on('doesnotexist', () => {
        isInstalled = false;
        isRunning = false;
        resolve({ isInstalled, isRunning });
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        // If we get here, assume service exists but status is unknown
        isInstalled = true;
        isRunning = false;
        resolve({ isInstalled, isRunning });
      }, 5000);

      // Try to get status by attempting to start (this will trigger appropriate events)
      try {
        svc.start();
      } catch (error) {
        // If start fails, service likely doesn't exist
        resolve({ isInstalled: false, isRunning: false });
      }
    });
  }

  private createServiceWrapper(): void {
    const wrapperContent = `
// Service wrapper for DIG Node
import { DigNode } from './dig-node.js';
import { NodeConfig } from './types.js';
import fs from 'fs';
import path from 'path';

async function startService() {
  try {
    const configPath = process.env.DIG_NODE_CONFIG_PATH || './dig-node-service-config.json';
    
    if (!fs.existsSync(configPath)) {
      throw new Error(\`Config file not found: \${configPath}\`);
    }

    const config: NodeConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    
    console.log('Starting DIG Node service...');
    const node = new DigNode(config);
    await node.start();
    
    console.log('DIG Node service started successfully');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down DIG Node service...');
      await node.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('Shutting down DIG Node service...');
      await node.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start DIG Node service:', error);
    process.exit(1);
  }
}

startService();
`;

    fs.writeFileSync(this.scriptPath, wrapperContent);
  }
}