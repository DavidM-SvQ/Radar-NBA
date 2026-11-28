import {
  NBA_TEAMS_MAP,
  getTeamDarkUiPalette,
  getTeamLogoUrls,
  hexToRgba,
} from './teamLogos';

export type SnapshotCellTone =
  | 'neutral'
  | 'muted'
  | 'accent'
  | 'positive'
  | 'negative'
  | 'warning'
  | 'sky';

export interface SnapshotKpiItem {
  label: string;
  value: string;
  sublabel?: string;
  tone?: SnapshotCellTone;
}

export interface TableSnapshotColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  widthWeight?: number;
}

export interface TableSnapshotCell {
  text: string;
  subtext?: string;
  tone?: SnapshotCellTone;
}

export interface TableSnapshotRow {
  rank?: number | string;
  teamAbbr?: string;
  entityName: string;
  entitySubtext?: string;
  cells: Record<string, TableSnapshotCell | string>;
}

export interface EditorialVerdictOptions {
  /** Titular o insight editorial de 1 línea incrustado en el pie de la imagen exportada */
  editorialVerdict?: string;
  /** Etiqueta de cabecera del bloque editorial (por defecto: 'VEREDICTO EDITORIAL · RADARNBA') */
  editorialVerdictLabel?: string;
  /** Tono cromático del acento lateral del pie editorial */
  editorialVerdictTone?: SnapshotCellTone;
  /** Si se define, fuerza mostrar u ocultar el pie editorial; por defecto lee la preferencia del usuario */
  includeEditorialVerdict?: boolean;
}

export const EDITORIAL_VERDICT_STORAGE_KEY =
  'radarnba_export_editorial_verdict_v1';
export const EDITORIAL_VERDICT_TOGGLE_EVENT =
  'radarnba:editorial-verdict-toggle';
export const RADARNBA_SIGNATURE_DOMAIN = 'radar-nba.vercel.app';

export function getExportEditorialVerdictEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(EDITORIAL_VERDICT_STORAGE_KEY);
    if (raw === null) return true;
    return raw !== 'false' && raw !== '0';
  } catch {
    return true;
  }
}

export function setExportEditorialVerdictEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      EDITORIAL_VERDICT_STORAGE_KEY,
      enabled ? 'true' : 'false'
    );
    window.dispatchEvent(
      new CustomEvent(EDITORIAL_VERDICT_TOGGLE_EVENT, {
        detail: { enabled },
      })
    );
  } catch {
    // Ignore storage quota or private mode restrictions
  }
}

export interface TableSnapshotConfig extends EditorialVerdictOptions {
  filename: string;
  categoryTag?: string;
  title: string;
  subtitle?: string;
  entityColumnLabel?: string;
  entityColumnWeight?: number;
  showRank?: boolean;
  kpis?: SnapshotKpiItem[];
  columns: TableSnapshotColumn[];
  rows: TableSnapshotRow[];
  footerNote?: string;
}

export interface ComparisonSideItem {
  name: string;
  teamAbbr?: string;
  detail: string;
  badgeText?: string;
  badgeTone?: SnapshotCellTone;
}

export interface ComparisonSideBox {
  headerLabel: string;
  accentTone: 'orange' | 'emerald' | 'sky';
  headlineTitle: string;
  headlineValue?: string;
  headlineSubtext?: string;
  items?: ComparisonSideItem[];
  calloutText?: string;
  calloutTone?: SnapshotCellTone;
}

export interface ComparisonMetricRow {
  label: string;
  valAText: string;
  valBText: string;
  deltaText?: string;
  deltaTone?: SnapshotCellTone;
  winner?: 'A' | 'B' | 'tie';
  shareA?: number; // 0..100 visual bar proportion for Side A
}

export interface ComparisonSnapshotConfig extends EditorialVerdictOptions {
  filename: string;
  categoryTag?: string;
  title: string;
  subtitle?: string;
  verdictLabel?: string;
  verdictPrimary?: string;
  verdictPrimaryTone?: SnapshotCellTone;
  verdictSecondary?: string;
  verdictSecondaryTone?: SnapshotCellTone;
  sideA: ComparisonSideBox;
  sideB: ComparisonSideBox;
  breakdownTitle?: string;
  colALabel: string;
  colBLabel: string;
  colDeltaLabel?: string;
  rows: ComparisonMetricRow[];
  footerNote?: string;
}

export interface SvgChartFooterBadge {
  title: string;
  text: string;
  tone?: SnapshotCellTone;
}

export interface SvgChartSnapshotConfig extends EditorialVerdictOptions {
  containerId: string;
  filename: string;
  categoryTag?: string;
  title: string;
  subtitle?: string;
  kpis?: SnapshotKpiItem[];
  footerBadges?: SvgChartFooterBadge[];
  footerNote?: string;
  fallbackTable?: TableSnapshotConfig;
}

const FONT_SANS =
  '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const FONT_MONO =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const PALETTE = {
  bgCanvas: '#0B1120',
  bgHeader: '#0F172A',
  bgSurface: '#131C2E',
  bgSurfaceAlt: '#101829',
  bgElevated: '#182338',
  border: '#1E293B',
  borderStrong: '#283548',
  textPrimary: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  textDim: '#64748B',
  orange: '#F97316',
  orangeText: '#FB923C',
  emerald: '#10B981',
  emeraldText: '#34D399',
  rose: '#F43F5E',
  roseText: '#FB7185',
  amberText: '#FBBF24',
  sky: '#0EA5E9',
  skyText: '#38BDF8',
} as const;

function resolveToneColor(tone: SnapshotCellTone = 'neutral'): string {
  switch (tone) {
    case 'accent':
      return PALETTE.orangeText;
    case 'positive':
      return PALETTE.emeraldText;
    case 'negative':
      return PALETTE.roseText;
    case 'warning':
      return PALETTE.amberText;
    case 'sky':
      return PALETTE.skyText;
    case 'muted':
      return PALETTE.textMuted;
    case 'neutral':
    default:
      return PALETTE.textPrimary;
  }
}

function resolveSideAccentHex(tone: 'orange' | 'emerald' | 'sky'): {
  solid: string;
  text: string;
} {
  if (tone === 'emerald') {
    return { solid: PALETTE.emerald, text: PALETTE.emeraldText };
  }
  if (tone === 'sky') {
    return { solid: PALETTE.sky, text: PALETTE.skyText };
  }
  return { solid: PALETTE.orange, text: PALETTE.orangeText };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function truncateCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  const clean = String(text ?? '');
  if (!clean || maxWidth <= 8) return '';
  if (ctx.measureText(clean).width <= maxWidth) return clean;
  const ellipsis = '…';
  let lo = 0;
  let hi = clean.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = clean.slice(0, mid) + ellipsis;
    if (ctx.measureText(candidate).width <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo > 0 ? clean.slice(0, lo) + ellipsis : ellipsis;
}

function drawTeamChip(
  ctx: CanvasRenderingContext2D,
  abbr: string,
  x: number,
  y: number,
  w = 42,
  h = 22
): void {
  const clean = (abbr || 'NBA').toUpperCase().trim().slice(0, 4);
  const pal = getTeamDarkUiPalette(clean);
  drawRoundedRect(ctx, x, y, w, h, 5);
  ctx.fillStyle = hexToRgba(pal.primary, 0.28);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = hexToRgba(pal.primary, 0.78);
  ctx.stroke();

  ctx.font = `700 11px ${FONT_MONO}`;
  ctx.fillStyle = '#F8FAFC';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(clean, x + w / 2, y + h / 2 + 0.5);
}

function formatExportTimestamp(): string {
  try {
    return new Date().toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function sanitizeExportFilename(raw: string): string {
  const base = (raw || 'radarnba-export')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\.png$/i, '')
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base || 'radarnba-export'}.png`;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('No se pudo generar la imagen PNG.'));
        }
      },
      'image/png',
      1
    );
  });
}

async function ensureFontsReady(): Promise<void> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((r) => setTimeout(r, 250)),
      ]);
    } catch {
      // Proceed with fallback system fonts if font readiness check fails
    }
  }
}

function drawCommonHeader(
  ctx: CanvasRenderingContext2D,
  width: number,
  padX: number,
  categoryTag: string,
  title: string,
  subtitle?: string
): number {
  // Top accent bar
  ctx.fillStyle = PALETTE.orange;
  ctx.fillRect(0, 0, width, 4);

  let y = 28;

  // Brand + Category Tag + Domain & Date
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `700 12px ${FONT_MONO}`;
  ctx.fillStyle = PALETTE.orangeText;
  const brandLabel = 'RADARNBA';
  ctx.fillText(brandLabel, padX, y);
  const brandW = ctx.measureText(brandLabel).width;

  ctx.font = `600 12px ${FONT_SANS}`;
  ctx.fillStyle = PALETTE.textMuted;
  ctx.fillText(`  ·  ${categoryTag.toUpperCase()}`, padX + brandW, y);

  const dateText = formatExportTimestamp();
  ctx.font = `500 12px ${FONT_MONO}`;
  ctx.fillStyle = PALETTE.textMuted;
  ctx.textAlign = 'right';
  ctx.fillText(`${RADARNBA_SIGNATURE_DOMAIN}  ·  ${dateText}`, width - padX, y);

  // Main Title
  y += 30;
  ctx.textAlign = 'left';
  ctx.font = `700 24px ${FONT_SANS}`;
  ctx.fillStyle = PALETTE.textPrimary;
  ctx.fillText(truncateCanvasText(ctx, title, width - padX * 2), padX, y);

  if (subtitle) {
    y += 22;
    ctx.font = `400 13px ${FONT_SANS}`;
    ctx.fillStyle = PALETTE.textMuted;
    ctx.fillText(truncateCanvasText(ctx, subtitle, width - padX * 2), padX, y);
  }

  return y + 20;
}

function drawKpiStrip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  kpis: SnapshotKpiItem[]
): number {
  const items = kpis.slice(0, 4);
  if (items.length === 0) return y;

  const h = 74;
  drawRoundedRect(ctx, x, y, w, h, 10);
  ctx.fillStyle = PALETTE.bgSurface;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = PALETTE.border;
  ctx.stroke();

  const cellW = w / items.length;
  items.forEach((item, idx) => {
    const cx = x + idx * cellW;
    if (idx > 0) {
      ctx.beginPath();
      ctx.moveTo(cx, y + 10);
      ctx.lineTo(cx, y + h - 10);
      ctx.strokeStyle = PALETTE.border;
      ctx.stroke();
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `500 11px ${FONT_SANS}`;
    ctx.fillStyle = PALETTE.textMuted;
    ctx.fillText(
      truncateCanvasText(ctx, item.label, cellW - 28),
      cx + 14,
      y + 22
    );

    ctx.font = `700 18px ${FONT_MONO}`;
    ctx.fillStyle = resolveToneColor(item.tone || 'neutral');
    ctx.fillText(
      truncateCanvasText(ctx, item.value, cellW - 28),
      cx + 14,
      y + 46
    );

    if (item.sublabel) {
      ctx.font = `400 11px ${FONT_SANS}`;
      ctx.fillStyle = PALETTE.textSecondary;
      ctx.fillText(
        truncateCanvasText(ctx, item.sublabel, cellW - 28),
        cx + 14,
        y + 63
      );
    }
  });

  return y + h + 16;
}

function cleanOneLineVerdict(raw?: string): string {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function synthesizeEditorialVerdictFromTable(
  config: TableSnapshotConfig
): string {
  const explicit = cleanOneLineVerdict(config.editorialVerdict);
  if (explicit) return explicit;

  const topRow = config.rows[0];
  const firstCol = config.columns[0];
  const secondCol = config.columns[1];

  if (topRow && firstCol) {
    const rawFirst = topRow.cells[firstCol.key];
    const firstVal =
      typeof rawFirst === 'string' ? rawFirst : rawFirst?.text || '';
    const rawSecond = secondCol ? topRow.cells[secondCol.key] : undefined;
    const secondVal =
      typeof rawSecond === 'string' ? rawSecond : rawSecond?.text || '';
    const teamTag = topRow.teamAbbr ? ` (${topRow.teamAbbr})` : '';
    const kpiSummary =
      config.kpis && config.kpis[0]
        ? ` · ${config.kpis[0].label}: ${config.kpis[0].value}`
        : '';
    const secondarySummary =
      secondCol && secondVal ? ` y ${secondCol.label}: ${secondVal}` : '';

    return `Liderato en ${config.title}: #1 ${topRow.entityName}${teamTag} marca la pauta con ${firstCol.label} ${firstVal}${secondarySummary}${kpiSummary}.`;
  }

  if (config.kpis && config.kpis.length > 0) {
    const leadKpis = config.kpis
      .slice(0, 3)
      .map((k) => `${k.label}: ${k.value}`)
      .join(' · ');
    return `Veredicto ${config.title}: ${leadKpis}.`;
  }

  return `${config.title} · Radiografía estadística oficial procesada por el motor analítico de RadarNBA.`;
}

