import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();

console.log('[RadarNBA Guard] Validando la integridad del proyecto RadarNBA...');

// 1. Verify metadata.json
const metadataPath = path.join(ROOT_DIR, 'metadata.json');
if (!fs.existsSync(metadataPath)) {
  console.error('[CRÍTICO - RadarNBA Guard] metadata.json no existe.');
  process.exit(1);
}

try {
  const meta = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  if (meta.name !== 'RadarNBA') {
    console.error(`[CRÍTICO - RadarNBA Guard] Nombre de la app alterado: "${meta.name}". Se requiere "RadarNBA".`);
    process.exit(1);
  }
} catch (e) {
  console.error('[CRÍTICO - RadarNBA Guard] Error al leer metadata.json:', e);
  process.exit(1);
}

// 2. Verify index.html
const indexPath = path.join(ROOT_DIR, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error('[CRÍTICO - RadarNBA Guard] index.html no existe.');
  process.exit(1);
}
const indexContent = fs.readFileSync(indexPath, 'utf-8');
if (!indexContent.includes('RadarNBA')) {
  console.error('[CRÍTICO - RadarNBA Guard] index.html ha perdido la referencia a RadarNBA.');
  process.exit(1);
}

// 3. Verify core modules exist
const coreModules = [
  'src/App.tsx',
  'src/components/GuidedHomeView.tsx',
  'src/components/AnomalyRadarView.tsx',
  'src/components/GameDayAnalyzerView.tsx',
  'src/components/HeadToHeadBattleView.tsx',
  'src/components/StreaksConsistencyView.tsx',
  'src/components/FantasyEspnAssistantView.tsx',
  'src/server/nbaDataService.ts',
];

for (const modPath of coreModules) {
  const fullPath = path.join(ROOT_DIR, modPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`[CRÍTICO - RadarNBA Guard] Módulo protegido no encontrado: ${modPath}`);
    process.exit(1);
  }
}

// 4. Verify App.tsx keywords
const appContent = fs.readFileSync(path.join(ROOT_DIR, 'src/App.tsx'), 'utf-8');
const requiredAppKeywords = ['gameday', 'anomalies', 'streaks', 'duel', 'comparator', 'awards', 'milestones'];
for (const kw of requiredAppKeywords) {
  if (!appContent.includes(kw)) {
    console.error(`[CRÍTICO - RadarNBA Guard] src/App.tsx carece de la sección obligatoria "${kw}".`);
    process.exit(1);
  }
}

console.log('[RadarNBA Guard] ✅ INTEGRIDAD VERIFICADA DE FORMA EXITOSA: RadarNBA está protegido e intacto.');
process.exit(0);
