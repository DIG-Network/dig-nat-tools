/**
 * Directory Watcher Example
 * 
 * This example demonstrates how to use the host with a manual directory watcher
 * to serve files from a directory.
 * 
 * Usage:
 * 1. Run this example: npm run example:directory-watcher
 * 2. Add or modify files in the created 'shared-files' directory
 * 3. The host will serve these files when requested by hash
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import * as net from 'net';
import * as http from 'http';

// Configuration
const SHARE_DIR = path.join(process.cwd(), 'shared-files');
const EXAMPLE_FILES = [
  { name: 'hello.txt', content: 'Hello, World!' },
  { name: 'info.json', content: JSON.stringify({ version: '1.0.0', date: new Date().toISOString() }) },
  { name: 'image.txt', content: 'This would be a binary image in a real example' }
];

// File hash to file path mapping
const fileMap: Map<string, string> = new Map();

// Host configuration
const HOST_PORT = 8080;
const HOST_ID = crypto.randomBytes(8).toString('hex');

// Simple HTTP server to serve file chunks
let server: http.Server | null = null;

async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (error) => reject(error));
  });
}

async function hostFileCallback(sha256: string, startChunk: number, chunkSize: number): Promise<Buffer[] | null> {
  try {
    // Get the file path from the hash map
    const filePath = fileMap.get(sha256);
    if (!filePath) {
      console.log(`File with hash ${sha256} not found`);
      return null;
    }
    
    // Read the file
    const buffer = await fs.readFile(filePath);
    
    // Calculate start and end positions for the chunk
    const start = startChunk * chunkSize;
    const end = Math.min(start + chunkSize, buffer.length);
    
    // Return null if start is beyond file length (indicating end of file)
    if (start >= buffer.length) {
      return null;
    }
    
    // Return the chunk
    return [buffer.slice(start, end)];
  } catch (error) {
    console.error(`Error serving file: ${error}`);
    return null;
  }
}

async function setupExampleFiles(): Promise<void> {
  // Ensure the directory exists
  await fs.ensureDir(SHARE_DIR);
  
  // Create example files
  for (const file of EXAMPLE_FILES) {
    const filePath = path.join(SHARE_DIR, file.name);
    await fs.writeFile(filePath, file.content);
    console.log(`Created example file: ${filePath}`);
    
    // Calculate and store hash
    const hash = await calculateFileHash(filePath);
    fileMap.set(hash, filePath);
    console.log(`Hash for ${file.name}: ${hash}`);
  }
  
  console.log('Example files prepared');
}

// Simple scan of files in a directory
async function scanDirectory(directory: string): Promise<Map<string, string>> {
  const result: Map<string, string> = new Map();
  const files = await fs.readdir(directory);
  
  for (const file of files) {
    const filePath = path.join(directory, file);
    const stats = await fs.stat(filePath);
    
    if (stats.isFile()) {
      const hash = await calculateFileHash(filePath);
      result.set(filePath, hash);
      console.log(`Scanned file: ${file} -> ${hash}`);
    }
  }
  
  return result;
}

// Start a simple HTTP server to serve file chunks
function startServer(): Promise<void> {
  return new Promise((resolve) => {
    server = http.createServer(async (req, res) => {
      // Parse the URL to extract the file hash and chunk info
      const url = new URL(req.url || '/', `http://localhost:${HOST_PORT}`);
      const hash = url.pathname.slice(1); // Remove leading slash
      const startChunk = parseInt(url.searchParams.get('chunk') || '0');
      const chunkSize = parseInt(url.searchParams.get('size') || '65536'); // Default 64KB
      
      if (!hash) {
        // Root path - show list of files
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.write('<h1>Available Files</h1><ul>');
        
        for (const [hash, filePath] of fileMap.entries()) {
          res.write(`<li><a href="/${hash}">${path.basename(filePath)}</a> (${hash})</li>`);
        }
        
        res.write('</ul>');
        res.end();
        return;
      }
      
      // Get the file chunk
      const chunks = await hostFileCallback(hash, startChunk, chunkSize);
      
      if (!chunks || chunks.length === 0) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found or chunk out of range');
        return;
      }
      
      // Serve the chunk
      res.writeHead(200, { 
        'Content-Type': 'application/octet-stream',
        'Content-Length': chunks[0].length.toString()
      });
      res.end(chunks[0]);
    });
    
    server.listen(HOST_PORT, () => {
      console.log(`Server started on http://localhost:${HOST_PORT}`);
      resolve();
    });
  });
}

// Stop the server
async function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        console.log('Server stopped');
        resolve();
      });
    } else {
      resolve();
    }
  });
}

async function main() {
  try {
    // Set up example files
    await setupExampleFiles();
    
    // Scan directory
    console.log(`Scanning directory: ${SHARE_DIR}`);
    const files = await scanDirectory(SHARE_DIR);
    
    // Update file map with scanned files
    for (const [filePath, hash] of files.entries()) {
      if (!fileMap.has(hash)) {
        fileMap.set(hash, filePath);
      }
    }
    
    // Start server
    await startServer();
    
    console.log('----------------------------------');
    console.log(`Host ID: ${HOST_ID}`);
    console.log(`Files being served from: ${SHARE_DIR}`);
    console.log('----------------------------------');
    console.log('Instructions:');
    console.log(`1. Visit http://localhost:${HOST_PORT} to see available files`);
    console.log(`2. Access a file by its hash: http://localhost:${HOST_PORT}/{hash}`);
    console.log(`3. Request a specific chunk: http://localhost:${HOST_PORT}/{hash}?chunk=0&size=65536`);
    console.log('4. Available files and their hashes:');
    
    for (const [hash, filePath] of fileMap.entries()) {
      console.log(`   - ${path.basename(filePath)}: ${hash}`);
    }
    
    console.log('----------------------------------');
    console.log('5. Press Ctrl+C to stop the server');
    console.log('----------------------------------');
    
    // Set up file watcher
    const watcher = fs.watch(SHARE_DIR, { persistent: true }, async (eventType, filename) => {
      if (!filename) return;
      
      const filePath = path.join(SHARE_DIR, filename);
      
      try {
        if (eventType === 'rename') {
          // File was added or removed
          if (await fs.pathExists(filePath)) {
            // File was added
            const stats = await fs.stat(filePath);
            if (stats.isFile()) {
              const hash = await calculateFileHash(filePath);
              fileMap.set(hash, filePath);
              console.log(`Added file: ${filename} -> ${hash}`);
            }
          } else {
            // File was removed - find by path and remove from map
            for (const [hash, path] of fileMap.entries()) {
              if (path === filePath) {
                fileMap.delete(hash);
                console.log(`Removed file: ${filename} -> ${hash}`);
                break;
              }
            }
          }
        } else if (eventType === 'change') {
          // File was modified
          const stats = await fs.stat(filePath);
          if (stats.isFile()) {
            // Find old hash and remove it
            for (const [hash, path] of fileMap.entries()) {
              if (path === filePath) {
                fileMap.delete(hash);
                break;
              }
            }
            
            // Calculate new hash and add it
            const hash = await calculateFileHash(filePath);
            fileMap.set(hash, filePath);
            console.log(`Modified file: ${filename} -> ${hash}`);
          }
        }
      } catch (error) {
        console.error(`Error processing file event for ${filename}:`, error);
      }
    });
    
    // Wait for process termination
    process.on('SIGINT', async () => {
      console.log('\nStopping server...');
      watcher.close();
      await stopServer();
      console.log('Goodbye!');
      process.exit(0);
    });
  } catch (error) {
    console.error('Error in main function:', error);
  }
}

// Run the example
main().catch(console.error); 