import { getTeamDarkUiPalette, hexToRgba } from './teamLogos';

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

export interface TableSnapshotConfig {
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

export interface ComparisonSnapshotConfig {
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

  // Brand + Category Tag + Date
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
  ctx.fillText(dateText, width - padX, y);

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

function drawCommonFooter(
  ctx: CanvasRenderingContext2D,
  width: number,
  y: number,
  padX: number,
  footerNote?: string
): void {
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
  ctx.fillText(
    footerNote || 'RadarNBA · Analítica avanzada, rachas y scouting NBA',
    padX,
    textY
  );

  ctx.textAlign = 'right';
  ctx.font = `600 11px ${FONT_MONO}`;
  ctx.fillStyle = PALETTE.orangeText;
  ctx.fillText('RadarNBA', width - padX, textY);
}

export async function buildTableSnapshotBlob(
  config: TableSnapshotConfig
): Promise<{ blob: Blob; filename: string }> {
  await ensureFontsReady();

  const W = 1200;
  const PAD_X = 32;
  const innerW = W - PAD_X * 2;
  const rows = config.rows.slice(0, 15);
  const hasKpis = Boolean(config.kpis && config.kpis.length > 0);
  const headerBlockH = (config.subtitle ? 100 : 78) + (hasKpis ? 90 : 0);
  const tableHeaderH = 40;
  const rowH = 48;
  const tableH = tableHeaderH + Math.max(1, rows.length) * rowH;
  const footerH = 44;
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

  drawCommonFooter(ctx, W, tableTop + tableH + 16, PAD_X, config.footerNote);

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

  const hasVerdict = Boolean(config.verdictPrimary || config.verdictSecondary);
  const verdictH = hasVerdict ? 50 : 0;
  const tableHeaderH = 40;
  const rowH = 44;
  const tableH = tableHeaderH + Math.max(1, rows.length) * rowH;
  const headerBlockH = config.subtitle ? 100 : 78;
  const footerH = 44;

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

  drawCommonFooter(ctx, W, tableTop + tableH + 16, PAD_X, config.footerNote);

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
