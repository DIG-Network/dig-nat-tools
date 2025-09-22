#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { DigNode } from './dig-node.js';
import { NodeConfig } from './types.js';
import { DigNodeServiceManager } from './service-manager.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const program = new Command();

program
  .name('dig-node')
  .description('CLI for DIG network file sharing node')
  .version('1.0.0');

program
  .command('start')
  .description('Start the DIG node')
  .option('-p, --port <port>', 'Port to listen on', '8080')
  .option('-d, --dig-dir <path>', 'Directory containing .dig files', path.join(os.homedir(), '.dig'))
  .option('--peers <peers>', 'Comma-separated list of GunJS peers', '')
  .option('--namespace <namespace>', 'GunJS namespace', 'dig-network')
  .option('--log-level <level>', 'Log level (debug, info, warn, error)', 'info')
  .option('--config <path>', 'Path to config file')
  .action(async (options: { port: string; digDir: string; peers: string; namespace: string; logLevel: string; config?: string }) => {
    try {
      console.log(chalk.blue('🚀 Starting DIG Node...'));
      
      // Load config from file if specified
      let config: NodeConfig = {
        port: parseInt(options.port),
        digDirectory: options.digDir,
        gunOptions: {
          peers: options.peers ? options.peers.split(',').map((p: string) => p.trim()) : undefined,
          namespace: options.namespace
        },
        logLevel: options.logLevel as 'debug' | 'info' | 'warn' | 'error'
      };

      if (options.config && fs.existsSync(options.config)) {
        const fileConfig = JSON.parse(fs.readFileSync(options.config, 'utf-8'));
        config = { ...config, ...fileConfig };
      }

      // Ensure dig directory exists
      if (!fs.existsSync(config.digDirectory)) {
        console.log(chalk.yellow(`📁 Creating dig directory: ${config.digDirectory}`));
        fs.mkdirSync(config.digDirectory, { recursive: true });
      }

      const node = new DigNode(config);
      await node.start();

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log(chalk.yellow('\n🛑 Shutting down DIG Node...'));
        await node.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        console.log(chalk.yellow('\n🛑 Shutting down DIG Node...'));
        await node.stop();
        process.exit(0);
      });

    } catch (error) {
      console.error(chalk.red('❌ Failed to start DIG Node:'), error);
      process.exit(1);
    }
  });

program
  .command('stop')
  .description('Stop the DIG node service')
  .action(async () => {
    try {
      const serviceManager = new DigNodeServiceManager();
      await serviceManager.stop();
    } catch (error) {
      console.error(chalk.red('❌ Failed to stop service:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check the status of the DIG node service')
  .action(async () => {
    try {
      const serviceManager = new DigNodeServiceManager();
      const status = await serviceManager.getStatus();
      
      console.log(chalk.blue('📊 DIG Node Service Status:'));
      console.log(`  Installed: ${status.isInstalled ? chalk.green('✅ Yes') : chalk.red('❌ No')}`);
      console.log(`  Running: ${status.isRunning ? chalk.green('✅ Yes') : chalk.red('❌ No')}`);
    } catch (error) {
      console.error(chalk.red('❌ Failed to get status:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('install-service')
  .description('Install DIG node as a Windows service')
  .option('-c, --config <path>', 'Configuration file path', './dig-node-config.json')
  .action(async (options: { config: string }) => {
    try {
      if (!fs.existsSync(options.config)) {
        console.error(chalk.red(`❌ Config file not found: ${options.config}`));
        console.log(chalk.yellow('💡 Use "dig-node config" to create a sample config file'));
        process.exit(1);
      }

      const config: NodeConfig = JSON.parse(fs.readFileSync(options.config, 'utf-8'));
      const serviceManager = new DigNodeServiceManager({
        config,
        configPath: path.resolve(options.config)
      });
      
      console.log(chalk.blue('📦 Installing DIG Node as Windows service...'));
      await serviceManager.install();
      
      console.log(chalk.green('✅ Service installed successfully!'));
      console.log(chalk.yellow('💡 Use "dig-node start-service" to start the service'));
    } catch (error) {
      console.error(chalk.red('❌ Failed to install service:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('uninstall-service')
  .description('Uninstall the DIG node Windows service')
  .action(async () => {
    try {
      const serviceManager = new DigNodeServiceManager();
      console.log(chalk.blue('🗑️ Uninstalling DIG Node service...'));
      await serviceManager.uninstall();
    } catch (error) {
      console.error(chalk.red('❌ Failed to uninstall service:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('start-service')
  .description('Start the DIG node Windows service')
  .action(async () => {
    try {
      const serviceManager = new DigNodeServiceManager();
      console.log(chalk.blue('▶️ Starting DIG Node service...'));
      await serviceManager.start();
    } catch (error) {
      console.error(chalk.red('❌ Failed to start service:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('stop-service')
  .description('Stop the DIG node Windows service')
  .action(async () => {
    try {
      const serviceManager = new DigNodeServiceManager();
      console.log(chalk.blue('⏹️ Stopping DIG Node service...'));
      await serviceManager.stop();
    } catch (error) {
      console.error(chalk.red('❌ Failed to stop service:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Generate a sample configuration file')
  .option('-o, --output <path>', 'Output path for config file', './dig-node-config.json')
  .action((options: { output: string }) => {
    const sampleConfig: NodeConfig = {
      port: 8080,
      digDirectory: path.join(os.homedir(), '.dig'),
      gunOptions: {
        peers: ['http://nostalgiagame.go.ro:30878/gun'],
        namespace: 'dig-network',
        webrtc: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      },
      logLevel: 'info',
      syncInterval: 30000,
      maxConcurrentDownloads: 5
    };

    fs.writeFileSync(options.output, JSON.stringify(sampleConfig, null, 2));
    console.log(chalk.green(`✅ Sample config file created: ${options.output}`));
  });

program.parse();