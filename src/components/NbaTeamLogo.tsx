import React, { useEffect, useState } from 'react';
import { getPlayerHeadshotUrl, getTeamLogoUrls } from '../utils/teamLogos';

export interface NbaTeamLogoProps {
  teamAbbr: string;
  teamName?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  showBadgeBorder?: boolean;
}

const SIZE_MAP: Record<
  NonNullable<NbaTeamLogoProps['size']>,
  { container: string; text: string; px: number }
> = {
  xs: { container: 'w-4 h-4', text: 'text-[9px]', px: 16 },
  sm: { container: 'w-5 h-5', text: 'text-[10px]', px: 20 },
  md: { container: 'w-7 h-7', text: 'text-xs', px: 28 },
  lg: { container: 'w-10 h-10', text: 'text-sm', px: 40 },
  xl: { container: 'w-14 h-14', text: 'text-base', px: 56 },
  '2xl': { container: 'w-20 h-20', text: 'text-xl', px: 80 },
};

export const NbaTeamLogo: React.FC<NbaTeamLogoProps> = ({
  teamAbbr,
  teamName,
  size = 'md',
  className = '',
  showBadgeBorder = false,
}) => {
  const [imageState, setImageState] = useState<'nba_svg' | 'espn_png' | 'fallback_badge'>(
    'nba_svg'
  );

  useEffect(() => {
    setImageState('nba_svg');
  }, [teamAbbr]);

  const urls = getTeamLogoUrls(teamAbbr);
  const sizeConfig = SIZE_MAP[size] || SIZE_MAP.md;

  const currentSrc =
    imageState === 'nba_svg'
      ? urls.primarySvg
      : imageState === 'espn_png'
      ? urls.espnPng
      : null;

  const handleError = () => {
    if (imageState === 'nba_svg') {
      setImageState('espn_png');
    } else if (imageState === 'espn_png') {
      setImageState('fallback_badge');
    }
  };

  if (imageState === 'fallback_badge' || !currentSrc) {
    return (
      <div
        className={`inline-flex items-center justify-center rounded-full font-mono font-bold text-white shrink-0 ring-1 ring-white/15 shadow-sm ${
          urls.fallbackBgClass
        } ${sizeConfig.container} ${sizeConfig.text} ${className}`}
        title={teamName || teamAbbr}
      >
        {urls.fallbackText.slice(0, 3)}
      </div>
    );
  }

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${sizeConfig.container} ${
        showBadgeBorder ? 'p-0.5 rounded-full bg-[#1E293B]/60 border border-[#1E293B]' : ''
      } ${className}`}
    >
      <img
        src={currentSrc}
        alt={teamName || `Escudo ${teamAbbr}`}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={handleError}
        className="w-full h-full object-contain drop-shadow-sm transition-opacity duration-150"
      />
    </div>
  );
};

export interface NbaPlayerHeadshotProps {
  playerId?: string;
  name: string;
  teamAbbr?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const HEADSHOT_SIZE_MAP: Record<
  NonNullable<NbaPlayerHeadshotProps['size']>,
  { container: string; text: string }
> = {
  xs: { container: 'w-5 h-5', text: 'text-[9px]' },
  sm: { container: 'w-7 h-7', text: 'text-[10px]' },
  md: { container: 'w-9 h-9', text: 'text-xs' },
  lg: { container: 'w-12 h-12', text: 'text-sm' },
};

function extractInitials(fullName: string): string {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'NB';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

export const NbaPlayerHeadshot: React.FC<NbaPlayerHeadshotProps> = ({
  playerId,
  name,
  teamAbbr,
  size = 'sm',
  className = '',
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [playerId]);

  const src = getPlayerHeadshotUrl(playerId);
  const sizeCfg = HEADSHOT_SIZE_MAP[size] || HEADSHOT_SIZE_MAP.sm;
  const teamMeta = teamAbbr ? getTeamLogoUrls(teamAbbr) : null;

  if (!src || failed) {
    return (
      <div
        className={`inline-flex items-center justify-center rounded-full font-mono font-semibold text-white shrink-0 border border-white/15 ${
          teamMeta ? teamMeta.fallbackBgClass : 'bg-slate-800'
        } ${sizeCfg.container} ${sizeCfg.text} ${className}`}
        title={name}
      >
        {extractInitials(name)}
      </div>
    );
  }

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full overflow-hidden bg-[#162033] border border-slate-700/80 shrink-0 ${sizeCfg.container} ${className}`}
      title={name}
    >
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover object-top scale-110 transition-opacity duration-150"
      />
    </div>
  );
};