export function synthesizeEditorialVerdictFromSvgChart(
  config: SvgChartSnapshotConfig
): string {
  const explicit = cleanOneLineVerdict(config.editorialVerdict);
  if (explicit) return explicit;

  if (config.footerBadges && config.footerBadges.length > 0) {
    const primaryBadge = config.footerBadges[0];
    const secondaryBadge = config.footerBadges[1];
    const kpiLead =
      config.kpis && config.kpis[0]
        ? ` (${config.kpis[0].label}: ${config.kpis[0].value})`
        : '';
    if (secondaryBadge) {
      return `${primaryBadge.title}: ${primaryBadge.text} · ${secondaryBadge.title}: ${secondaryBadge.text}${kpiLead}.`;
    }
    return `${primaryBadge.title}: ${primaryBadge.text}${kpiLead}.`;
  }

  if (config.kpis && config.kpis.length > 0) {
    const kpiSummary = config.kpis
      .slice(0, 3)
      .map((k) => `${k.label}: ${k.value}${k.sublabel ? ` (${k.sublabel})` : ''}`)
      .join(' · ');
    return `Lectura del gráfico (${config.title}): ${kpiSummary}.`;
  }

  if (config.fallbackTable) {
    return synthesizeEditorialVerdictFromTable(config.fallbackTable);
  }

  return `${config.title} · Distribución y posicionamiento estadístico verificados en RadarNBA.`;
}

export function synthesizeEditorialVerdictFromComparison(
  config: ComparisonSnapshotConfig
): string {
  const explicit = cleanOneLineVerdict(config.editorialVerdict);
  if (explicit) return explicit;

  const winsA = config.rows.filter((r) => r.winner === 'A').length;
  const winsB = config.rows.filter((r) => r.winner === 'B').length;
  const totalCompared = config.rows.length;

  if (config.verdictPrimary) {
    const secondary = config.verdictSecondary
      ? ` · ${config.verdictSecondary}`
      : '';
    const catBalance =
      totalCompared > 0
        ? ` (Balance de apartados: ${config.colALabel} ${winsA}–${winsB} ${config.colBLabel})`
        : '';
    return `${config.verdictLabel ? `${config.verdictLabel}: ` : ''}${config.verdictPrimary}${secondary}${catBalance}.`;
  }

  if (totalCompared > 0) {
    const leaderName =
      winsA > winsB
        ? config.sideA.headlineTitle
        : winsB > winsA
        ? config.sideB.headlineTitle
        : 'Equilibrio técnico';
    return `${leaderName} domina la comparativa (${config.colALabel} ${winsA}–${winsB} ${config.colBLabel} en ${totalCompared} métricas evaluadas).`;
  }

  return `${config.sideA.headlineTitle} vs ${config.sideB.headlineTitle} · Comparativa directa verificada en RadarNBA.`;
}

interface DrawFooterConfig {
  footerNote?: string;
  includeEditorialVerdict: boolean;
  editorialVerdictText?: string;
  editorialVerdictLabel?: string;
  editorialVerdictTone?: SnapshotCellTone;
}

function resolveEditorialFooterHeight(includeEditorialVerdict: boolean): number {
  return includeEditorialVerdict ? 74 : 44;
}

