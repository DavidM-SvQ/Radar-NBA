import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const config = {
  maxDuration: 60,
};

// Activate snapshot-first mode on Vercel Serverless Functions
if (!process.env.VERCEL) {
  process.env.VERCEL = '1';
}
if (!process.env.NBA_SNAPSHOT_ONLY) {
  process.env.NBA_SNAPSHOT_ONLY = '1';
}

import { app } from '../src/server/compiledApiApp.mjs';

// Explicit static file hints so @vercel/nft automatically bundles modular season snapshots and micro-snapshots
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
for (const file of [
  'nba-bios.json.gz',
  'nba-snapshot-2027.json.gz',
  'nba-snapshot-2026.json.gz',
  'nba-snapshot-2025.json.gz',
  'nba-snapshot-2024.json.gz',
  'nba-heroic-shots.json.gz',
  'nba-advanced-core.json.gz',
  'nba-advanced-snapshot.json.gz',
  'nba-snapshot.json.gz',
]) {
  void fs.existsSync(path.join(__dirname, '..', 'data', file));
}

function normalizeVercelApiRequest(req) {
  const rawUrl = String(req.url || '/');
  const parsed = new URL(rawUrl, 'http://localhost');
  let pathname = parsed.pathname;

  const apiPathParam = parsed.searchParams.get('__api_path');
  if (
    (pathname === '/api/index' ||
      pathname === '/api/index.js' ||
      pathname === '/api') &&
    apiPathParam
  ) {
    const cleanSub = apiPathParam.replace(/^\/+/, '');
    pathname = `/api/${cleanSub}`;
  } else if (!pathname.startsWith('/api/') && pathname !== '/api') {
    pathname = `/api${pathname.startsWith('/') ? '' : '/'}${pathname}`;
  }

  parsed.searchParams.delete('__api_path');
  for (const key of [...parsed.searchParams.keys()]) {
    if (key.startsWith('__vercel') || key.startsWith('nxtP')) {
      parsed.searchParams.delete(key);
    }
  }

  const cleanSearch = parsed.searchParams.toString();
  const normalizedUrl = cleanSearch ? `${pathname}?${cleanSearch}` : pathname;
  req.url = normalizedUrl;
  if ('originalUrl' in req) {
    req.originalUrl = normalizedUrl;
  }

  const cleanQueryObj = {};
  for (const key of new Set(parsed.searchParams.keys())) {
    const allVals = parsed.searchParams.getAll(key);
    cleanQueryObj[key] = allVals.length > 1 ? allVals : (allVals[0] ?? '');
  }

  Object.defineProperty(req, 'query', {
    value: cleanQueryObj,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

export default function vercelApiHandler(req, res) {
  normalizeVercelApiRequest(req);
  return app(req, res);
}
