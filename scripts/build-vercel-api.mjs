import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outFile = path.join(rootDir, 'src', 'server', 'compiledApiApp.mjs');

await build({
  entryPoints: [path.join(rootDir, 'src', 'server', 'apiApp.ts')],
  outfile: outFile,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  packages: 'external',
  sourcemap: false,
  legalComments: 'none',
  banner: {
    js: '// Pre-compiled RadarNBA Express API bundle for Vercel Serverless\nif (!process.env.VERCEL) process.env.VERCEL = "1";\nif (!process.env.NBA_SNAPSHOT_ONLY) process.env.NBA_SNAPSHOT_ONLY = "1";',
  },
});

const stat = fs.statSync(outFile);
console.log(
  `[build-vercel-api] Built ${path.relative(rootDir, outFile)} (${(
    stat.size / 1024
  ).toFixed(1)} KB)`
);
