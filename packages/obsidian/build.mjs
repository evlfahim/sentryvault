/**
 * Build script for @sentryvault/obsidian.
 * Bundles the Obsidian plugin with esbuild, including @sentryvault/core.
 */
import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OBSIDIAN = __dirname; // packages/obsidian
const ROOT = join(OBSIDIAN, '..', '..'); // monorepo root

async function buildPlugin() {
  console.log('Building @sentryvault/obsidian plugin...');

  // Read manifest.json and package.json for version
  const manifest = JSON.parse(await readFile(join(OBSIDIAN, 'manifest.json'), 'utf-8'));
  const pkg = JSON.parse(await readFile(join(OBSIDIAN, 'package.json'), 'utf-8'));

  // Bundle with esbuild (ESM, target ES2022 for Obsidian)
  await build({
    entryPoints: [join(OBSIDIAN, 'src', 'main.ts')],
    bundle: true,
    outfile: join(OBSIDIAN, 'dist', 'main.js'),
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    sourcemap: 'inline',
    logLevel: 'info',
    external: ['obsidian'], // Obsidian types are provided by the host
    alias: {
      '@sentryvault/core': join(ROOT, 'packages/core/src/index.ts'),
    },
    tsconfig: join(ROOT, 'tsconfig.json'),
    banner: {
      js: `// @ts-nocheck\n// SentryVault Obsidian Plugin v${pkg.version}`,
    },
  });

  // Copy manifest.json and styles to dist
  await mkdir(join(OBSIDIAN, 'dist'), { recursive: true });
  await copyFile(join(OBSIDIAN, 'manifest.json'), join(OBSIDIAN, 'dist', 'manifest.json'));

  // Copy styles.css if it exists
  const stylesPath = join(OBSIDIAN, 'src', 'styles.css');
  try {
    await copyFile(stylesPath, join(OBSIDIAN, 'dist', 'styles.css'));
  } catch {
    // No styles.css, that's fine
  }

  console.log('Obsidian plugin build complete ✓');
  console.log(`  Output: ${join(OBSIDIAN, 'dist', 'main.js')}`);
  console.log(`  Manifest: ${join(OBSIDIAN, 'dist', 'manifest.json')}`);
}

buildPlugin().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
