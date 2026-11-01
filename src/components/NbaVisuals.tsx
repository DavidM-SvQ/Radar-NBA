import React, { useEffect, useMemo, useState } from 'react';

export type VisualSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type VisualAccentTone = 'default' | 'orange' | 'sky' | 'emerald';

interface NbaTeamVisualMeta {
  canonical: string;
  nbaId: string;
  espnSlug: string;
}

const NBA_TEAM_META: Record<string, NbaTeamVisualMeta> = {
  ATL: { canonical: 'ATL', nbaId: '1610612737', espnSlug: 'atl' },
  BOS: { canonical: 'BOS', nbaId: '1610612738', espnSlug: 'bos' },
  CLE: { canonical: 'CLE', nbaId: '1610612739', espnSlug: 'cle' },
  NOP: { canonical: 'NOP', nbaId: '1610612740', espnSlug: 'no' },
  CHI: { canonical: 'CHI', nbaId: '1610612741', espnSlug: 'chi' },
  DAL: { canonical: 'DAL', nbaId: '1610612742', espnSlug: 'dal' },
  DEN: { canonical: 'DEN', nbaId: '1610612743', espnSlug: 'den' },
  GSW: { canonical: 'GSW', nbaId: '1610612744', espnSlug: 'gs' },
  HOU: { canonical: 'HOU', nbaId: '1610612745', espnSlug: 'hou' },
  LAC: { canonical: 'LAC', nbaId: '1610612746', espnSlug: 'lac' },
  LAL: { canonical: 'LAL', nbaId: '1610612747', espnSlug: 'lal' },
  MIA: { canonical: 'MIA', nbaId: '1610612748', espnSlug: 'mia' },
  MIL: { canonical: 'MIL', nbaId: '1610612749', espnSlug: 'mil' },
  MIN: { canonical: 'MIN', nbaId: '1610612750', espnSlug: 'min' },
  BKN: { canonical: 'BKN', nbaId: '1610612751', espnSlug: 'bkn' },
  NYK: { canonical: 'NYK', nbaId: '1610612752', espnSlug: 'ny' },
  ORL: { canonical: 'ORL', nbaId: '1610612753', espnSlug: 'orl' },
  IND: { canonical: 'IND', nbaId: '1610612754', espnSlug: 'ind' },
  PHI: { canonical: 'PHI', nbaId: '1610612755', espnSlug: 'phi' },
  PHX: { canonical: 'PHX', nbaId: '1610612756', espnSlug: 'phx' },
  POR: { canonical: 'POR', nbaId: '1610612757', espnSlug: 'por' },
  SAC: { canonical: 'SAC', nbaId: '1610612758', espnSlug: 'sac' },
  SAS: { canonical: 'SAS', nbaId: '1610612759', espnSlug: 'sa' },
  OKC: { canonical: 'OKC', nbaId: '1610612760', espnSlug: 'okc' },
  TOR: { canonical: 'TOR', nbaId: '1610612761', espnSlug: 'tor' },
  UTA: { canonical: 'UTA', nbaId: '1610612762', espnSlug: 'utah' },
  MEM: { canonical: 'MEM', nbaId: '1610612763', espnSlug: 'mem' },
  WAS: { canonical: 'WAS', nbaId: '1610612764', espnSlug: 'wsh' },
  DET: { canonical: 'DET', nbaId: '1610612765', espnSlug: 'det' },
  CHA: { canonical: 'CHA', nbaId: '1610612766', espnSlug: 'cha' },
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

  if (framed) {
    return (
      <span
        title={title || meta?.canonical || abbr || undefined}
        className={`inline-flex items-center justify-center shrink-0 border overflow-hidden select-none ${FRAMED_SIZE_CLASSES[size]} ${FRAMED_LOGO_PADDING[size]} ${TONE_BORDER_CLASSES[accentTone]} ${className}`}
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

  return (
    <span
      title={name}
      className={`relative inline-flex shrink-0 select-none ${className}`}
    >
      <span
        className={`inline-flex items-center justify-center overflow-hidden border ${FRAMED_SIZE_CLASSES[size]} ${TONE_BORDER_CLASSES[accentTone]}`}
      >
        {activeSrc ? (
          <img
            src={activeSrc}
            alt={name}
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