function drawCommonFooter(
  ctx: CanvasRenderingContext2D,
  width: number,
  y: number,
  padX: number,
  footerConfig: DrawFooterConfig
): void {
  const innerW = width - padX * 2;
  const noteText =
    footerConfig.footerNote ||
    'RadarNBA · Analítica avanzada, rachas y scouting NBA';

  if (!footerConfig.includeEditorialVerdict) {
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(width - padX, y);
    ctx.lineWidth = 1;
    ctx.strokeStyle = PALETTE.border;
    ctx.stroke();

    const textY = y + 22;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = `500 11px ${FONT_SANS}`;
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(truncateCanvasText(ctx, noteText, innerW - 220), padX, textY);

    ctx.textAlign = 'right';
    ctx.font = `700 11.5px ${FONT_MONO}`;
    ctx.fillStyle = PALETTE.orangeText;
    ctx.fillText(RADARNBA_SIGNATURE_DOMAIN, width - padX, textY);
    return;
  }

  // Editorial Verdict Card Block (Pie Editorial Integrado)
  const cardH = 62;
  const cardY = y + 2;
  const accentColor = resolveToneColor(
    footerConfig.editorialVerdictTone || 'accent'
  );

  drawRoundedRect(ctx, padX, cardY, innerW, cardH, 10);
  ctx.fillStyle = '#0E1729';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = PALETTE.borderStrong;
  ctx.stroke();

  // Left vertical editorial accent bar inside rounded card
  ctx.save();
  drawRoundedRect(ctx, padX, cardY, innerW, cardH, 10);
  ctx.clip();
  ctx.fillStyle = accentColor;
  ctx.fillRect(padX, cardY, 4, cardH);
  ctx.restore();

  // Top meta row: VEREDICTO EDITORIAL tag + context note on left, radar-nba.vercel.app pill on right
  const labelText = (
    footerConfig.editorialVerdictLabel || 'VEREDICTO EDITORIAL · INSIGHT'
  ).toUpperCase();

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `700 10.5px ${FONT_MONO}`;
  ctx.fillStyle = accentColor;
  ctx.fillText(labelText, padX + 16, cardY + 21);
  const labelW = ctx.measureText(labelText).width;

  // Signature pill on top-right
  const domainLabel = RADARNBA_SIGNATURE_DOMAIN;
  ctx.font = `700 11px ${FONT_MONO}`;
  const domainTextW = ctx.measureText(domainLabel).width;
  const pillW = domainTextW + 20;
  const pillH = 20;
  const pillX = width - padX - pillW - 12;
  const pillY = cardY + 7;

  drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 5);
  ctx.fillStyle = '#131F36';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = hexToRgba(PALETTE.orange, 0.45);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.orangeText;
  ctx.fillText(domainLabel, pillX + pillW / 2, pillY + pillH / 2 + 0.5);

  // Context note next to VEREDICTO EDITORIAL tag
  const maxNoteW = pillX - (padX + 16 + labelW + 18);
  if (maxNoteW > 80) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `500 10.5px ${FONT_SANS}`;
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(
      truncateCanvasText(ctx, `·  ${noteText}`, maxNoteW),
      padX + 16 + labelW + 8,
      cardY + 21
    );
  }

  // Main 1-Line Editorial Verdict / Headline
  const verdictLine =
    cleanOneLineVerdict(footerConfig.editorialVerdictText) ||
    'Radiografía estadística oficial procesada por el motor analítico de RadarNBA.';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 13.5px ${FONT_SANS}`;
  ctx.fillStyle = PALETTE.textPrimary;
  ctx.fillText(
    truncateCanvasText(ctx, verdictLine, innerW - 32),
    padX + 16,
    cardY + 46
  );
}

export async function buildTableSnapshotBlob(
  config: TableSnapshotConfig
): Promise<{ blob: Blob; filename: string }> {
  await ensureFontsReady();

  const includeEditorialVerdict =
    config.includeEditorialVerdict ?? getExportEditorialVerdictEnabled();
  const resolvedVerdict = synthesizeEditorialVerdictFromTable(config);

  const W = 1200;
  const PAD_X = 32;
  const innerW = W - PAD_X * 2;
  const rows = config.rows.slice(0, 15);
  const hasKpis = Boolean(config.kpis && config.kpis.length > 0);
  const headerBlockH = (config.subtitle ? 100 : 78) + (hasKpis ? 90 : 0);
  const tableHeaderH = 40;
  const rowH = 48;
  const tableH = tableHeaderH + Math.max(1, rows.length) * rowH;
  const footerH = resolveEditorialFooterHeight(includeEditorialVerdict);
  const H = headerBlockH + tableH + footerH + 20;

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Contexto 2D no disponible en este navegador.');
  }
  ctx.scale(scale, scale);

  // Canvas Background + Outer Frame
  ctx.fillStyle = PALETTE.bgCanvas;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  let cursorY = drawCommonHeader(
    ctx,
    W,
    PAD_X,
    config.categoryTag || 'Ranking Filtrado',
    config.title,
    config.subtitle
  );

  if (config.kpis && config.kpis.length > 0) {
    cursorY = drawKpiStrip(ctx, PAD_X, cursorY, innerW, config.kpis);
  }

  // Table Container
  const tableTop = cursorY;
  drawRoundedRect(ctx, PAD_X, tableTop, innerW, tableH, 10);
  ctx.fillStyle = PALETTE.bgSurface;
  ctx.fill();

  // Compute Column Positions
  const showRank = config.showRank !== false;
  const rankW = showRank ? 46 : 0;
  const entityWeight = config.entityColumnWeight ?? 2.35;
  const colWeights = config.columns.map((c) => c.widthWeight ?? 1);
  const totalWeight =
    entityWeight + colWeights.reduce((acc, v) => acc + v, 0);
  const usableW = innerW - rankW - 28; // 14px left/right padding
  const entityW = (entityWeight / totalWeight) * usableW;
  const colWidths = colWeights.map((w) => (w / totalWeight) * usableW);

  // Table Header Background
  ctx.save();
  drawRoundedRect(ctx, PAD_X, tableTop, innerW, tableH, 10);
  ctx.clip();

  ctx.fillStyle = PALETTE.bgHeader;
  ctx.fillRect(PAD_X, tableTop, innerW, tableHeaderH);

  ctx.beginPath();
  ctx.moveTo(PAD_X, tableTop + tableHeaderH);
  ctx.lineTo(PAD_X + innerW, tableTop + tableHeaderH);
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = `600 11.5px ${FONT_SANS}`;
  ctx.fillStyle = PALETTE.textMuted;
  ctx.textBaseline = 'middle';

  let colX = PAD_X + 14;
  if (showRank) {
    ctx.textAlign = 'left';
    ctx.fillText('#', colX + 4, tableTop + tableHeaderH / 2);
    colX += rankW;
  }

  ctx.textAlign = 'left';
  ctx.fillText(
    truncateCanvasText(ctx, config.entityColumnLabel || 'Jugador / Equipo', entityW - 12),
    colX,
    tableTop + tableHeaderH / 2
  );
  colX += entityW;

  config.columns.forEach((col, i) => {
    const cw = colWidths[i];
    const align = col.align || 'right';
    ctx.textAlign = align;
    const tx = align === 'right' ? colX + cw - 6 : colX + 6;
    ctx.fillText(
      truncateCanvasText(ctx, col.label, cw - 12),
      tx,
      tableTop + tableHeaderH / 2
    );
    colX += cw;
  });

  if (rows.length === 0) {
    ctx.font = `500 13px ${FONT_SANS}`;
    ctx.fillStyle = PALETTE.textMuted;
    ctx.textAlign = 'center';
    ctx.fillText(
      'Sin registros con la combinación de filtros actual.',
      PAD_X + innerW / 2,
      tableTop + tableHeaderH + rowH / 2
    );
  } else {
    rows.forEach((row, rIdx) => {
      const ry = tableTop + tableHeaderH + rIdx * rowH;
      ctx.fillStyle = rIdx % 2 === 1 ? PALETTE.bgSurfaceAlt : PALETTE.bgSurface;
      ctx.fillRect(PAD_X, ry, innerW, rowH);

      if (rIdx > 0) {
        ctx.beginPath();
        ctx.moveTo(PAD_X, ry);
        ctx.lineTo(PAD_X + innerW, ry);
        ctx.strokeStyle = hexToRgba(PALETTE.border, 0.85);
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      let rx = PAD_X + 14;
      if (showRank) {
        const rankLabel = String(row.rank ?? rIdx + 1);
        ctx.font = `600 12px ${FONT_MONO}`;
        ctx.fillStyle = rIdx < 3 ? PALETTE.orangeText : PALETTE.textMuted;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(rankLabel, rx + 4, ry + rowH / 2);
        rx += rankW;
      }

      // Team Chip + Entity Name + Subtext
      let nameOffset = rx;
      if (row.teamAbbr) {
        drawTeamChip(ctx, row.teamAbbr, rx, ry + (rowH - 22) / 2, 42, 22);
        nameOffset += 50;
      }

      const maxEntityTextW = entityW - (nameOffset - rx) - 12;
      ctx.textAlign = 'left';
      if (row.entitySubtext) {
        ctx.font = `600 13.5px ${FONT_SANS}`;
        ctx.fillStyle = PALETTE.textPrimary;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(
          truncateCanvasText(ctx, row.entityName, maxEntityTextW),
          nameOffset,
          ry + 21
        );

        ctx.font = `400 11px ${FONT_SANS}`;
        ctx.fillStyle = PALETTE.textMuted;
        ctx.fillText(
          truncateCanvasText(ctx, row.entitySubtext, maxEntityTextW),
          nameOffset,
          ry + 37
        );
      } else {
        ctx.font = `600 13.5px ${FONT_SANS}`;
        ctx.fillStyle = PALETTE.textPrimary;
        ctx.textBaseline = 'middle';
        ctx.fillText(
          truncateCanvasText(ctx, row.entityName, maxEntityTextW),
          nameOffset,
          ry + rowH / 2
        );
      }
      rx += entityW;

      // Metric Cells
      config.columns.forEach((col, cIdx) => {
        const cw = colWidths[cIdx];
        const align = col.align || 'right';
        const rawCell = row.cells[col.key];
        const cellObj: TableSnapshotCell =
          typeof rawCell === 'string' || rawCell === undefined
            ? { text: rawCell ?? '—', tone: 'neutral' }
            : rawCell;

        const tx = align === 'right' ? rx + cw - 6 : rx + 6;
        ctx.textAlign = align;
        const isLeftText = align === 'left';

        if (cellObj.subtext) {
          ctx.textBaseline = 'alphabetic';
          ctx.font = isLeftText
            ? `600 12.5px ${FONT_SANS}`
            : `600 13px ${FONT_MONO}`;
          ctx.fillStyle = resolveToneColor(cellObj.tone);
          ctx.fillText(
            truncateCanvasText(ctx, cellObj.text, cw - 12),
            tx,
            ry + 21
          );

          ctx.font = isLeftText
            ? `400 11px ${FONT_SANS}`
            : `400 10.5px ${FONT_MONO}`;
          ctx.fillStyle = PALETTE.textMuted;
          ctx.fillText(
            truncateCanvasText(ctx, cellObj.subtext, cw - 12),
            tx,
            ry + 37
          );
        } else {
          ctx.textBaseline = 'middle';
          ctx.font = isLeftText
            ? `500 12.5px ${FONT_SANS}`
            : `600 13px ${FONT_MONO}`;
          ctx.fillStyle = resolveToneColor(cellObj.tone);
          ctx.fillText(
            truncateCanvasText(ctx, cellObj.text, cw - 12),
            tx,
            ry + rowH / 2
          );
        }

        rx += cw;
      });
    });
  }

  ctx.restore();

  // Table Border
  drawRoundedRect(ctx, PAD_X, tableTop, innerW, tableH, 10);
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  drawCommonFooter(ctx, W, tableTop + tableH + 16, PAD_X, {
    footerNote: config.footerNote,
    includeEditorialVerdict,
    editorialVerdictText: resolvedVerdict,
    editorialVerdictLabel: config.editorialVerdictLabel,
    editorialVerdictTone: config.editorialVerdictTone,
  });

  const blob = await canvasToPngBlob(canvas);
  return {
    blob,
    filename: sanitizeExportFilename(config.filename),
  };
}

const INLINE_LOGO_DATA_CACHE = new Map<string, Promise<string>>();

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader !== 'undefined') {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('No se pudo convertir el logo a Data URL'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    } else {
      blob
        .arrayBuffer()
        .then((ab) => {
          const b64 = Buffer.from(ab).toString('base64');
          resolve(`data:${blob.type || 'image/png'};base64,${b64}`);
        })
        .catch(reject);
    }
  });
}

function generateSvgTeamBadgeDataUri(abbr: string): string {
  const clean = (abbr || 'NBA').toUpperCase().trim().slice(0, 4);
  const pal = getTeamDarkUiPalette(clean);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96"><circle cx="48" cy="48" r="46" fill="#0B1120" stroke="${pal.primary}" stroke-width="4"/><circle cx="48" cy="48" r="38" fill="${hexToRgba(pal.primary, 0.35)}" stroke="${pal.secondary || '#FFFFFF'}" stroke-width="2"/><text x="48" y="55" font-family="'JetBrains Mono', monospace" font-size="22" font-weight="800" fill="#F8FAFC" text-anchor="middle">${clean}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function extractAbbrFromImageElement(imgEl: SVGImageElement): string {
  const dataAbbr = (imgEl.getAttribute('data-team-abbr') || '').toUpperCase().trim();
  if (dataAbbr && NBA_TEAMS_MAP[dataAbbr]) return dataAbbr;

  const href = imgEl.getAttribute('href') || imgEl.getAttribute('xlink:href') || '';
  if (href) {
    const espnMatch = href.match(/\/teamlogos\/nba\/\d+\/([a-z0-9_-]+)\.png/i);
    if (espnMatch) {
      const slug = espnMatch[1].toLowerCase();
      const matched = Object.values(NBA_TEAMS_MAP).find(
        (m) => m.espnSlug.toLowerCase() === slug || m.abbr.toLowerCase() === slug
      );
      if (matched) return matched.abbr;
    }

    const nbaIdMatch = href.match(/\/logos\/nba\/(\d+)\//i);
    if (nbaIdMatch) {
      const matched = Object.values(NBA_TEAMS_MAP).find(
        (m) => String(m.nbaId) === nbaIdMatch[1]
      );
      if (matched) return matched.abbr;
    }
  }

  return dataAbbr || 'NBA';
}

export function getTeamLogoDataUri(abbr: string): Promise<string> {
  const cleanAbbr = (abbr || 'NBA').toUpperCase().trim();
  const cached = INLINE_LOGO_DATA_CACHE.get(cleanAbbr);
  if (cached) return cached;

  const task = (async (): Promise<string> => {
    // Tier 1: Same-origin backend proxy (/api/nba/team-logo/:abbr)
    try {
      const res = await fetch(`/api/nba/team-logo/${cleanAbbr}`);
      if (res.ok) {
        const blob = await res.blob();
        if (blob && blob.size > 200) {
          const dataUri = await blobToDataUrl(blob);
          if (dataUri) return dataUri;
        }
      }
    } catch {
      // Fallback to next tier
    }

    // Tier 2: Direct ESPN CDN fetch with CORS
    const meta = NBA_TEAMS_MAP[cleanAbbr];
    const slug = meta?.espnSlug || cleanAbbr.toLowerCase();
    const espnUrl = `https://a.espncdn.com/i/teamlogos/nba/500/${slug}.png`;
    try {
      const res = await fetch(espnUrl, { mode: 'cors' });
      if (res.ok) {
        const blob = await res.blob();
        if (blob && blob.size > 200) {
          const dataUri = await blobToDataUrl(blob);
          if (dataUri) return dataUri;
        }
      }
    } catch {
      // Fallback to next tier
    }

    // Tier 3: Offscreen HTML Image element drawing with CORS query
    try {
      const imageResult = await new Promise<string | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const c = document.createElement('canvas');
            c.width = 96;
            c.height = 96;
            const cctx = c.getContext('2d');
            if (!cctx) return resolve(null);
            cctx.drawImage(img, 0, 0, 96, 96);
            resolve(c.toDataURL('image/png'));
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = `${espnUrl}?cors=1`;
      });
      if (imageResult) return imageResult;
    } catch {
      // Fallback to next tier
    }

    // Tier 4: Vector SVG badge with official franchise palette
    return generateSvgTeamBadgeDataUri(cleanAbbr);
  })();

  INLINE_LOGO_DATA_CACHE.set(cleanAbbr, task);
  return task;
}

