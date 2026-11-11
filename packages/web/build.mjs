/**
 * Build script for @sentryvault/web.
 * Bundles server.js with esbuild (ESM), including @sentryvault/core
 * and its dependencies, into a single distributable file.
 * Also copies static files (HTML, CSS, app.js) to dist/.
 */
import { build } from 'esbuild';
import { mkdir, copyFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB = __dirname; // packages/web
const ROOT = join(WEB, '..', '..'); // monorepo root

async function buildWeb() {
  // Bundle server.js with esbuild (ESM), resolving @sentryvault/core
  // from TypeScript sources so everything is compiled together.
  console.log('Bundling server.js with esbuild...');
  await build({
    entryPoints: [join(WEB, 'src/server.js')],
    bundle: true,
    outfile: join(WEB, 'dist/server.js'),
    format: 'esm',
    platform: 'node',
    sourcemap: 'inline',
    logLevel: 'info',
    alias: {
      '@sentryvault/core': join(ROOT, 'packages/core/src/index.ts'),
    },
    tsconfig: join(ROOT, 'tsconfig.json'),
  });

  // Copy static files
  console.log('Copying static files...');
  await mkdir(join(WEB, 'dist'), { recursive: true });
  await copyFile(join(WEB, 'src/index.html'), join(WEB, 'dist/index.html'));
  await copyFile(join(WEB, 'src/styles.css'), join(WEB, 'dist/styles.css'));
  await copyFile(join(WEB, 'src/app.js'), join(WEB, 'dist/app.js'));

  console.log('Web build complete ✓');
}

buildWeb().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
