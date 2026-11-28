import type { ActiveSection } from '../types/nba';

export type PublicSidebarSectionId = Exclude<ActiveSection, 'fantasy_espn'>;

export interface SidebarSectionCatalogItem {
  id: PublicSidebarSectionId;
  defaultLabel: string;
  descriptionEs: string;
  defaultGroupId: string;
}

export interface SidebarMenuGroupConfig {
  id: string;
  label: string;
  itemIds: PublicSidebarSectionId[];
}

export interface SidebarMenuConfigValues {
  groups: SidebarMenuGroupConfig[];
  hiddenIds: PublicSidebarSectionId[];
}

export interface SidebarMenuConfig extends SidebarMenuConfigValues {
  updatedAt: number;
}

export const SIDEBAR_SECTION_CATALOG: SidebarSectionCatalogItem[] = [
  {
    id: 'home',
    defaultLabel: 'Resumen del Día',
    descriptionEs: 'Portada principal con el pulso diario de la liga',
    defaultGroupId: 'today',
  },
  {
    id: 'gameday',
    defaultLabel: 'Analizador de Jornadas',
    descriptionEs: 'Resultados, crónicas, boxscores y actuaciones destacadas',
    defaultGroupId: 'today',
  },
  {
    id: 'injuries',
    defaultLabel: 'Parte de Lesiones',
    descriptionEs: 'Enfermería oficial e impacto en rotaciones',
    defaultGroupId: 'today',
  },
  {
    id: 'anomalies',
    defaultLabel: 'Radar de Anomalías',
    descriptionEs: 'Detección estadística de irrupciones y caídas',
    defaultGroupId: 'radar',
  },
  {
    id: 'streaks',
    defaultLabel: 'Rachas y Consistencia',
    descriptionEs: 'Rachas activas dinámicas y regularidad en pista',
    defaultGroupId: 'radar',
  },
  {
    id: 'milestones',
    defaultLabel: 'Hitos de Temporada',
    descriptionEs: 'Topes de curso, récords de carrera e hitos inminentes',
    defaultGroupId: 'radar',
  },
  {
    id: 'heroic',
    defaultLabel: 'Buzzer Beaters',
    descriptionEs: 'Canastas ganadoras sobre la bocina y clutch',
    defaultGroupId: 'radar',
  },
  {
    id: 'players',
    defaultLabel: 'Jugadores NBA',
    descriptionEs: 'Directorio completo con filtros avanzados y fichas',
    defaultGroupId: 'scouting',
  },
  {
    id: 'teams',
    defaultLabel: 'Equipos NBA',
    descriptionEs: 'Clasificación, ratings y perfiles de las 30 franquicias',
    defaultGroupId: 'scouting',
  },
  {
    id: 'contracts',
    defaultLabel: 'Contratos y Trade Machine',
    descriptionEs: 'Cap Sheets plurianuales, guía CBA y simulador de traspasos',
    defaultGroupId: 'scouting',
  },
  {
    id: 'draft',
    defaultLabel: 'Draft NBA',
    descriptionEs: 'Archivo histórico del Draft (2001–2026) y buscador de camadas',
    defaultGroupId: 'scouting',
  },
  {
    id: 'duel',
    defaultLabel: 'Duelo Directo 1v1',
    descriptionEs: 'Cara a cara entre jugadores o franquicias con radar',
    defaultGroupId: 'scouting',
  },
  {
    id: 'comparator',
    defaultLabel: 'Comparador de Tramos',
    descriptionEs: 'Evolución por fechas o temporadas históricas',
    defaultGroupId: 'scouting',
  },
  {
    id: 'lineups',
    defaultLabel: 'Alineaciones',
    descriptionEs: 'Rendimiento de quintetos, tríos y dúos On/Off',
    defaultGroupId: 'scouting',
  },
  {
    id: 'awards',
    defaultLabel: 'Premios de Temporada',
    descriptionEs: 'Carrera MVP, DPOY, ROY, 6MOY, MIP y Quintetos',
    defaultGroupId: 'lab',
  },
  {
    id: 'scatter',
    defaultLabel: 'Explorador Analítico',
    descriptionEs: 'Dispersión 2D, Campana de Gauss y Matriz 16×16',
    defaultGroupId: 'lab',
  },
  {
    id: 'glossary',
    defaultLabel: 'Glosario y Guía',
    descriptionEs: 'Diccionario didáctico de métricas y uso de la web',
    defaultGroupId: 'lab',
  },
];

export const ALL_PUBLIC_SIDEBAR_SECTION_IDS: PublicSidebarSectionId[] =
  SIDEBAR_SECTION_CATALOG.map((item) => item.id);

const VALID_SECTION_ID_SET = new Set<string>(ALL_PUBLIC_SIDEBAR_SECTION_IDS);

