const DEFAULT_NBA_TEAM_ENTITIES = [
  'Atlanta Hawks',
  'Boston Celtics',
  'Brooklyn Nets',
  'Charlotte Hornets',
  'Chicago Bulls',
  'Cleveland Cavaliers',
  'Dallas Mavericks',
  'Denver Nuggets',
  'Detroit Pistons',
  'Golden State Warriors',
  'Houston Rockets',
  'Indiana Pacers',
  'Los Angeles Clippers',
  'LA Clippers',
  'Los Angeles Lakers',
  'Memphis Grizzlies',
  'Miami Heat',
  'Milwaukee Bucks',
  'Minnesota Timberwolves',
  'New Orleans Pelicans',
  'New York Knicks',
  'Oklahoma City Thunder',
  'Orlando Magic',
  'Philadelphia 76ers',
  'Phoenix Suns',
  'Portland Trail Blazers',
  'Sacramento Kings',
  'San Antonio Spurs',
  'Toronto Raptors',
  'Utah Jazz',
  'Washington Wizards',
  'Trail Blazers',
  'Timberwolves',
  'Cavaliers',
  'Mavericks',
  'Grizzlies',
  'Pelicans',
  'Warriors',
  'Clippers',
  'Celtics',
  'Pistons',
  'Pacers',
  'Raptors',
  'Rockets',
  'Wizards',
  'Hornets',
  'Blazers',
  'Nuggets',
  'Thunder',
  'Knicks',
  'Lakers',
  'Sixers',
  '76ers',
  'Bucks',
  'Bulls',
  'Hawks',
  'Spurs',
  'Kings',
  'Suns',
  'Jazz',
  'Nets',
  'Cavs',
  'Mavs',
  'Wolves',
];

function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const inlineEntityRegexCache = new Map<string, RegExp | null>();

function buildInlineEntityRegex(extraEntities?: string[]): RegExp | null {
  const unique = new Set<string>(DEFAULT_NBA_TEAM_ENTITIES);
  if (Array.isArray(extraEntities)) {
    for (const raw of extraEntities) {
      if (typeof raw !== 'string') continue;
      const cleaned = raw.replace(/\*/g, '').trim();
      if (cleaned.length >= 4) {
        unique.add(cleaned);
      }
    }
  }
  const sorted = Array.from(unique).sort((a, b) => b.length - a.length);
  const cacheKey = sorted.join('\u001f');
  if (inlineEntityRegexCache.has(cacheKey)) {
    return inlineEntityRegexCache.get(cacheKey) ?? null;
  }

  try {
    const escapedEntities = sorted.map(escapeRegExpLiteral);
    const jerseyPlayerPattern =
      "#\\d{1,2}\\s+[A-ZÁÉÍÓÚÑ][\\p{L}.'-]+(?:\\s+(?:[A-ZÁÉÍÓÚÑ][\\p{L}.'-]+|Jr\\.?|Sr\\.?|II|III|IV)){0,3}";

    const entityAlternation =
      escapedEntities.length > 0
        ? `|(?<![\\p{L}\\p{N}])(?:${escapedEntities.join('|')})(?![\\p{L}\\p{N}])`
        : '';

    const compiled = new RegExp(`(${jerseyPlayerPattern}${entityAlternation})`, 'gu');
    if (inlineEntityRegexCache.size >= 32) {
      inlineEntityRegexCache.clear();
    }
    inlineEntityRegexCache.set(cacheKey, compiled);
    return compiled;
  } catch (err) {
    console.warn('Inline entity highlight regex fallback:', err);
    inlineEntityRegexCache.set(cacheKey, null);
    return null;
  }
}

export function renderHighlightedInline(
  text: string | null | undefined,
  highlightEntities?: string[]
) {
  const safeText = typeof text === 'string' ? text : String(text ?? '');
  if (!safeText) return null;

  const entityRegex = buildInlineEntityRegex(highlightEntities);
  const mdParts = safeText.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g);

  return mdParts.map((part, idx) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-bold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={idx} className="italic text-slate-200">
          {part.slice(1, -1)}
        </em>
      );
    }

    if (!entityRegex) {
      return <span key={idx}>{part}</span>;
    }

    const segments = part.split(entityRegex);
    if (segments.length <= 1) {
      return <span key={idx}>{part}</span>;
    }

    return (
      <span key={idx}>
        {segments.map((seg, sIdx) => {
          if (!seg) return null;
          if (sIdx % 2 === 1) {
            return (
              <strong key={sIdx} className="font-semibold text-white">
                {seg}
              </strong>
            );
          }
          return <span key={sIdx}>{seg}</span>;
        })}
      </span>
    );
  });
}

/**
 * Renders magazine-grade editorial paragraphs in homogeneous proportional prose,
 * supporting inline **bold** (players, teams, key tactical ideas) and optional drop cap.
 */
export function renderEditorialParagraphs(
  text: string | null | undefined,
  options?: { dropCap?: boolean; highlightEntities?: string[] }
) {
  const safeText = typeof text === 'string' ? text : String(text ?? '');
  const blocks = safeText
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (blocks.length === 0) return null;

  return (
    <div className="space-y-3.5 text-[14px] sm:text-[15px] leading-[1.76] text-slate-300 w-full">
      {blocks.map((para, pIdx) => (
        <p
          key={pIdx}
          className={`text-justify hyphens-auto ${
            options?.dropCap && pIdx === 0
              ? 'first-letter:float-left first-letter:font-display first-letter:text-3xl sm:first-letter:text-4xl first-letter:font-bold first-letter:leading-none first-letter:mr-2.5 first-letter:mt-1 first-letter:text-orange-400'
              : ''
          }`.trim()}
        >
          {renderHighlightedInline(
            para.replace(/\n/g, ' '),
            options?.highlightEntities
          )}
        </p>
      ))}
    </div>
  );
}
