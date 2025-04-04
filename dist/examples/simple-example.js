"use strict";
/**
 * Simple example showing how to host and download files using dig-nat-tools
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const index_1 = require("../index");
// Create directories for the example
const EXAMPLE_DIR = path.join(process.cwd(), 'example-data');
const DOWNLOADS_DIR = path.join(process.cwd(), 'downloads');
const SAMPLE_FILE_PATH = path.join(EXAMPLE_DIR, 'sample-file.dat');
/**
 * Calculate the SHA-256 hash of a file
 * @param filePath - Path to the file
 * @returns The file hash
 */
async function calculateFileHash(filePath) {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    return new Promise((resolve, reject) => {
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}
/**
 * Main function that runs the example
 */
async function main() {
    try {
        // Create necessary directories
        await fs.ensureDir(EXAMPLE_DIR);
        await fs.ensureDir(DOWNLOADS_DIR);
        // Create a sample file if it doesn't exist
        if (!await fs.pathExists(SAMPLE_FILE_PATH)) {
            console.log('Creating sample file...');
            // Create a 10MB random file
            const buffer = crypto.randomBytes(10 * 1024 * 1024);
            await fs.writeFile(SAMPLE_FILE_PATH, buffer);
        }
        // Calculate the hash of the sample file
        console.log('Calculating file hash...');
        const sampleFileHash = await calculateFileHash(SAMPLE_FILE_PATH);
        console.log(`Sample file hash: ${sampleFileHash}`);
        // Start hosting the file
        console.log('Starting host...');
        const host = (0, index_1.createHost)({
            enableTCP: true,
            enableUDP: true,
            enableWebRTC: true,
            tcpPort: 12345,
            stunServers: [
                'stun:stun.l.google.com:19302',
                'stun:stun1.l.google.com:19302'
            ],
            // Add a hostFileCallback function that serves the sample file
            hostFileCallback: async (hash, startChunk, chunkSize) => {
                if (hash === sampleFileHash) {
                    try {
                        // Check if the file exists
                        if (!await fs.pathExists(SAMPLE_FILE_PATH)) {
                            return null;
                        }
                        // Get file stats
                        const stats = await fs.stat(SAMPLE_FILE_PATH);
                        // Calculate start position
                        const start = startChunk * chunkSize;
                        // If we're past the end of the file, return EOF
                        if (start >= stats.size) {
                            return null;
                        }
                        // Read the chunk
                        const buffer = Buffer.alloc(chunkSize);
                        const fileHandle = await fs.open(SAMPLE_FILE_PATH, 'r');
                        const { bytesRead } = await fs.read(fileHandle, buffer, 0, chunkSize, start);
                        await fs.close(fileHandle);
                        // Return data or EOF
                        if (bytesRead === 0) {
                            return null;
                        }
                        else {
                            return [buffer.slice(0, bytesRead)];
                        }
                    }
                    catch (err) {
                        console.error('Error reading file chunk:', err);
                        return null;
                    }
                }
                return null;
            }
        });
        // Start the host
        await host.start();
        console.log(`Host started with ID: ${host.getHostId()}`);
        // Wait a moment to ensure the host is fully started
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Download the file
        console.log('Starting download...');
        const savePath = path.join(DOWNLOADS_DIR, 'downloaded-file.dat');
        // For the example, we'll create a peer connection string manually
        // In a real application, these would come from the host's published connection points
        const peerConnections = ['localhost:12345']; // Using a hardcoded port for simplicity
        console.log(`Using peer connections: ${peerConnections.join(', ')}`);
        await (0, index_1.downloadFile)(sampleFileHash, savePath, peerConnections, {
            progressCallback: (progress) => {
                console.log(`Download progress: ${progress.percent}% (${progress.received}/${progress.total} bytes)`);
            }
        });
        console.log(`File downloaded to: ${savePath}`);
        // Verify the downloaded file
        const downloadedHash = await calculateFileHash(savePath);
        console.log(`Downloaded file hash: ${downloadedHash}`);
        if (downloadedHash === sampleFileHash) {
            console.log('✅ File integrity verified - hashes match!');
        }
        else {
            console.error('❌ File integrity check failed - hashes do not match!');
        }
        // Stop the host
        await host.stop();
        console.log('Host stopped.');
    }
    catch (err) {
        console.error('Error in example:', err);
    }
}
// Run the example
if (require.main === module) {
    main().catch(console.error);
}
//# sourceMappingURL=simple-example.js.map