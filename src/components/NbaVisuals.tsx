import React, { useEffect, useMemo, useState } from 'react';
import { useThemeStyle } from '../context/ThemeStyleContext';

export type VisualSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type VisualAccentTone = 'default' | 'orange' | 'sky' | 'emerald';

export interface NbaTeamVisualMeta {
  canonical: string;
  nbaId: string;
  espnSlug: string;
  primaryHex: string;
  secondaryHex: string;
}

const NBA_TEAM_META: Record<string, NbaTeamVisualMeta> = {
  ATL: { canonical: 'ATL', nbaId: '1610612737', espnSlug: 'atl', primaryHex: '#E03A3E', secondaryHex: '#C1D32F' },
  BOS: { canonical: 'BOS', nbaId: '1610612738', espnSlug: 'bos', primaryHex: '#007A33', secondaryHex: '#BA9653' },
  CLE: { canonical: 'CLE', nbaId: '1610612739', espnSlug: 'cle', primaryHex: '#860038', secondaryHex: '#FDBB30' },
  NOP: { canonical: 'NOP', nbaId: '1610612740', espnSlug: 'no', primaryHex: '#0C2340', secondaryHex: '#C8102E' },
  CHI: { canonical: 'CHI', nbaId: '1610612741', espnSlug: 'chi', primaryHex: '#CE1141', secondaryHex: '#FFFFFF' },
  DAL: { canonical: 'DAL', nbaId: '1610612742', espnSlug: 'dal', primaryHex: '#00538C', secondaryHex: '#B8C4CA' },
  DEN: { canonical: 'DEN', nbaId: '1610612743', espnSlug: 'den', primaryHex: '#0E2240', secondaryHex: '#FEC524' },
  GSW: { canonical: 'GSW', nbaId: '1610612744', espnSlug: 'gs', primaryHex: '#1D428A', secondaryHex: '#FFC72C' },
  HOU: { canonical: 'HOU', nbaId: '1610612745', espnSlug: 'hou', primaryHex: '#CE1141', secondaryHex: '#C4CED4' },
  LAC: { canonical: 'LAC', nbaId: '1610612746', espnSlug: 'lac', primaryHex: '#C8102E', secondaryHex: '#1D428A' },
  LAL: { canonical: 'LAL', nbaId: '1610612747', espnSlug: 'lal', primaryHex: '#552583', secondaryHex: '#FDB927' },
  MIA: { canonical: 'MIA', nbaId: '1610612748', espnSlug: 'mia', primaryHex: '#98002E', secondaryHex: '#F9A01B' },
  MIL: { canonical: 'MIL', nbaId: '1610612749', espnSlug: 'mil', primaryHex: '#00471B', secondaryHex: '#EEE1C6' },
  MIN: { canonical: 'MIN', nbaId: '1610612750', espnSlug: 'min', primaryHex: '#0C2340', secondaryHex: '#78BE20' },
  BKN: { canonical: 'BKN', nbaId: '1610612751', espnSlug: 'bkn', primaryHex: '#94A3B8', secondaryHex: '#FFFFFF' },
  NYK: { canonical: 'NYK', nbaId: '1610612752', espnSlug: 'ny', primaryHex: '#006BB6', secondaryHex: '#F58426' },
  ORL: { canonical: 'ORL', nbaId: '1610612753', espnSlug: 'orl', primaryHex: '#0077C0', secondaryHex: '#C4CED4' },
  IND: { canonical: 'IND', nbaId: '1610612754', espnSlug: 'ind', primaryHex: '#002D62', secondaryHex: '#FDBB30' },
  PHI: { canonical: 'PHI', nbaId: '1610612755', espnSlug: 'phi', primaryHex: '#006BB6', secondaryHex: '#ED174C' },
  PHX: { canonical: 'PHX', nbaId: '1610612756', espnSlug: 'phx', primaryHex: '#E56020', secondaryHex: '#1D1160' },
  POR: { canonical: 'POR', nbaId: '1610612757', espnSlug: 'por', primaryHex: '#E03A3E', secondaryHex: '#FFFFFF' },
  SAC: { canonical: 'SAC', nbaId: '1610612758', espnSlug: 'sac', primaryHex: '#5A2D81', secondaryHex: '#63727A' },
  SAS: { canonical: 'SAS', nbaId: '1610612759', espnSlug: 'sa', primaryHex: '#C4CED4', secondaryHex: '#94A3B8' },
  OKC: { canonical: 'OKC', nbaId: '1610612760', espnSlug: 'okc', primaryHex: '#007AC1', secondaryHex: '#EF3B24' },
  TOR: { canonical: 'TOR', nbaId: '1610612761', espnSlug: 'tor', primaryHex: '#CE1141', secondaryHex: '#A1A1AA' },
  UTA: { canonical: 'UTA', nbaId: '1610612762', espnSlug: 'utah', primaryHex: '#F9A01B', secondaryHex: '#002B5C' },
  MEM: { canonical: 'MEM', nbaId: '1610612763', espnSlug: 'mem', primaryHex: '#5D76A9', secondaryHex: '#12173F' },
  WAS: { canonical: 'WAS', nbaId: '1610612764', espnSlug: 'wsh', primaryHex: '#E31837', secondaryHex: '#002B5C' },
  DET: { canonical: 'DET', nbaId: '1610612765', espnSlug: 'det', primaryHex: '#C8102E', secondaryHex: '#1D42BA' },
  CHA: { canonical: 'CHA', nbaId: '1610612766', espnSlug: 'cha', primaryHex: '#00788C', secondaryHex: '#1D1160' },
};

