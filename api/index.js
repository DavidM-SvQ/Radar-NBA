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

// Explicit static file hint so @vercel/nft automatically bundles data/nba-snapshot.json.gz
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUNDLED_SNAPSHOT_FILE = path.join(
  __dirname,
  '..',
  'data',
  'nba-snapshot.json.gz'
);
void fs.existsSync(BUNDLED_SNAPSHOT_FILE);

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