export function preloadAllTeamLogoDataUris(): void {
  if (typeof window === 'undefined') return;
  const teamAbbrs = Object.keys(NBA_TEAMS_MAP);
  teamAbbrs.forEach((abbr) => {
    void getTeamLogoDataUri(abbr);
  });
}

async function inlineSvgExternalImages(
  svgClone: SVGSVGElement
): Promise<void> {
  const imageEls = Array.from(svgClone.querySelectorAll('image'));
  if (imageEls.length === 0) return;

  await Promise.all(
    imageEls.map(async (imgEl) => {
      const abbr = extractAbbrFromImageElement(imgEl);
      const dataUri = await getTeamLogoDataUri(abbr);
      imgEl.setAttribute('href', dataUri);
      imgEl.setAttribute('xlink:href', dataUri);
    })
  );
}

export async function buildSvgChartSnapshotBlob(
  config: SvgChartSnapshotConfig
): Promise<{ blob: Blob; filename: string }> {
  await ensureFontsReady();

  const container =
    typeof document !== 'undefined'
      ? document.getElementById(config.containerId)
      : null;
  const svgEl = container?.querySelector('svg') as SVGSVGElement | null;

  if (!svgEl) {
    if (config.fallbackTable) {
      return buildTableSnapshotBlob(config.fallbackTable);
    }
    throw new Error('No se encontró el gráfico activo para exportar.');
  }

  const rect = svgEl.getBoundingClientRect();
  const vbAttr = svgEl.getAttribute('viewBox');
  let vbW = 0;
  let vbH = 0;
  if (vbAttr) {
    const parts = vbAttr
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      vbW = parts[2];
      vbH = parts[3];
    }
  }

  const attrW = parseFloat(svgEl.getAttribute('width') || '0');
  const attrH = parseFloat(svgEl.getAttribute('height') || '0');
  const srcW = vbW || (rect.width > 10 ? rect.width : attrW > 10 ? attrW : 960);
  const srcH = vbH || (rect.height > 10 ? rect.height : attrH > 10 ? attrH : 460);

  const W = 1200;
  const PAD_X = 32;
  const innerW = W - PAD_X * 2;
  const chartInnerPad = 14;
  const chartTargetW = innerW - chartInnerPad * 2;
  const aspect = srcW / Math.max(1, srcH);
  const chartTargetH = Math.round(
    Math.max(360, Math.min(640, chartTargetW / Math.max(0.6, aspect)))
  );
  const chartCardH = chartTargetH + chartInnerPad * 2;

  const includeEditorialVerdict =
    config.includeEditorialVerdict ?? getExportEditorialVerdictEnabled();
  const resolvedVerdict = synthesizeEditorialVerdictFromSvgChart(config);

  const hasKpis = Boolean(config.kpis && config.kpis.length > 0);
  const badges = (config.footerBadges || []).slice(0, 4);
  const badgesH = badges.length > 0 ? 64 : 0;
  const headerBlockH = (config.subtitle ? 100 : 78) + (hasKpis ? 90 : 0);
  const footerH = resolveEditorialFooterHeight(includeEditorialVerdict);
  const H =
    headerBlockH +
    chartCardH +
    (badgesH > 0 ? badgesH + 14 : 0) +
    footerH +
    20;

  // Clone and sanitize SVG so it renders faithfully offscreen without external network dependencies
  const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
  svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svgClone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  if (!vbAttr) {
    svgClone.setAttribute('viewBox', `0 0 ${Math.round(srcW)} ${Math.round(srcH)}`);
  }
  svgClone.setAttribute('width', String(chartTargetW));
  svgClone.setAttribute('height', String(chartTargetH));
  svgClone.style.width = `${chartTargetW}px`;
  svgClone.style.height = `${chartTargetH}px`;
  svgClone.style.maxHeight = 'none';
  svgClone.style.overflow = 'visible';

  // Inject font CSS rules so Tailwind classNames (.font-mono / .font-sans) render properly in standalone SVG
  const styleNode = svgClone.ownerDocument.createElementNS(
    'http://www.w3.org/2000/svg',
    'style'
  );
  styleNode.textContent = `
    text { font-family: ${FONT_SANS}; }
    .font-sans { font-family: ${FONT_SANS}; }
    .font-mono { font-family: ${FONT_MONO}; }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }
  `;
  svgClone.insertBefore(styleNode, svgClone.firstChild);

  // Inject discrete SVG watermark signature inside the SVG graphic layer itself
  if (includeEditorialVerdict) {
    try {
      const watermarkText = svgClone.ownerDocument.createElementNS(
        'http://www.w3.org/2000/svg',
        'text'
      );
      watermarkText.setAttribute('x', String(Math.round(srcW - 10)));
      watermarkText.setAttribute('y', String(Math.round(srcH - 6)));
      watermarkText.setAttribute('text-anchor', 'end');
      watermarkText.setAttribute('fill', '#64748B');
      watermarkText.setAttribute('fill-opacity', '0.65');
      watermarkText.setAttribute('font-size', '10');
      watermarkText.setAttribute('font-weight', '600');
      watermarkText.setAttribute('class', 'font-mono');
      watermarkText.textContent = RADARNBA_SIGNATURE_DOMAIN;
      svgClone.appendChild(watermarkText);
    } catch {
      // Ignore if SVG DOM mutation fails
    }
  }

  await inlineSvgExternalImages(svgClone);

  const svgXml = new XMLSerializer().serializeToString(svgClone);
  const svgBlob = new Blob([svgXml], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  let renderedChartImg: HTMLImageElement;
  try {
    renderedChartImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error('Error al rasterizar el gráfico SVG.'));
      img.src = svgUrl;
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Contexto 2D no disponible en este navegador.');
  }
  ctx.scale(scale, scale);

  ctx.fillStyle = PALETTE.bgCanvas;
  ctx.fillRect(0, 0, W, H);

  let cursorY = drawCommonHeader(
    ctx,
    W,
    PAD_X,
    config.categoryTag || 'EXPLORADOR ANALÍTICO',
    config.title,
    config.subtitle
  );

  if (config.kpis && config.kpis.length > 0) {
    cursorY = drawKpiStrip(ctx, PAD_X, cursorY, innerW, config.kpis);
  }

  // Chart Surface Card
  drawRoundedRect(ctx, PAD_X, cursorY, innerW, chartCardH, 10);
  ctx.fillStyle = '#0E1626';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = PALETTE.border;
  ctx.stroke();

  ctx.drawImage(
    renderedChartImg,
    PAD_X + chartInnerPad,
    cursorY + chartInnerPad,
    chartTargetW,
    chartTargetH
  );

  cursorY += chartCardH;

  // Optional 4-badge quadrant / sigma summary strip
  if (badges.length > 0) {
    cursorY += 14;
    const gap = 10;
    const bw = (innerW - gap * (badges.length - 1)) / badges.length;
    badges.forEach((b, idx) => {
      const bx = PAD_X + idx * (bw + gap);
      drawRoundedRect(ctx, bx, cursorY, bw, badgesH, 8);
      ctx.fillStyle = PALETTE.bgSurface;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = PALETTE.border;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `700 10.5px ${FONT_SANS}`;
      ctx.fillStyle = resolveToneColor(b.tone || 'accent');
      ctx.fillText(
        truncateCanvasText(ctx, b.title.toUpperCase(), bw - 20),
        bx + 10,
        cursorY + 21
      );

      ctx.font = `500 11.5px ${FONT_SANS}`;
      ctx.fillStyle = PALETTE.textSecondary;
      ctx.fillText(
        truncateCanvasText(ctx, b.text, bw - 20),
        bx + 10,
        cursorY + 43
      );
    });
    cursorY += badgesH;
  }

  drawCommonFooter(ctx, W, cursorY + 16, PAD_X, {
    footerNote: config.footerNote || 'RadarNBA · Explorador Analítico Avanzado',
    includeEditorialVerdict,
    editorialVerdictText: resolvedVerdict,
    editorialVerdictLabel: config.editorialVerdictLabel,
    editorialVerdictTone: config.editorialVerdictTone,
  });

  const blob = await canvasToPngBlob(canvas);
  return {
    blob,
    filename: sanitizeExportFilename(config.filename),
  };
}

function drawComparisonSideCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  box: ComparisonSideBox
): void {
  const accent = resolveSideAccentHex(box.accentTone);
  drawRoundedRect(ctx, x, y, w, h, 10);
  ctx.fillStyle = PALETTE.bgSurface;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = hexToRgba(accent.solid, 0.45);
  ctx.stroke();

  // Top corner accent strip inside card
  ctx.save();
  drawRoundedRect(ctx, x, y, w, h, 10);
  ctx.clip();
  ctx.fillStyle = hexToRgba(accent.solid, 0.12);
  ctx.fillRect(x, y, w, 34);
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `700 11.5px ${FONT_SANS}`;
  ctx.fillStyle = accent.text;
  ctx.fillText(
    truncateCanvasText(ctx, box.headerLabel.toUpperCase(), w - 28),
    x + 16,
    y + 17
  );

  // Headline Row
  let cy = y + 54;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 19px ${FONT_SANS}`;
  ctx.fillStyle = PALETTE.textPrimary;
  const valueSpace = box.headlineValue ? 130 : 0;
  ctx.fillText(
    truncateCanvasText(ctx, box.headlineTitle, w - 32 - valueSpace),
    x + 16,
    cy
  );

  if (box.headlineValue) {
    ctx.textAlign = 'right';
    ctx.font = `700 20px ${FONT_MONO}`;
    ctx.fillStyle = accent.text;
    ctx.fillText(box.headlineValue, x + w - 16, cy);
  }

  if (box.headlineSubtext) {
    cy += 19;
    ctx.textAlign = 'left';
    ctx.font = `400 12px ${FONT_SANS}`;
    ctx.fillStyle = PALETTE.textMuted;
    ctx.fillText(
      truncateCanvasText(ctx, box.headlineSubtext, w - 32),
      x + 16,
      cy
    );
  }

  cy += 14;

  // Items List (e.g., Trade Players Sent / Received)
  const items = (box.items || []).slice(0, 5);
  items.forEach((it) => {
    const itemH = 40;
    drawRoundedRect(ctx, x + 14, cy, w - 28, itemH, 7);
    ctx.fillStyle = PALETTE.bgCanvas;
    ctx.fill();
    ctx.strokeStyle = PALETTE.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    let ix = x + 22;
    if (it.teamAbbr) {
      drawTeamChip(ctx, it.teamAbbr, ix, cy + 9, 40, 22);
      ix += 48;
    }

    const rightBadgeW = it.badgeText ? 110 : 0;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `600 13px ${FONT_SANS}`;
    ctx.fillStyle = PALETTE.textPrimary;
    ctx.fillText(
      truncateCanvasText(ctx, it.name, w - (ix - x) - 24 - rightBadgeW),
      ix,
      cy + 17
    );

    ctx.font = `400 11px ${FONT_MONO}`;
    ctx.fillStyle = PALETTE.textMuted;
    ctx.fillText(
      truncateCanvasText(ctx, it.detail, w - (ix - x) - 24 - rightBadgeW),
      ix,
      cy + 32
    );

    if (it.badgeText) {
      ctx.textAlign = 'right';
      ctx.font = `600 12px ${FONT_MONO}`;
      ctx.fillStyle = resolveToneColor(it.badgeTone || 'accent');
      ctx.fillText(it.badgeText, x + w - 24, cy + 24);
    }

    cy += itemH + 6;
  });

  if (box.calloutText) {
    const calloutY = y + h - 34;
    drawRoundedRect(ctx, x + 14, calloutY, w - 28, 24, 5);
    ctx.fillStyle = hexToRgba(PALETTE.bgElevated, 0.9);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `500 11px ${FONT_SANS}`;
    ctx.fillStyle = resolveToneColor(box.calloutTone || 'muted');
    ctx.fillText(
      truncateCanvasText(ctx, box.calloutText, w - 44),
      x + 22,
      calloutY + 12.5
    );
  }
}

export async function buildComparisonSnapshotBlob(
  config: ComparisonSnapshotConfig
): Promise<{ blob: Blob; filename: string }> {
  await ensureFontsReady();

  const W = 1200;
  const PAD_X = 32;
  const innerW = W - PAD_X * 2;
  const rows = config.rows.slice(0, 14);

  const maxItemsCount = Math.max(
    config.sideA.items?.length ?? 0,
    config.sideB.items?.length ?? 0
  );
  const clampedItems = Math.min(5, maxItemsCount);
  const hasCallout = Boolean(
    config.sideA.calloutText || config.sideB.calloutText
  );
  const sideCardH =
    (config.sideA.headlineSubtext || config.sideB.headlineSubtext ? 96 : 78) +
    clampedItems * 46 +
    (hasCallout ? 36 : 8);

  const includeEditorialVerdict =
    config.includeEditorialVerdict ?? getExportEditorialVerdictEnabled();
  const resolvedVerdict = synthesizeEditorialVerdictFromComparison(config);

  const hasVerdict = Boolean(config.verdictPrimary || config.verdictSecondary);
  const verdictH = hasVerdict ? 50 : 0;
  const tableHeaderH = 40;
  const rowH = 44;
  const tableH = tableHeaderH + Math.max(1, rows.length) * rowH;
  const headerBlockH = config.subtitle ? 100 : 78;
  const footerH = resolveEditorialFooterHeight(includeEditorialVerdict);

  const H =
    headerBlockH +
    sideCardH +
    16 +
    (hasVerdict ? verdictH + 16 : 0) +
    tableH +
    footerH +
    20;

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Contexto 2D no disponible en este navegador.');
  }
  ctx.scale(scale, scale);

  // Canvas Background + Border
  ctx.fillStyle = PALETTE.bgCanvas;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  let cursorY = drawCommonHeader(
    ctx,
    W,
    PAD_X,
    config.categoryTag || 'Tarjeta Comparativa',
    config.title,
    config.subtitle
  );

  // Side-by-Side Fighter / Trade Boxes
  const gap = 18;
  const halfW = (innerW - gap) / 2;
  drawComparisonSideCard(ctx, PAD_X, cursorY, halfW, sideCardH, config.sideA);
  drawComparisonSideCard(
    ctx,
    PAD_X + halfW + gap,
    cursorY,
    halfW,
    sideCardH,
    config.sideB
  );
  cursorY += sideCardH + 16;

  // Verdict Banner
  if (hasVerdict) {
    drawRoundedRect(ctx, PAD_X, cursorY, innerW, verdictH, 9);
    ctx.fillStyle = PALETTE.bgHeader;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = PALETTE.borderStrong;
    ctx.stroke();

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    let vx = PAD_X + 16;

    if (config.verdictLabel) {
      ctx.font = `600 12px ${FONT_SANS}`;
      ctx.fillStyle = PALETTE.textSecondary;
      ctx.fillText(config.verdictLabel, vx, cursorY + verdictH / 2);
      vx += ctx.measureText(config.verdictLabel).width + 16;
    }

    if (config.verdictPrimary) {
      ctx.font = `700 14px ${FONT_MONO}`;
      ctx.fillStyle = resolveToneColor(config.verdictPrimaryTone || 'accent');
      ctx.fillText(config.verdictPrimary, vx, cursorY + verdictH / 2);
      vx += ctx.measureText(config.verdictPrimary).width + 22;
    }

    if (config.verdictSecondary) {
      ctx.font = `600 13px ${FONT_MONO}`;
      ctx.fillStyle = resolveToneColor(config.verdictSecondaryTone || 'neutral');
      ctx.fillText(config.verdictSecondary, vx, cursorY + verdictH / 2);
    }

    cursorY += verdictH + 16;
  }

  // Breakdown Table
  const tableTop = cursorY;
  const accentA = resolveSideAccentHex(config.sideA.accentTone);
  const accentB = resolveSideAccentHex(config.sideB.accentTone);

  ctx.save();
  drawRoundedRect(ctx, PAD_X, tableTop, innerW, tableH, 10);
  ctx.fillStyle = PALETTE.bgSurface;
  ctx.fill();
  ctx.clip();

  ctx.fillStyle = PALETTE.bgHeader;
  ctx.fillRect(PAD_X, tableTop, innerW, tableHeaderH);
  ctx.beginPath();
  ctx.moveTo(PAD_X, tableTop + tableHeaderH);
  ctx.lineTo(PAD_X + innerW, tableTop + tableHeaderH);
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  const labelColW = innerW * 0.42;
  const barColW = innerW * 0.16;
  const valColW = innerW * 0.14;
  const deltaColW = innerW * 0.14;

  ctx.textBaseline = 'middle';
  ctx.font = `600 11.5px ${FONT_SANS}`;
  ctx.fillStyle = PALETTE.textMuted;
  ctx.textAlign = 'left';
  ctx.fillText(
    config.breakdownTitle || 'Comparativa por apartado',
    PAD_X + 16,
    tableTop + tableHeaderH / 2
  );

  ctx.textAlign = 'center';
  ctx.fillText(
    'Dominio',
    PAD_X + labelColW + barColW / 2,
    tableTop + tableHeaderH / 2
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = accentA.text;
  ctx.fillText(
    truncateCanvasText(ctx, config.colALabel, valColW - 12),
    PAD_X + labelColW + barColW + valColW - 8,
    tableTop + tableHeaderH / 2
  );

  ctx.fillStyle = accentB.text;
  ctx.fillText(
    truncateCanvasText(ctx, config.colBLabel, valColW - 12),
    PAD_X + labelColW + barColW + valColW * 2 - 8,
    tableTop + tableHeaderH / 2
  );

  ctx.fillStyle = PALETTE.textMuted;
  ctx.fillText(
    truncateCanvasText(ctx, config.colDeltaLabel || 'Diferencia', deltaColW - 16),
    PAD_X + innerW - 16,
    tableTop + tableHeaderH / 2
  );

  rows.forEach((r, idx) => {
    const ry = tableTop + tableHeaderH + idx * rowH;
    ctx.fillStyle = idx % 2 === 1 ? PALETTE.bgSurfaceAlt : PALETTE.bgSurface;
    ctx.fillRect(PAD_X, ry, innerW, rowH);

    if (idx > 0) {
      ctx.beginPath();
      ctx.moveTo(PAD_X, ry);
      ctx.lineTo(PAD_X + innerW, ry);
      ctx.strokeStyle = hexToRgba(PALETTE.border, 0.85);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const midY = ry + rowH / 2;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `500 13px ${FONT_SANS}`;
    ctx.fillStyle = PALETTE.textPrimary;
    ctx.fillText(
      truncateCanvasText(ctx, r.label, labelColW - 28),
      PAD_X + 16,
      midY
    );

    // Visual Tug-of-War Split Bar
    const barX = PAD_X + labelColW + 12;
    const barW = barColW - 24;
    const barH = 7;
    const barY = midY - barH / 2;
    const shareA = Math.max(8, Math.min(92, r.shareA ?? 50));
    const splitW = (shareA / 100) * barW;

    drawRoundedRect(ctx, barX, barY, barW, barH, 3.5);
    ctx.fillStyle = PALETTE.bgCanvas;
    ctx.fill();

    ctx.save();
    drawRoundedRect(ctx, barX, barY, barW, barH, 3.5);
    ctx.clip();
    ctx.fillStyle =
      r.winner === 'B' ? hexToRgba(accentA.solid, 0.38) : accentA.solid;
    ctx.fillRect(barX, barY, splitW - 1, barH);
    ctx.fillStyle =
      r.winner === 'A' ? hexToRgba(accentB.solid, 0.38) : accentB.solid;
    ctx.fillRect(barX + splitW + 1, barY, barW - splitW, barH);
    ctx.restore();

    // Side A Value
    ctx.textAlign = 'right';
    ctx.font =
      r.winner === 'A' ? `700 13px ${FONT_MONO}` : `500 13px ${FONT_MONO}`;
    ctx.fillStyle = r.winner === 'A' ? accentA.text : PALETTE.textSecondary;
    ctx.fillText(
      r.valAText,
      PAD_X + labelColW + barColW + valColW - 8,
      midY
    );

    // Side B Value
    ctx.font =
      r.winner === 'B' ? `700 13px ${FONT_MONO}` : `500 13px ${FONT_MONO}`;
    ctx.fillStyle = r.winner === 'B' ? accentB.text : PALETTE.textSecondary;
    ctx.fillText(
      r.valBText,
      PAD_X + labelColW + barColW + valColW * 2 - 8,
      midY
    );

    // Delta / Advantage Column
    ctx.font = `600 12.5px ${FONT_MONO}`;
    ctx.fillStyle = resolveToneColor(r.deltaTone || 'neutral');
    ctx.fillText(r.deltaText || '—', PAD_X + innerW - 16, midY);
  });

  ctx.restore();

  drawRoundedRect(ctx, PAD_X, tableTop, innerW, tableH, 10);
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  drawCommonFooter(ctx, W, tableTop + tableH + 16, PAD_X, {
    footerNote: config.footerNote,
    includeEditorialVerdict,
    editorialVerdictText: resolvedVerdict,
    editorialVerdictLabel: config.editorialVerdictLabel,
    editorialVerdictTone: config.editorialVerdictTone,
  });

  const blob = await canvasToPngBlob(canvas);
  return {
    blob,
    filename: sanitizeExportFilename(config.filename),
  };
}

export interface TradeMachineSnapshotAsset {
  name: string;
  meta?: string;
  valueText: string;
  isPick?: boolean;
}

export interface TradeMachineSnapshotTeam {
  teamAbbr: string;
  teamName: string;
  preTierLabel: string;
  postTierLabel: string;
  tierChanged: boolean;
  postPayrollText: string;
  salaryDeltaText: string;
  salaryDeltaTone?: SnapshotCellTone;
  taxDeltaText: string;
  taxDeltaTone?: SnapshotCellTone;
  isValid: boolean;
  statusLabel: string;
  incomingAssets: TradeMachineSnapshotAsset[];
  outgoingCountLabel: string;
  outgoingSalaryText: string;
  picksBalanceText?: string;
  ptsDeltaText: string;
  ptsDeltaTone?: SnapshotCellTone;
  rebDeltaText: string;
  astDeltaText: string;
  impactDeltaText: string;
  impactDeltaTone?: SnapshotCellTone;
  primaryViolation?: string;
}

export interface TradeMachineSnapshotConfig extends EditorialVerdictOptions {
  filename: string;
  categoryTag?: string;
  title: string;
  subtitle?: string;
  verdictBadgeText: string;
  verdictBadgeTone: SnapshotCellTone;
  kpis: SnapshotKpiItem[];
  teams: TradeMachineSnapshotTeam[];
  footerNote?: string;
  showWatermark?: boolean;
}

function drawRadarEmblemVector(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  strokeColor: string,
  accentColor: string
): void {
  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = Math.max(1.2, radius * 0.14);

  // Outer radar ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Inner radar ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.56, 0, Math.PI * 2);
  ctx.stroke();

  // Crosshair / basketball seam lines
  ctx.beginPath();
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy + radius);
  ctx.stroke();

  // Radar sweep needle & core dot
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = Math.max(1.4, radius * 0.16);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + radius * 0.72, cy - radius * 0.62);
  ctx.stroke();

  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(1.6, radius * 0.2), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRadarNbaWatermarkLayer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();

  // Subtle diagonal repeating watermark pattern across the entire image
  ctx.translate(width / 2, height / 2);
  ctx.rotate((-20 * Math.PI) / 180);

  const stepX = 360;
  const stepY = 175;
  const cols = Math.ceil((width + height) / stepX) + 2;
  const rows = Math.ceil((width + height) / stepY) + 2;

  for (let r = -rows; r <= rows; r++) {
    for (let c = -cols; c <= cols; c++) {
      const offsetX = r % 2 === 0 ? 0 : stepX / 2;
      const x = c * stepX + offsetX;
      const y = r * stepY;

      drawRadarEmblemVector(
        ctx,
        x - 92,
        y - 4,
        10,
        'rgba(249, 115, 22, 0.09)',
        'rgba(251, 146, 60, 0.12)'
      );

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `800 16px ${FONT_MONO}`;
      ctx.fillStyle = 'rgba(248, 250, 252, 0.055)';
      ctx.fillText('RADARNBA', x - 74, y - 7);

      ctx.font = `600 10.5px ${FONT_MONO}`;
      ctx.fillStyle = 'rgba(251, 146, 60, 0.075)';
      ctx.fillText(RADARNBA_SIGNATURE_DOMAIN, x - 74, y + 9);
    }
  }

  ctx.restore();
}

function drawCornerWatermarkSeal(
  ctx: CanvasRenderingContext2D,
  rightX: number,
  y: number
): void {
  const sealH = 30;
  ctx.save();
  ctx.font = `700 10.5px ${FONT_MONO}`;
  const brandW = ctx.measureText('RADARNBA').width;
  ctx.font = `600 10px ${FONT_MONO}`;
  const domainText = ` · ${RADARNBA_SIGNATURE_DOMAIN}`;
  const domainW = ctx.measureText(domainText).width;
  const sealW = Math.ceil(32 + brandW + domainW + 14);
  const x = rightX - sealW;

  drawRoundedRect(ctx, x, y, sealW, sealH, 7);
  ctx.fillStyle = 'rgba(11, 17, 32, 0.9)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = hexToRgba(PALETTE.orange, 0.45);
  ctx.stroke();

  drawRadarEmblemVector(
    ctx,
    x + 17,
    y + sealH / 2,
    8,
    hexToRgba(PALETTE.orange, 0.65),
    PALETTE.orangeText
  );

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `700 10.5px ${FONT_MONO}`;
  ctx.fillStyle = PALETTE.textPrimary;
  ctx.fillText('RADARNBA', x + 31, y + sealH / 2 + 0.5);

  ctx.font = `600 10px ${FONT_MONO}`;
  ctx.fillStyle = PALETTE.orangeText;
  ctx.fillText(domainText, x + 31 + brandW, y + sealH / 2 + 0.5);
  ctx.restore();
}

function loadCanvasImageFromDataUri(
  dataUri: string
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!dataUri) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUri;
  });
}

export async function buildTradeMachineSnapshotBlob(
  config: TradeMachineSnapshotConfig
): Promise<{ blob: Blob; filename: string }> {
  await ensureFontsReady();

  const includeEditorialVerdict =
    config.includeEditorialVerdict ?? getExportEditorialVerdictEnabled();
  const showWatermark = config.showWatermark ?? true;
  const teams = config.teams.slice(0, 4);

  // Preload official logos for participating teams (safe 4-tier fallback via same-origin proxy / SVG)
  const logoMap = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    teams.map(async (t) => {
      try {
        const uri = await getTeamLogoDataUri(t.teamAbbr);
        const img = await loadCanvasImageFromDataUri(uri);
        logoMap.set(t.teamAbbr, img);
      } catch {
        logoMap.set(t.teamAbbr, null);
      }
    })
  );

  const W = 1200;
  const PAD_X = 32;
  const innerW = W - PAD_X * 2;
  const colCount = teams.length === 3 ? 3 : 2;
  const rowCount = Math.ceil(teams.length / colCount);
  const gridGap = 16;
  const cardW = (innerW - gridGap * (colCount - 1)) / colCount;

  const maxVisibleAssets = 6;
  const computeCardHeight = (rowTeams: TradeMachineSnapshotTeam[]): number => {
    let maxAssets = 1;
    let anyPickBalance = false;
    let anyViolation = false;
    for (const t of rowTeams) {
      maxAssets = Math.max(
        maxAssets,
        Math.min(maxVisibleAssets, Math.max(1, t.incomingAssets.length)) +
          (t.incomingAssets.length > maxVisibleAssets ? 1 : 0)
      );
      if (t.picksBalanceText) anyPickBalance = true;
      if (t.primaryViolation) anyViolation = true;
    }
    // Header (64) + Recibe header (24) + asset rows (25 each) + Envia strip (34) + picks balance (26?) + metrics strip (54) + violation (30?) + padding (18)
    return (
      64 +
      24 +
      maxAssets * 25 +
      34 +
      (anyPickBalance ? 26 : 0) +
      54 +
      (anyViolation ? 30 : 0) +
      18
    );
  };

  const rowHeights: number[] = [];
  for (let r = 0; r < rowCount; r++) {
    const slice = teams.slice(r * colCount, (r + 1) * colCount);
    rowHeights.push(computeCardHeight(slice));
  }

  const headerBlockH = config.subtitle ? 102 : 80;
  const kpiBlockH = config.kpis.length > 0 ? 90 : 0;
  const totalGridH =
    rowHeights.reduce((sum, h) => sum + h, 0) +
    Math.max(0, rowCount - 1) * gridGap;
  const watermarkSealBlockH = showWatermark ? 34 : 0;
  const footerH = resolveEditorialFooterHeight(includeEditorialVerdict);
  const H =
    headerBlockH +
    kpiBlockH +
    totalGridH +
    gridGap +
    watermarkSealBlockH +
    footerH +
    14;

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Contexto 2D no disponible en este navegador.');
  }
  ctx.scale(scale, scale);

  // Base Canvas Background + Subtle Frame
  ctx.fillStyle = PALETTE.bgCanvas;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  // Subtle ambient background watermark across canvas
  if (showWatermark) {
    drawRadarNbaWatermarkLayer(ctx, W, H);
  }

  // Top Orange Bar
  ctx.fillStyle = PALETTE.orange;
  ctx.fillRect(0, 0, W, 4);

  // Header Brand + Radar Emblem + Right Watermark/Date
  let y = 28;
  drawRadarEmblemVector(ctx, PAD_X + 8, y - 4, 8, PALETTE.orange, PALETTE.orangeText);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `700 12px ${FONT_MONO}`;
  ctx.fillStyle = PALETTE.orangeText;
  const brandLabel = 'RADARNBA';
  ctx.fillText(brandLabel, PAD_X + 22, y);
  const brandW = ctx.measureText(brandLabel).width;

  ctx.font = `600 12px ${FONT_SANS}`;
  ctx.fillStyle = PALETTE.textMuted;
  ctx.fillText(
    `  ·  ${(config.categoryTag || 'TRADE MACHINE CBA 2026-27').toUpperCase()}`,
    PAD_X + 22 + brandW,
    y
  );

  const dateText = formatExportTimestamp();
  ctx.font = `600 12px ${FONT_MONO}`;
  ctx.fillStyle = PALETTE.textMuted;
  ctx.textAlign = 'right';
  ctx.fillText(`${RADARNBA_SIGNATURE_DOMAIN}  ·  ${dateText}`, W - PAD_X, y);

  // Title + Right Verdict Stamp
  y += 32;
  const badgeColor = resolveToneColor(config.verdictBadgeTone);
  ctx.font = `700 11.5px ${FONT_MONO}`;
  const badgeTextW = ctx.measureText(config.verdictBadgeText).width;
  const badgeW = badgeTextW + 24;
  const badgeH = 26;
  const badgeX = W - PAD_X - badgeW;
  const badgeY = y - 19;

  drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 6);
  ctx.fillStyle = hexToRgba(badgeColor, 0.14);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = hexToRgba(badgeColor, 0.55);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = badgeColor;
  ctx.fillText(config.verdictBadgeText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 0.5);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 23px ${FONT_SANS}`;
  ctx.fillStyle = PALETTE.textPrimary;
  ctx.fillText(
    truncateCanvasText(ctx, config.title, badgeX - PAD_X - 18),
    PAD_X,
    y
  );

  if (config.subtitle) {
    y += 22;
    ctx.font = `400 13px ${FONT_SANS}`;
    ctx.fillStyle = PALETTE.textMuted;
    ctx.fillText(truncateCanvasText(ctx, config.subtitle, innerW), PAD_X, y);
  }

  let cursorY = y + 20;

  // KPI Strip
  if (config.kpis.length > 0) {
    cursorY = drawKpiStrip(ctx, PAD_X, cursorY, innerW, config.kpis);
  }

  // Team Trade Cards Grid
  for (let r = 0; r < rowCount; r++) {
    const rowH = rowHeights[r];
    for (let c = 0; c < colCount; c++) {
      const idx = r * colCount + c;
      const t = teams[idx];
      if (!t) continue;

      const cx = PAD_X + c * (cardW + gridGap);
      const cy = cursorY;
      const pal = getTeamDarkUiPalette(t.teamAbbr);

      // Card surface (slightly translucent so subtle watermark integrates naturally)
      drawRoundedRect(ctx, cx, cy, cardW, rowH, 10);
      ctx.fillStyle = 'rgba(19, 28, 46, 0.91)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = t.isValid
        ? hexToRgba(PALETTE.emerald, 0.35)
        : hexToRgba(PALETTE.rose, 0.45);
      ctx.stroke();

      // Subtle top team color accent hairline inside card
      ctx.save();
      drawRoundedRect(ctx, cx, cy, cardW, rowH, 10);
      ctx.clip();
      ctx.fillStyle = hexToRgba(pal.primary, 0.85);
      ctx.fillRect(cx, cy, cardW, 3);
      ctx.restore();

      // Team Header Row (Logo + Name + Tier + Status)
      const logoImg = logoMap.get(t.teamAbbr);
      const logoSize = 34;
      const logoX = cx + 14;
      const logoY = cy + 15;
      if (logoImg) {
        drawRoundedRect(ctx, logoX, logoY, logoSize, logoSize, 7);
        ctx.fillStyle = '#0B1120';
        ctx.fill();
        ctx.strokeStyle = PALETTE.borderStrong;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.drawImage(logoImg, logoX + 3, logoY + 3, logoSize - 6, logoSize - 6);
      } else {
        drawTeamChip(ctx, t.teamAbbr, logoX, logoY + 6, 40, 22);
      }

      const nameX = logoX + (logoImg ? logoSize + 10 : 48);
      const statusRightX = cx + cardW - 14;

      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `700 11px ${FONT_MONO}`;
      ctx.fillStyle = t.isValid ? PALETTE.emeraldText : PALETTE.roseText;
      ctx.fillText(t.statusLabel, statusRightX, cy + 29);

      ctx.font = `500 10.5px ${FONT_MONO}`;
      ctx.fillStyle = PALETTE.textMuted;
      ctx.fillText(`Post ${t.postPayrollText}`, statusRightX, cy + 45);

      const maxNameW = statusRightX - nameX - 108;
      ctx.textAlign = 'left';
      ctx.font = `700 14.5px ${FONT_SANS}`;
      ctx.fillStyle = PALETTE.textPrimary;
      ctx.fillText(truncateCanvasText(ctx, t.teamName, maxNameW), nameX, cy + 29);

      const tierLine = t.tierChanged
        ? `${t.preTierLabel} → ${t.postTierLabel}`
        : t.postTierLabel;
      ctx.font = `500 11px ${FONT_SANS}`;
      ctx.fillStyle = PALETTE.textMuted;
      ctx.fillText(truncateCanvasText(ctx, tierLine, maxNameW), nameX, cy + 45);

      // Divider below card header
      let iy = cy + 60;
      ctx.beginPath();
      ctx.moveTo(cx + 14, iy);
      ctx.lineTo(cx + cardW - 14, iy);
      ctx.strokeStyle = PALETTE.border;
      ctx.lineWidth = 1;
      ctx.stroke();

      // RECIBE label
      iy += 18;
      ctx.textAlign = 'left';
      ctx.font = `700 10.5px ${FONT_MONO}`;
      ctx.fillStyle = PALETTE.emeraldText;
      ctx.fillText('RECIBE', cx + 14, iy);

      ctx.textAlign = 'right';
      ctx.font = `500 10.5px ${FONT_MONO}`;
      ctx.fillStyle = PALETTE.textMuted;
      ctx.fillText(
        `${t.incomingAssets.length} activo${t.incomingAssets.length === 1 ? '' : 's'}`,
        cx + cardW - 14,
        iy
      );

      iy += 20;
      if (t.incomingAssets.length === 0) {
        ctx.textAlign = 'left';
        ctx.font = `400 12px ${FONT_SANS}`;
        ctx.fillStyle = PALETTE.textDim;
        ctx.fillText('Sin activos entrantes en esta simulación', cx + 14, iy);
        iy += 25;
      } else {
        const shown = t.incomingAssets.slice(0, maxVisibleAssets);
        shown.forEach((asset) => {
          ctx.textAlign = 'right';
          ctx.font = `600 11.5px ${FONT_MONO}`;
          ctx.fillStyle = asset.isPick ? PALETTE.amberText : PALETTE.textSecondary;
          const valW = ctx.measureText(asset.valueText).width;
          ctx.fillText(asset.valueText, cx + cardW - 14, iy);

          ctx.textAlign = 'left';
          ctx.font = asset.isPick
            ? `600 11.5px ${FONT_MONO}`
            : `600 12.5px ${FONT_SANS}`;
          ctx.fillStyle = asset.isPick ? '#FDE68A' : PALETTE.textPrimary;
          const label = asset.meta ? `${asset.name} (${asset.meta})` : asset.name;
          ctx.fillText(
            truncateCanvasText(ctx, label, cardW - 38 - valW),
            cx + 14,
            iy
          );
          iy += 25;
        });

        if (t.incomingAssets.length > maxVisibleAssets) {
          ctx.textAlign = 'left';
          ctx.font = `500 11px ${FONT_SANS}`;
          ctx.fillStyle = PALETTE.textMuted;
          ctx.fillText(
            `+${t.incomingAssets.length - maxVisibleAssets} activos adicionales`,
            cx + 14,
            iy
          );
          iy += 25;
        }
      }

      // Bottom-anchored summary blocks inside the card
      let bottomCursor = cy + rowH - 12;

      if (t.primaryViolation) {
        const vBoxH = 24;
        bottomCursor -= vBoxH;
        drawRoundedRect(ctx, cx + 12, bottomCursor, cardW - 24, vBoxH, 5);
        ctx.fillStyle = 'rgba(244, 63, 94, 0.12)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `600 10.5px ${FONT_SANS}`;
        ctx.fillStyle = PALETTE.roseText;
        ctx.fillText(
          truncateCanvasText(ctx, `CBA: ${t.primaryViolation}`, cardW - 38),
          cx + 20,
          bottomCursor + vBoxH / 2 + 0.5
        );
        bottomCursor -= 8;
      }

      // Metrics Strip (Delta 26-27 | Tax est. | PTS | IMPACTO)
      const stripH = 44;
      bottomCursor -= stripH;
      drawRoundedRect(ctx, cx + 12, bottomCursor, cardW - 24, stripH, 7);
      ctx.fillStyle = 'rgba(11, 17, 32, 0.78)';
      ctx.fill();
      ctx.strokeStyle = PALETTE.border;
      ctx.lineWidth = 1;
      ctx.stroke();

      const stripItems: Array<{ label: string; val: string; tone: SnapshotCellTone }> = [
        { label: 'DELTA 26-27', val: t.salaryDeltaText, tone: t.salaryDeltaTone || 'neutral' },
        { label: 'DELTA TAX', val: t.taxDeltaText, tone: t.taxDeltaTone || 'muted' },
        { label: 'PTS / REB / AST', val: `${t.ptsDeltaText} / ${t.rebDeltaText} / ${t.astDeltaText}`, tone: t.ptsDeltaTone || 'neutral' },
        { label: 'IMPACTO', val: t.impactDeltaText, tone: t.impactDeltaTone || 'neutral' },
      ];
      const cellW = (cardW - 24) / stripItems.length;
      stripItems.forEach((m, mIdx) => {
        const mx = cx + 12 + mIdx * cellW;
        if (mIdx > 0) {
          ctx.beginPath();
          ctx.moveTo(mx, bottomCursor + 7);
          ctx.lineTo(mx, bottomCursor + stripH - 7);
          ctx.strokeStyle = PALETTE.border;
          ctx.stroke();
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = `500 9px ${FONT_MONO}`;
        ctx.fillStyle = PALETTE.textDim;
        ctx.fillText(
          truncateCanvasText(ctx, m.label, cellW - 8),
          mx + cellW / 2,
          bottomCursor + 15
        );
        ctx.font = `700 11px ${FONT_MONO}`;
        ctx.fillStyle = resolveToneColor(m.tone);
        ctx.fillText(
          truncateCanvasText(ctx, m.val, cellW - 8),
          mx + cellW / 2,
          bottomCursor + 34
        );
      });

      bottomCursor -= 8;

      // Optional Picks Net Balance Row
      if (t.picksBalanceText) {
        const pH = 20;
        bottomCursor -= pH;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `600 10.5px ${FONT_MONO}`;
        ctx.fillStyle = PALETTE.amberText;
        ctx.fillText(
          truncateCanvasText(ctx, t.picksBalanceText, cardW - 28),
          cx + 14,
          bottomCursor + pH / 2
        );
        bottomCursor -= 4;
      }

      // Envía compact bar
      const sendH = 24;
      bottomCursor -= sendH;
      ctx.beginPath();
      ctx.moveTo(cx + 14, bottomCursor);
      ctx.lineTo(cx + cardW - 14, bottomCursor);
      ctx.strokeStyle = hexToRgba(PALETTE.border, 0.85);
      ctx.stroke();

      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.font = `600 10.5px ${FONT_SANS}`;
      ctx.fillStyle = PALETTE.roseText;
      ctx.fillText(
        truncateCanvasText(ctx, `Envía: ${t.outgoingCountLabel}`, cardW - 130),
        cx + 14,
        bottomCursor + sendH / 2 + 2
      );
      ctx.textAlign = 'right';
      ctx.font = `600 10.5px ${FONT_MONO}`;
      ctx.fillStyle = PALETTE.textMuted;
      ctx.fillText(t.outgoingSalaryText, cx + cardW - 14, bottomCursor + sendH / 2 + 2);
    }
    cursorY += rowH + gridGap;
  }

  // Visible Corner Brand Seal right above footer (cannot be missed when shared)
  if (showWatermark) {
    drawCornerWatermarkSeal(ctx, W - PAD_X, cursorY - 4);
    cursorY += 34;
  }

  drawCommonFooter(ctx, W, cursorY, PAD_X, {
    footerNote:
      config.footerNote ||
      'RadarNBA · Trade Machine CBA 2026-27 + Regla Ted Stepien',
    includeEditorialVerdict,
    editorialVerdictText:
      cleanOneLineVerdict(config.editorialVerdict) ||
      `${config.title} · Simulación verificada bajo las reglas salariales del CBA 2026-27 en RadarNBA.`,
    editorialVerdictLabel:
      config.editorialVerdictLabel || 'VEREDICTO TRADE MACHINE · RADARNBA',
    editorialVerdictTone: config.editorialVerdictTone || config.verdictBadgeTone,
  });

  const blob = await canvasToPngBlob(canvas);
  return {
    blob,
    filename: sanitizeExportFilename(config.filename),
  };
}

export function downloadPngBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = sanitizeExportFilename(filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function canCopyImageToClipboard(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof ClipboardItem !== 'undefined' &&
    Boolean(navigator.clipboard?.write)
  );
}

export async function copyPngBlobToClipboard(blob: Blob): Promise<boolean> {
  if (!canCopyImageToClipboard()) return false;
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': blob,
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function copyPngPromiseToClipboard(
  blobPromise: Promise<Blob>
): Promise<boolean> {
  if (!canCopyImageToClipboard()) return false;
  // Pass Promise<Blob> directly to preserve user activation gesture on Safari/Chromium
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': blobPromise,
      }),
    ]);
    return true;
  } catch {
    try {
      const blob = await blobPromise;
      return await copyPngBlobToClipboard(blob);
    } catch {
      return false;
    }
  }
}