const ABBR_ALIASES: Record<string, string> = {
  GS: 'GSW',
  SA: 'SAS',
  NY: 'NYK',
  NO: 'NOP',
  NOH: 'NOP',
  NOK: 'NOP',
  UTAH: 'UTA',
  WSH: 'WAS',
  BRK: 'BKN',
  NJN: 'BKN',
  PHO: 'PHX',
  CHO: 'CHA',
  CHH: 'CHA',
};

const NBA_ID_TO_META: Record<string, NbaTeamVisualMeta> = Object.values(NBA_TEAM_META).reduce(
  (acc, item) => {
    acc[item.nbaId] = item;
    return acc;
  },
  {} as Record<string, NbaTeamVisualMeta>
);

function resolveTeamMeta(abbr?: string | null, teamId?: string | null): NbaTeamVisualMeta | null {
  if (abbr) {
    const cleaned = abbr.trim().toUpperCase();
    const canonical = ABBR_ALIASES[cleaned] || cleaned;
    if (NBA_TEAM_META[canonical]) {
      return NBA_TEAM_META[canonical];
    }
  }
  if (teamId) {
    const cleanedId = String(teamId).trim();
    if (NBA_ID_TO_META[cleanedId]) {
      return NBA_ID_TO_META[cleanedId];
    }
  }
  return null;
}

export function getTeamBrandColors(
  abbr?: string | null,
  teamId?: string | null
): { primary: string; secondary: string } {
  const meta = resolveTeamMeta(abbr, teamId);
  return {
    primary: meta?.primaryHex || '#F59E0B',
    secondary: meta?.secondaryHex || '#38BDF8',
  };
}

