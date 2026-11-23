/**
 * Traduce descripciones oficiales de jugadas play-by-play de la NBA al español táctico claro.
 * Libre de dependencias DOM para poder usarse tanto en frontend como en crónicas del servidor.
 */
export function translatePlayDescriptionEs(rawDescription: string): string {
  const cleaned = String(rawDescription || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Canasta decisiva';

  let working = cleaned;
  let assistSegment = '';
  const assistMatch = working.match(/\(([^()]+?)\s+(\d+)\s+AST\)\s*$/i);
  if (assistMatch) {
    assistSegment = ` (Asist. ${assistMatch[1].trim()} · ${assistMatch[2]} AST)`;
    working = working.slice(0, assistMatch.index).trim();
  }

  let ptsSegment = '';
  const ptsMatch = working.match(/\((\d+)\s+PTS\)\s*$/i);
  if (ptsMatch) {
    ptsSegment = ` (${ptsMatch[1]} PTS)`;
    working = working.slice(0, ptsMatch.index).trim();
  }

  const actionMatch = working.match(
    /^(.*?)\s+(?:(\d+')\s+)?((?:away-from-play\s+)?Free Throw\s+\d+\s+of\s+\d+|3PT(?:\s+(?:pullup|step back|bank|running|turnaround|fadeaway))*|(?:(?:turnaround|fadeaway|step back|pullup|driving|running|cutting|tip|putback|alley-oop|floating|bank|finger roll)\s+)*(?:Jump Shot|Layup|DUNK|Hook(?:\s+Shot)?))\s*$/i
  );

  if (!actionMatch) {
    return `${working}${ptsSegment}${assistSegment}`;
  }

  const playerPart = actionMatch[1].trim();
  const distPart = actionMatch[2] ? actionMatch[2].trim() : '';
  const rawAction = actionMatch[3].replace(/\s+/g, ' ').trim();
  const lower = rawAction.toLowerCase();

  let actionEs = rawAction;

  const ftMatch = lower.match(/^(away-from-play\s+)?free throw\s+(\d+)\s+of\s+(\d+)$/);
  if (ftMatch) {
    actionEs = ftMatch[1]
      ? `tiro libre sin balón ${ftMatch[2]} de ${ftMatch[3]}`
      : `tiro libre ${ftMatch[2]} de ${ftMatch[3]}`;
  } else if (lower.startsWith('3pt')) {
    if (lower.includes('pullup') && lower.includes('bank')) {
      actionEs = 'triple a tablero tras bote';
    } else if (lower.includes('step back')) {
      actionEs = 'triple en step-back';
    } else if (lower.includes('pullup')) {
      actionEs = 'triple tras bote';
    } else if (lower.includes('turnaround')) {
      actionEs = 'triple a la media vuelta';
    } else if (lower.includes('fadeaway')) {
      actionEs = 'triple en fadeaway';
    } else if (lower.includes('running')) {
      actionEs = 'triple en carrera';
    } else {
      actionEs = 'triple';
    }
  } else if (lower.includes('jump shot')) {
    if (lower.includes('turnaround') && lower.includes('fadeaway')) {
      actionEs = 'tiro en suspensión a la media vuelta en fadeaway';
    } else if (lower.includes('driving') && lower.includes('floating') && lower.includes('bank')) {
      actionEs = 'bomba a tablero en penetración';
    } else if (lower.includes('driving') && lower.includes('floating')) {
      actionEs = 'bomba en penetración';
    } else if (lower.includes('turnaround')) {
      actionEs = 'tiro en suspensión a la media vuelta';
    } else if (lower.includes('step back')) {
      actionEs = 'tiro en suspensión en step-back';
    } else if (lower.includes('pullup') && lower.includes('bank')) {
      actionEs = 'tiro en suspensión a tablero tras bote';
    } else if (lower.includes('pullup')) {
      actionEs = 'tiro en suspensión tras bote';
    } else if (lower.includes('fadeaway')) {
      actionEs = 'tiro en suspensión en fadeaway';
    } else if (lower.includes('floating')) {
      actionEs = 'bomba en suspensión';
    } else {
      actionEs = 'tiro en suspensión';
    }
  } else if (lower.includes('layup')) {
    if (lower.includes('driving') && lower.includes('finger roll')) {
      actionEs = 'bandeja suave en penetración';
    } else if (lower.includes('driving')) {
      actionEs = 'bandeja en penetración';
    } else if (lower.includes('running')) {
      actionEs = 'bandeja en carrera';
    } else if (lower.includes('cutting')) {
      actionEs = 'bandeja tras corte';
    } else if (lower.includes('tip')) {
      actionEs = 'palmeo bajo el aro';
    } else if (lower.includes('putback')) {
      actionEs = 'bandeja tras rebote ofensivo';
    } else if (lower.includes('alley-oop')) {
      actionEs = 'bandeja en alley-oop';
    } else {
      actionEs = 'bandeja';
    }
  } else if (lower.includes('dunk')) {
    if (lower.includes('alley-oop')) {
      actionEs = 'mate en alley-oop';
    } else if (lower.includes('cutting')) {
      actionEs = 'mate tras corte';
    } else if (lower.includes('driving')) {
      actionEs = 'mate en penetración';
    } else if (lower.includes('putback')) {
      actionEs = 'mate tras rebote ofensivo';
    } else if (lower.includes('running')) {
      actionEs = 'mate en carrera';
    } else if (lower.includes('tip')) {
      actionEs = 'mate en palmeo';
    } else {
      actionEs = 'mate';
    }
  } else if (lower.includes('hook')) {
    actionEs = lower.includes('turnaround') ? 'gancho a la media vuelta' : 'tiro de gancho';
  }

  const distEs = distPart ? ` desde ${distPart}` : '';
  return `${playerPart} · ${actionEs}${distEs}${ptsSegment}${assistSegment}`;
}

/**
 * Versión compacta de acción para integrar dentro de párrafos narrativos sin repetir nombres ni totales.
 */
export function translateHeroicShotActionCompactEs(rawDescription: string): string {
  const full = translatePlayDescriptionEs(rawDescription);
  const dotIdx = full.indexOf(' · ');
  const afterPlayer = dotIdx >= 0 ? full.slice(dotIdx + 3) : full;
  return afterPlayer
    .replace(/\s*\(Asist\.[^)]*\)\s*$/i, '')
    .replace(/\s*\(\d+\s+PTS\)\s*$/i, '')
    .trim();
}