export const DEFAULT_SIDEBAR_MENU_GROUPS: SidebarMenuGroupConfig[] = [
  {
    id: 'today',
    label: 'Hoy en la NBA',
    itemIds: ['home', 'gameday', 'injuries'],
  },
  {
    id: 'radar',
    label: 'Radar y Tendencias',
    itemIds: ['anomalies', 'streaks', 'milestones', 'heroic'],
  },
  {
    id: 'scouting',
    label: 'Scouting y Comparativa',
    itemIds: ['players', 'teams', 'contracts', 'draft', 'duel', 'comparator', 'lineups'],
  },
  {
    id: 'lab',
    label: 'Premios y Laboratorio',
    itemIds: ['awards', 'scatter', 'glossary'],
  },
];

export const DEFAULT_SIDEBAR_MENU_CONFIG_VALUES: SidebarMenuConfigValues = {
  groups: DEFAULT_SIDEBAR_MENU_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    itemIds: [...g.itemIds],
  })),
  hiddenIds: [],
};

export const DEFAULT_SIDEBAR_MENU_CONFIG: SidebarMenuConfig = {
  ...DEFAULT_SIDEBAR_MENU_CONFIG_VALUES,
  updatedAt: 0,
};

export const SIDEBAR_MENU_STORAGE_KEY = 'radarnba_sidebar_menu_config_v1';

function sanitizeGroupId(raw: unknown, fallbackIndex: number): string {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 32);
  return cleaned || `group_${fallbackIndex + 1}`;
}

export function normalizeSidebarMenuConfig(raw: unknown): SidebarMenuConfig {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawGroups = Array.isArray(src.groups) ? src.groups : [];
  const rawHidden = Array.isArray(src.hiddenIds) ? src.hiddenIds : [];

  const assignedSections = new Set<PublicSidebarSectionId>();
  const usedGroupIds = new Set<string>();
  const normalizedGroups: SidebarMenuGroupConfig[] = [];

  for (let i = 0; i < rawGroups.length && normalizedGroups.length < 8; i++) {
    const g = rawGroups[i] as Record<string, unknown> | null;
    if (!g || typeof g !== 'object') continue;
    let gid = sanitizeGroupId(g.id, i);
    if (usedGroupIds.has(gid)) {
      gid = `${gid}_${i + 1}`;
    }
    usedGroupIds.add(gid);

    const rawLabel = typeof g.label === 'string' ? g.label.trim().slice(0, 48) : '';
    const label = rawLabel || `Bloque ${normalizedGroups.length + 1}`;

    const rawItems = Array.isArray(g.itemIds) ? g.itemIds : [];
    const itemIds: PublicSidebarSectionId[] = [];
    for (const candidate of rawItems) {
      if (typeof candidate !== 'string') continue;
      if (!VALID_SECTION_ID_SET.has(candidate)) continue;
      const typedId = candidate as PublicSidebarSectionId;
      if (assignedSections.has(typedId)) continue;
      assignedSections.add(typedId);
      itemIds.push(typedId);
    }

    normalizedGroups.push({ id: gid, label, itemIds });
  }

  // Fallback to default groups if input had none
  if (normalizedGroups.length === 0) {
    for (const defGroup of DEFAULT_SIDEBAR_MENU_GROUPS) {
      normalizedGroups.push({
        id: defGroup.id,
        label: defGroup.label,
        itemIds: [...defGroup.itemIds],
      });
      for (const id of defGroup.itemIds) assignedSections.add(id);
    }
  }

  // Guarantee every valid section exists in some group (forward-compatible with future phases)
  for (const item of SIDEBAR_SECTION_CATALOG) {
    if (assignedSections.has(item.id)) continue;
    const preferredGroup =
      normalizedGroups.find((g) => g.id === item.defaultGroupId) ||
      normalizedGroups[normalizedGroups.length - 1];
    preferredGroup.itemIds.push(item.id);
    assignedSections.add(item.id);
  }

  // Normalize hiddenIds (never allow hiding 'home')
  const hiddenSet = new Set<PublicSidebarSectionId>();
  for (const candidate of rawHidden) {
    if (typeof candidate !== 'string') continue;
    if (candidate === 'home') continue;
    if (!VALID_SECTION_ID_SET.has(candidate)) continue;
    hiddenSet.add(candidate as PublicSidebarSectionId);
  }

  const updatedAt =
    typeof src.updatedAt === 'number' && Number.isFinite(src.updatedAt)
      ? src.updatedAt
      : 0;

  return {
    groups: normalizedGroups,
    hiddenIds: Array.from(hiddenSet),
    updatedAt,
  };
}

export function readLocalSidebarMenuConfig(): SidebarMenuConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_MENU_STORAGE_KEY);
    if (!raw) return null;
    return normalizeSidebarMenuConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeLocalSidebarMenuConfig(config: SidebarMenuConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SIDEBAR_MENU_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage quota / private mode
  }
}