function getInitials(name: string): string {
  const parts = (name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'NBA';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

const FRAMED_SIZE_CLASSES: Record<VisualSize, string> = {
  xs: 'w-6 h-6 rounded-md text-[9px]',
  sm: 'w-8 h-8 rounded-lg text-[10px]',
  md: 'w-9 h-9 rounded-lg text-[11px]',
  lg: 'w-11 h-11 rounded-lg text-xs',
  xl: 'w-14 h-14 rounded-xl text-sm',
};

const FRAMED_LOGO_PADDING: Record<VisualSize, string> = {
  xs: 'p-0.5',
  sm: 'p-1',
  md: 'p-1',
  lg: 'p-1.5',
  xl: 'p-1.5',
};

const UNFRAMED_LOGO_CLASSES: Record<VisualSize, string> = {
  xs: 'w-4 h-4 text-[8px]',
  sm: 'w-5 h-5 text-[9px]',
  md: 'w-7 h-7 text-[10px]',
  lg: 'w-9 h-9 text-[11px]',
  xl: 'w-11 h-11 text-xs',
};

const TONE_BORDER_CLASSES: Record<VisualAccentTone, string> = {
  default: 'border-[#1E293B] bg-[#0B1120]',
  orange: 'border-orange-500/40 bg-[#0B1120]',
  sky: 'border-sky-500/40 bg-[#0B1120]',
  emerald: 'border-emerald-500/40 bg-[#0B1120]',
};

const CORNER_BADGE_CLASSES: Record<VisualSize, string> = {
  xs: 'w-3.5 h-3.5 -bottom-0.5 -right-0.5',
  sm: 'w-3.5 h-3.5 -bottom-0.5 -right-0.5',
  md: 'w-4 h-4 -bottom-0.5 -right-0.5',
  lg: 'w-[18px] h-[18px] -bottom-1 -right-1',
  xl: 'w-5 h-5 -bottom-1 -right-1',
};

export interface TeamLogoProps {
  abbr?: string | null;
  teamId?: string | null;
  logoUrl?: string | null;
  size?: VisualSize;
  framed?: boolean;
  accentTone?: VisualAccentTone;
  className?: string;
  title?: string;
}

export const TeamLogo: React.FC<TeamLogoProps> = ({
  abbr,
  teamId,
  logoUrl,
  size = 'sm',
  framed = false,
  accentTone = 'default',
  className = '',
  title,
}) => {
  const { isV2 } = useThemeStyle();
  const meta = useMemo(() => resolveTeamMeta(abbr, teamId), [abbr, teamId]);

  const candidates = useMemo(() => {
    const urls: string[] = [];
    if (meta?.nbaId) {
      urls.push(`https://cdn.nba.com/logos/nba/${meta.nbaId}/global/L/logo.svg`);
    }
    if (logoUrl && logoUrl.trim()) {
      urls.push(logoUrl.trim());
    }
    if (meta?.espnSlug) {
      urls.push(`https://a.espncdn.com/i/teamlogos/nba/500/${meta.espnSlug}.png`);
    }
    return Array.from(new Set(urls));
  }, [meta, logoUrl]);

  const [srcIndex, setSrcIndex] = useState(0);

  useEffect(() => {
    setSrcIndex(0);
  }, [candidates]);

  const activeSrc = srcIndex < candidates.length ? candidates[srcIndex] : null;
  const fallbackLabel = (meta?.canonical || abbr || 'NBA').trim().slice(0, 3).toUpperCase();

  const v2FramedStyle =
    isV2 && framed && meta && accentTone === 'default'
      ? {
          borderColor: `${meta.primaryHex}66`,
          background: `radial-gradient(circle at 30% 25%, ${meta.primaryHex}26, #070C17 75%)`,
        }
      : undefined;

  if (framed) {
    return (
      <span
        title={title || meta?.canonical || abbr || undefined}
        style={v2FramedStyle}
        className={`inline-flex items-center justify-center shrink-0 border overflow-hidden select-none ${FRAMED_SIZE_CLASSES[size]} ${FRAMED_LOGO_PADDING[size]} ${TONE_BORDER_CLASSES[accentTone]} ${className}`}
      >
        {activeSrc ? (
          <img
            src={activeSrc}
            alt={fallbackLabel}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            onError={() => setSrcIndex((prev) => prev + 1)}
            onLoad={(e) => {
              if (e.currentTarget.naturalWidth <= 1) {
                setSrcIndex((prev) => prev + 1);
              }
            }}
            className="w-full h-full object-contain select-none pointer-events-none"
          />
        ) : (
          <span className="font-mono font-bold tracking-tight text-slate-300 leading-none">
            {fallbackLabel}
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      title={title || meta?.canonical || abbr || undefined}
      className={`inline-flex items-center justify-center shrink-0 select-none ${UNFRAMED_LOGO_CLASSES[size]} ${className}`}
    >
      {activeSrc ? (
        <img
          src={activeSrc}
          alt={fallbackLabel}
          loading="lazy"
          decoding="async"
          onError={() => setSrcIndex((prev) => prev + 1)}
          onLoad={(e) => {
            if (e.currentTarget.naturalWidth <= 1) {
              setSrcIndex((prev) => prev + 1);
            }
          }}
          className="w-full h-full object-contain select-none pointer-events-none"
        />
      ) : (
        <span className="w-full h-full rounded border border-[#1E293B] bg-[#0B1120] inline-flex items-center justify-center font-mono font-bold tracking-tighter text-slate-300 leading-none">
          {fallbackLabel}
        </span>
      )}
    </span>
  );
};

export interface PlayerAvatarProps {
  playerId?: string | null;
  name: string;
  headshotUrl?: string | null;
  teamAbbr?: string | null;
  showTeamBadge?: boolean;
  size?: VisualSize;
  accentTone?: VisualAccentTone;
  className?: string;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  playerId,
  name,
  headshotUrl,
  teamAbbr,
  showTeamBadge = false,
  size = 'sm',
  accentTone = 'default',
  className = '',
}) => {
  const { isV2 } = useThemeStyle();
  const teamMeta = useMemo(() => resolveTeamMeta(teamAbbr, null), [teamAbbr]);

  const candidates = useMemo(() => {
    const urls: string[] = [];
    if (headshotUrl && headshotUrl.trim()) {
      urls.push(headshotUrl.trim());
    }
    if (playerId) {
      const raw = String(playerId).trim();
      const match = raw.match(/^(?:nba-|espn-)?(\d+)$/i);
      if (match && match[1]) {
        const cleanId = match[1];
        urls.push(`https://cdn.nba.com/headshots/nba/latest/260x190/${cleanId}.png`);
        urls.push(`https://a.espncdn.com/i/headshots/nba/players/full/${cleanId}.png`);
      }
    }
    return Array.from(new Set(urls));
  }, [playerId, headshotUrl]);

  const [srcIndex, setSrcIndex] = useState(0);

  useEffect(() => {
    setSrcIndex(0);
  }, [candidates]);

  const activeSrc = srcIndex < candidates.length ? candidates[srcIndex] : null;
  const initials = useMemo(() => getInitials(name), [name]);

  const v2AvatarStyle =
    isV2 && teamMeta && accentTone === 'default'
      ? {
          borderColor: `${teamMeta.primaryHex}66`,
          background: `radial-gradient(circle at 50% 20%, ${teamMeta.primaryHex}33, #070C17 78%)`,
        }
      : undefined;

  return (
    <span
      title={name}
      className={`relative inline-flex shrink-0 select-none ${className}`}
    >
      <span
        style={v2AvatarStyle}
        className={`inline-flex items-center justify-center overflow-hidden border ${FRAMED_SIZE_CLASSES[size]} ${TONE_BORDER_CLASSES[accentTone]}`}
      >
        {activeSrc ? (
          <img
            src={activeSrc}
            alt={name}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            onError={() => setSrcIndex((prev) => prev + 1)}
            onLoad={(e) => {
              if (e.currentTarget.naturalWidth <= 1) {
                setSrcIndex((prev) => prev + 1);
              }
            }}
            className="w-full h-full object-cover object-top scale-[1.12] translate-y-[2px] select-none pointer-events-none"
          />
        ) : (
          <span className="font-mono font-bold tracking-tight text-slate-400 leading-none">
            {initials}
          </span>
        )}
      </span>
      {showTeamBadge && teamAbbr && (
        <span
          className={`absolute rounded-full bg-[#0F172A] border border-[#1E293B] flex items-center justify-center p-[1px] shadow-sm pointer-events-none ${CORNER_BADGE_CLASSES[size]}`}
        >
          <TeamLogo abbr={teamAbbr} size="xs" className="w-full h-full" />
        </span>
      )}
    </span>
  );
};

export interface EntityBadgeProps {
  entityType: 'player' | 'team';
  entityId?: string | null;
  name: string;
  teamAbbr?: string | null;
  headshotUrl?: string | null;
  logoUrl?: string | null;
  size?: VisualSize;
  showTeamBadge?: boolean;
  accentTone?: VisualAccentTone;
  className?: string;
}

export const EntityBadge: React.FC<EntityBadgeProps> = ({
  entityType,
  entityId,
  name,
  teamAbbr,
  headshotUrl,
  logoUrl,
  size = 'sm',
  showTeamBadge = false,
  accentTone = 'default',
  className = '',
}) => {
  if (entityType === 'team') {
    return (
      <TeamLogo
        abbr={teamAbbr || name}
        teamId={entityId}
        logoUrl={logoUrl}
        size={size}
        framed
        accentTone={accentTone}
        className={className}
        title={name}
      />
    );
  }

  return (
    <PlayerAvatar
      playerId={entityId}
      name={name}
      headshotUrl={headshotUrl}
      teamAbbr={teamAbbr}
      showTeamBadge={showTeamBadge}
      size={size}
      accentTone={accentTone}
      className={className}
    />
  );
};

export interface MiniSparklineProps {
  values: number[];
  referenceValue?: number;
  width?: number;
  height?: number;
  signedZero?: boolean;
  positiveIsGood?: boolean;
  title?: string;
  className?: string;
}

export const MiniSparkline: React.FC<MiniSparklineProps> = ({
  values,
  referenceValue,
  width = 72,
  height = 22,
  signedZero = false,
  positiveIsGood = true,
  title,
  className = '',
}) => {
  if (!values || values.length < 2) {
    return (
      <span
        className={`inline-flex items-center justify-center text-[10px] font-mono text-slate-500 ${className}`}
        style={{ width, height }}
        title={title || 'Datos insuficientes'}
      >
        —
      </span>
    );
  }

  const ref =
    referenceValue !== undefined && Number.isFinite(referenceValue)
      ? referenceValue
      : signedZero
      ? 0
      : values.reduce((acc, v) => acc + v, 0) / values.length;

  const allVals = [...values, ref];
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const span = Math.max(1e-3, maxVal - minVal);
  const padX = 3;
  const padY = 3;
  const innerW = Math.max(1, width - padX * 2);
  const innerH = Math.max(1, height - padY * 2);

  const toX = (idx: number) =>
    padX + (idx / Math.max(1, values.length - 1)) * innerW;
  const toY = (v: number) =>
    padY + (1 - (v - minVal) / span) * innerH;

  const points = values.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`);
  const lastVal = values[values.length - 1];
  const isFavorable = positiveIsGood ? lastVal >= ref : lastVal <= ref;
  const strokeColor = isFavorable ? '#34D399' : '#FB7185';
  const fillColor = isFavorable ? 'rgba(52, 211, 153, 0.14)' : 'rgba(251, 113, 133, 0.14)';
  const refY = toY(ref);

  const areaPoints = `${toX(0).toFixed(1)},${refY.toFixed(1)} ${points.join(' ')} ${toX(
    values.length - 1
  ).toFixed(1)},${refY.toFixed(1)}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`overflow-visible shrink-0 select-none ${className}`}
      role="img"
      aria-label={title || 'Tendencia reciente'}
    >
      {title && <title>{title}</title>}
      <line
        x1={padX}
        y1={refY}
        x2={width - padX}
        y2={refY}
        stroke="#475569"
        strokeWidth="1"
        strokeDasharray="2 2"
      />
      <polygon points={areaPoints} fill={fillColor} />
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(' ')}
      />
      <circle
        cx={toX(values.length - 1)}
        cy={toY(lastVal)}
        r="2.3"
        fill={strokeColor}
      />
    </svg>
  );
};

