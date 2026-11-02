import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { fileURLToPath } from 'url';

// Ensure snapshot-first mode is always active in Vercel serverless functions
if (!process.env.VERCEL) {
  process.env.VERCEL = '1';
}
if (!process.env.NBA_SNAPSHOT_ONLY) {
  process.env.NBA_SNAPSHOT_ONLY = '1';
}

import { app } from './apiApp.ts';

// Static file reference hint so @vercel/nft automatically traces data/nba-snapshot.json.gz
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATIC_NFT_SNAPSHOT_HINT = path.join(
  __dirname,
  '..',
  'data',
  'nba-snapshot.json.gz'
);
void fs.existsSync(STATIC_NFT_SNAPSHOT_HINT);

function normalizeVercelApiRequest(
  req: IncomingMessage & {
    query?: Record<string, unknown>;
    originalUrl?: string;
  }
): void {
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

  const cleanQueryObj: Record<string, string | string[]> = {};
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

export default function vercelApiHandler(
  req: IncomingMessage,
  res: ServerResponse
): void {
  normalizeVercelApiRequest(req);
  (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(
    req,
    res
  );
}
