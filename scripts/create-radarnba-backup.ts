import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const BACKUP_DIR = path.join(ROOT_DIR, 'data', 'radarnba_snapshots');

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

console.log('[RadarNBA Backup] Generando snapshot local de protección...');

const filesToBackup = [
  'metadata.json',
  'radarnba-guard.json',
  'index.html',
  'src/App.tsx',
  'src/types/nba.ts',
];

const snapshot: Record<string, string> = {
  timestamp: new Date().toISOString(),
};

for (const relPath of filesToBackup) {
  const fullPath = path.join(ROOT_DIR, relPath);
  if (fs.existsSync(fullPath)) {
    snapshot[relPath] = fs.readFileSync(fullPath, 'utf-8');
  }
}

const backupPath = path.join(BACKUP_DIR, `snapshot_${Date.now()}.json`);
const latestPath = path.join(BACKUP_DIR, 'latest_radarnba_backup.json');

fs.writeFileSync(backupPath, JSON.stringify(snapshot, null, 2), 'utf-8');
fs.writeFileSync(latestPath, JSON.stringify(snapshot, null, 2), 'utf-8');

console.log(`[RadarNBA Backup] ✅ Snapshot guardado correctamente en: ${backupPath}`);
