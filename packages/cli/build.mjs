/**
 * Build script for @sentryvault/cli.
 * Bundles cli.ts with esbuild (ESM), including @sentryvault/core
 * and its dependencies, into a single distributable file.
 * Also copies static files (HTML, CSS, app.js) to dist/.
 */
import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = __dirname; // packages/cli
const ROOT = join(CLI, '..', '..'); // monorepo root

async function buildCli() {
  // Bundle cli.ts with esbuild (ESM), resolving @sentryvault/core
  // from TypeScript sources so everything is compiled together.
  console.log('Bundling cli.ts with esbuild...');
  await build({
    entryPoints: [join(CLI, 'src/cli.ts')],
    bundle: true,
    outfile: join(CLI, 'dist/cli.js'),
    format: 'esm',
    platform: 'node',
    sourcemap: 'inline',
    logLevel: 'info',
    banner: {
      js: '#!/usr/bin/env node',
    },
    alias: {
      '@sentryvault/core': join(ROOT, 'packages/core/src/index.ts'),
    },
    tsconfig: join(ROOT, 'tsconfig.json'),
  });

  // Copy static files from web package
  console.log('Copying static files...');
  await mkdir(join(CLI, 'dist'), { recursive: true });
  await copyFile(join(CLI, '..', 'web', 'src', 'index.html'), join(CLI, 'dist', 'index.html'));
  await copyFile(join(CLI, '..', 'web', 'src', 'styles.css'), join(CLI, 'dist', 'styles.css'));
  await copyFile(join(CLI, '..', 'web', 'src', 'app.js'), join(CLI, 'dist', 'app.js'));

  // Make the output executable
  await writeFile(join(CLI, 'dist', 'cli.js'), await readFile(join(CLI, 'dist', 'cli.js')));
  console.log('CLI build complete ✓');
}

buildCli().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
