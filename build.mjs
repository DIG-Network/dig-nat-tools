// build.mjs
import esbuild from 'esbuild';
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

// Clean dist folder
try {
  rmSync('dist', { recursive: true, force: true });
} catch (e) {
  // Ignore if dist doesn't exist
}

// Build with esbuild for better ESM support
await esbuild.build({
  entryPoints: [
    'src/index.ts',
    'src/host.ts',
    'src/client.ts',
    'src/relay.ts',
    'src/interfaces.ts',
    'src/nat-tools.ts',
    'src/registry/gun-registry.ts',
    'src/webtorrent-manager.ts',
  ],
  outdir: 'dist',
  format: 'esm',
  bundle: false,
  platform: 'node',
  target: ['node18'],
  sourcemap: true,
  splitting: false,
  preserveSymlinks: false,
  loader: {
    '.ts': 'ts'
  },
  tsconfig: './tsconfig.json'
});

// Fix ESM imports by adding .js extensions
console.log('Fixing ESM imports...');
execSync('npx tsc-esm-fix dist', { stdio: 'inherit' });

console.log('✅ Build complete with ESM-compatible imports');
