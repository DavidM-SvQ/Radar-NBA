import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  BookOpen,
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  DollarSign,
  HelpCircle,
  Layers,
  Lock,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Scale,
  Search,
  Shield,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react';
import type {
  ActiveSection,
  CbaSeasonThresholds,
  CbaTeamTier,
  FutureDraftPicksPayload,
  LeagueContractsPayload,
} from '../types/nba';
import {
  formatSalaryCompact,
  formatSalaryExact,
  formatSalaryShort,
  formatSignedSalaryShort,
  getCbaTierVisualMeta,
  getEfficiencyTierMeta,
} from '../utils/contractsClient';
import {
  buildDidacticTradePresets,
  estimateLuxuryTaxBill,
  evaluateMultiTeamTrade,
  type DidacticTradePreset,
} from '../utils/tradeMachineEngine';
import { ExportImageButton } from './ExportImageButton';
import {
  buildTableSnapshotBlob,
  buildTradeMachineSnapshotBlob,
  type TableSnapshotCell,
  type TradeMachineSnapshotAsset,
} from '../utils/exportImageCard';
import { TeamLogo, PlayerAvatar } from './NbaVisuals';

interface ContractsHubViewProps {
  contractsData: LeagueContractsPayload | null;
  futurePicksData?: FutureDraftPicksPayload | null;
  loading: boolean;
  errorMsg: string | null;
  preselectTradeTeamAbbr?: string | null;
  onClearPreselectTradeTeam?: () => void;
  onInspectEntity: (entityType: 'player' | 'team', entityId: string) => void;
  onNavigateSection: (section: ActiveSection) => void;
  onRefresh: () => void;
}

type ContractsTab = 'sheets' | 'guide' | 'trademachine';
type TeamSortMode = 'payroll_desc' | 'payroll_asc' | 'apron_margin' | 'alpha';
type RosterTableView = 'current' | 'multiyear';

const DEFAULT_THRESHOLDS: CbaSeasonThresholds = {
  seasonLabel: '2026-27',
  salaryFloor: 148_465_000,
  salaryCap: 164_961_000,
  luxuryTax: 200_428_000,
  firstApron: 209_015_000,
  secondApron: 221_686_000,
  nonTaxpayerMle: 15_044_000,
  roomMle: 9_366_000,
  taxpayerMle: 6_064_000,
  biAnnualException: 5_477_000,
  rookieMinimum: 1_272_870,
  veteranMinimum: 2_296_274,
  twoWaySalary: 636_435,
};

const CBA_TIER_ORDER: CbaTeamTier[] = [
  'second_apron',
  'first_apron',
  'luxury_tax',
  'over_cap',
  'under_cap',
  'under_floor',
];

const CBA_RULES_MATRIX: Array<{
  tier: CbaTeamTier;
  matchRule: string;
  aggregation: string;
  mleAccess: string;
  signAndTrade: string;
  draftPenalty: string;
}> = [
  {
    tier: 'under_floor',
    matchRule: 'Absorbe hasta el Cap sin igualar salarios',
    aggregation: 'Permitida sin límites',
    mleAccess: 'Cap Space + Room MLE ($9.4M)',
    signAndTrade: 'Permitido recibir y enviar',
    draftPenalty: 'Sin penalización (debe llegar al 90% del Cap)',
  },
  {
    tier: 'under_cap',
    matchRule: 'Absorbe contratos con Cap Space libre',
    aggregation: 'Permitida sin límites',
    mleAccess: 'Cap Space + Room MLE ($9.4M)',
    signAndTrade: 'Permitido recibir y enviar',
    draftPenalty: 'Sin penalización',
  },
  {
    tier: 'over_cap',
    matchRule: '200%+$250K / +$8.5M / 125%+$250K (sin cruzar 1er Apron)',
    aggregation: 'Permitida',
    mleAccess: 'Non-Tax MLE ($15.0M) + BAE ($5.5M)',
    signAndTrade: 'Permitido (activa Hard Cap en 1er Apron)',
    draftPenalty: 'Sin penalización',
  },
  {
    tier: 'luxury_tax',
    matchRule: 'Tramos estándar sin cruzar el 1er Apron al alza',
    aggregation: 'Permitida',
    mleAccess: 'Taxpayer MLE ($6.1M; fija Hard Cap 2º Apron)',
    signAndTrade: 'Restringido si supera el 1er Apron',
    draftPenalty: 'Multa fiscal progresiva por dólar excedido',
  },
  {
    tier: 'first_apron',
    matchRule: '100% estricto (entrante ≤ saliente)',
    aggregation: 'Permitida (sin superar 100%)',
    mleAccess: 'Taxpayer MLE ($6.1M); sin TPE previas',
    signAndTrade: 'Prohibido recibir en Sign-and-Trade',
    draftPenalty: 'No puede fichar cortados (buyouts) con sueldo > Non-Tax MLE',
  },
  {
    tier: 'second_apron',
    matchRule: '100% estricto (entrante ≤ saliente)',
    aggregation: 'Prohibido sumar salarios por 1 contrato mayor',
    mleAccess: 'Solo contratos mínimos (pierde toda MLE)',
    signAndTrade: 'Prohibido enviar efectivo ni usar TPE',
    draftPenalty: 'Congela 1ª ronda a 7 años; cae al pick #30 si repite 3 de 5 años',
  },
];

const CBA_GLOSSARY_ITEMS: Array<{
  code: string;
  title: string;
  explanation: string;
}> = [
  {
    code: 'PO',
    title: 'Player Option (Opción de Jugador)',
    explanation:
      'El jugador decide al final de temporada si continúa un año más por ese salario o sale a la agencia libre.',
  },
  {
    code: 'TO',
    title: 'Team Option (Opción de Equipo)',
    explanation:
      'La franquicia tiene el control para renovar automáticamente el último año o liberar ese espacio salarial.',
  },
  {
    code: 'GTD',
    title: 'Contrato Garantizado',
    explanation:
      'Salario comprometido al 100% en nómina; si el jugador es cortado, sigue contando contra el Salary Cap (Dead Cap).',
  },
  {
    code: 'TWO-WAY',
    title: 'Contrato Dual (NBA / G-League)',
    explanation:
      'Permite hasta 50 partidos de temporada regular NBA sin computar contra el tope salarial ni ocupar plaza estándar.',
  },
  {
    code: 'KICKER',
    title: 'Trade Kicker (Prima de Traspaso)',
    explanation:
      'Bonificación (hasta el 15%) que eleva el salario computable si el jugador es traspasado, dificultando el encaje salarial.',
  },
  {
    code: 'HARD CAP',
    title: 'Tope Duro (Hard Cap)',
    explanation:
      'Techo infranqueable en el 1er o 2º Apron que se activa al usar ciertas excepciones (Non-Tax MLE, BAE o recibir Sign-and-Trade).',
  },
  {
    code: 'TPE',
    title: 'Trade Player Exception',
    explanation:
      'Crédito salarial temporal (1 año) generado al enviar más salario del recibido; inusable si el equipo supera el 1er Apron.',
  },
  {
    code: 'BIRD',
    title: 'Derechos Bird',
    explanation:
      'Permiten a una franquicia renovar a sus propios jugadores tras 3 temporadas superando el Salary Cap sin restricción.',
  },
  {
    code: 'AGREGACIÓN',
    title: 'Agregación de Contratos',
    explanation:
      'Sumar 2 o más contratos salientes para cuadrar el salario de una estrella entrante. Prohibida por completo sobre el 2º Apron.',
  },
];

function formatDeltaStat(value: number, suffix = ''): string {
  const rounded = Math.round(value * 10) / 10;
  if (Math.abs(rounded) < 0.05) return `0.0${suffix}`;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}${suffix}`;
}

export function ContractsHubView({
  contractsData,
  futurePicksData = null,
  loading,
  errorMsg,
  preselectTradeTeamAbbr = null,
  onClearPreselectTradeTeam,
  onInspectEntity,
  onRefresh,
}: ContractsHubViewProps) {
  const [activeTab, setActiveTab] = useState<ContractsTab>('sheets');

  // Tab 1 state: Cap Sheets
  const [confFilter, setConfFilter] = useState<'all' | 'East' | 'West'>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [teamSort, setTeamSort] = useState<TeamSortMode>('payroll_desc');
  const [teamSearch, setTeamSearch] = useState('');
  const [selectedTeamAbbr, setSelectedTeamAbbr] = useState<string>('LAL');
  const [rosterTableView, setRosterTableView] = useState<RosterTableView>('current');
  const [expandedGuideTiers, setExpandedGuideTiers] = useState<Partial<Record<CbaTeamTier, boolean>>>({});

  // Tab 3 state: Trade Machine (2 to 4 teams)
  const [tradeTeamCount, setTradeTeamCount] = useState<2 | 3 | 4>(2);
  const [tradeModeStrict, setTradeModeStrict] = useState<boolean>(true);
  const [tradeTeams, setTradeTeams] = useState<[string, string, string, string]>([
    'LAL',
    'BOS',
    'GSW',
    'MIA',
  ]);
  const [outgoingPlayerIds, setOutgoingPlayerIds] = useState<Record<number, Set<string>>>({
    0: new Set(),
    1: new Set(),
    2: new Set(),
    3: new Set(),
  });
  const [playerDestinations, setPlayerDestinations] = useState<Record<string, number>>({});
  const [outgoingPickIds, setOutgoingPickIds] = useState<Record<number, Set<string>>>({
    0: new Set(),
    1: new Set(),
    2: new Set(),
    3: new Set(),
  });
  const [pickDestinations, setPickDestinations] = useState<Record<string, number>>({});
  const [expandedPicksSlot, setExpandedPicksSlot] = useState<Record<number, boolean>>({
    0: false,
    1: false,
    2: false,
    3: false,
  });
  const [tradeRosterSearch, setTradeRosterSearch] = useState<Record<number, string>>({
    0: '',
    1: '',
    2: '',
    3: '',
  });

  const th = contractsData?.thresholds || DEFAULT_THRESHOLDS;
  const teamsList = contractsData?.teams || [];
  const summary = contractsData?.summary;
  const futurePicksTeams = futurePicksData?.teams || [];

  const selectedTeamSheet = useMemo(() => {
    return (
      teamsList.find((t) => t.teamAbbr === selectedTeamAbbr) ||
      teamsList[0] ||
      null
    );
  }, [teamsList, selectedTeamAbbr]);

  const filteredTeamsForSheets = useMemo(() => {
    const filtered = teamsList.filter((t) => {
      if (confFilter !== 'all' && t.conference !== confFilter) return false;
      if (tierFilter !== 'all' && t.cbaTier !== tierFilter) return false;
      if (teamSearch) {
        const query = teamSearch.toLowerCase();
        const hay = `${t.teamName} ${t.teamAbbr} ${t.division}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });

    const sorted = [...filtered];
    if (teamSort === 'payroll_desc') {
      sorted.sort((a, b) => b.activePayroll - a.activePayroll);
    } else if (teamSort === 'payroll_asc') {
      sorted.sort((a, b) => a.activePayroll - b.activePayroll);
    } else if (teamSort === 'apron_margin') {
      sorted.sort((a, b) => b.distanceToSecondApron - a.distanceToSecondApron);
    } else {
      sorted.sort((a, b) => a.teamName.localeCompare(b.teamName, 'es'));
    }
    return sorted;
  }, [teamsList, confFilter, tierFilter, teamSearch, teamSort]);

  const teamsByCbaTier = useMemo(() => {
    const map: Record<CbaTeamTier, typeof teamsList> = {
      second_apron: [],
      first_apron: [],
      luxury_tax: [],
      over_cap: [],
      under_cap: [],
      under_floor: [],
    };
    for (const t of teamsList) {
      map[t.cbaTier].push(t);
    }
    for (const tier of CBA_TIER_ORDER) {
      map[tier].sort((a, b) => b.activePayroll - a.activePayroll);
    }
    return map;
  }, [teamsList]);

  const tradeEvaluation = useMemo(
    () =>
      evaluateMultiTeamTrade({
        teamCount: tradeTeamCount,
        strictMode: tradeModeStrict,
        tradeTeams,
        outgoingPlayerIds,
        playerDestinations,
        outgoingPickIds,
        pickDestinations,
        futurePicksTeams,
        teamsList,
        thresholds: th,
      }),
    [
      tradeTeamCount,
      tradeModeStrict,
      tradeTeams,
      outgoingPlayerIds,
      playerDestinations,
      outgoingPickIds,
      pickDestinations,
      futurePicksTeams,
      teamsList,
      th,
    ]
  );

  const didacticPresets = useMemo(
    () => buildDidacticTradePresets(teamsList),
    [teamsList]
  );

  const handleClearTrade = () => {
    setOutgoingPlayerIds({
      0: new Set(),
      1: new Set(),
      2: new Set(),
      3: new Set(),
    });
    setPlayerDestinations({});
    setOutgoingPickIds({
      0: new Set(),
      1: new Set(),
      2: new Set(),
      3: new Set(),
    });
    setPickDestinations({});
  };

  const handleChangeTradeTeam = (slotIdx: number, nextAbbr: string) => {
    setTradeTeams((prev) => {
      const copy = [...prev] as [string, string, string, string];
      const existingSlot = copy.findIndex((abbr, idx) => idx !== slotIdx && abbr === nextAbbr);
      const previousAbbr = copy[slotIdx];
      copy[slotIdx] = nextAbbr;
      // Prevent duplicate franchises by swapping cleanly if selected elsewhere
      if (existingSlot !== -1) {
        copy[existingSlot] = previousAbbr;
      }
      return copy;
    });
    setOutgoingPlayerIds((prev) => ({
      ...prev,
      [slotIdx]: new Set(),
    }));
    setOutgoingPickIds((prev) => ({
      ...prev,
      [slotIdx]: new Set(),
    }));
  };

  const handleSwapTwoTeams = () => {
    setTradeTeams((prev) => [prev[1], prev[0], prev[2], prev[3]]);
    setOutgoingPlayerIds((prev) => ({
      ...prev,
      0: new Set(prev[1] || []),
      1: new Set(prev[0] || []),
    }));
    setOutgoingPickIds((prev) => ({
      ...prev,
      0: new Set(prev[1] || []),
      1: new Set(prev[0] || []),
    }));
  };

  const handlePreloadTeamIntoTradeMachine = (abbr: string) => {
    setTradeTeams((prev) => {
      const copy = [...prev] as [string, string, string, string];
      const existingIdx = copy.indexOf(abbr);
      if (existingIdx === 0) return copy;
      if (existingIdx > 0) {
        copy[existingIdx] = copy[0];
        copy[0] = abbr;
      } else {
        copy[0] = abbr;
      }
      return copy;
    });
    handleClearTrade();
    setExpandedPicksSlot((prev) => ({ ...prev, 0: true }));
    setActiveTab('trademachine');
  };

  useEffect(() => {
    if (!preselectTradeTeamAbbr) return;
    handlePreloadTeamIntoTradeMachine(preselectTradeTeamAbbr);
    onClearPreselectTradeTeam?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectTradeTeamAbbr]);

  const handleApplyPreset = (preset: DidacticTradePreset) => {
    setTradeTeamCount(preset.teamCount);
    setTradeModeStrict(preset.strictMode);
    setTradeTeams(preset.teams);
    setOutgoingPlayerIds({
      0: new Set(preset.outgoingByIdx[0] || []),
      1: new Set(preset.outgoingByIdx[1] || []),
      2: new Set(preset.outgoingByIdx[2] || []),
      3: new Set(preset.outgoingByIdx[3] || []),
    });
    setPlayerDestinations({ ...preset.destinations });
    setOutgoingPickIds({ 0: new Set(), 1: new Set(), 2: new Set(), 3: new Set() });
    setPickDestinations({});
    setTradeRosterSearch({ 0: '', 1: '', 2: '', 3: '' });
  };

  const handleExportSnapshot = async () => {
    const dateSlug = new Date().toISOString().slice(0, 10);

    // 1) Trade Machine Dedicated Broadcast PNG Card (with RadarNBA Watermark)
    if (activeTab === 'trademachine') {
      const abbrChain = tradeEvaluation.teamResults.map((r) => r.teamAbbr).join('-');
      const statusLabel = !tradeEvaluation.hasAnyPlayers
        ? 'SIMULADOR LISTO'
        : !tradeModeStrict
        ? 'MODO SANDBOX'
        : tradeEvaluation.isOverallValid
        ? 'VÁLIDO CBA 2026-27'
        : `INVÁLIDO (${tradeEvaluation.totalViolations} INFR.)`;

      const statusTone = !tradeEvaluation.hasAnyPlayers
        ? ('neutral' as const)
        : !tradeModeStrict
        ? ('sky' as const)
        : tradeEvaluation.isOverallValid
        ? ('positive' as const)
        : ('negative' as const);

      return buildTradeMachineSnapshotBlob({
        filename: `radarnba-trade-machine-${abbrChain.toLowerCase()}-${dateSlug}.png`,
        categoryTag: `TRADE MACHINE CBA 2026-27 · ${tradeTeamCount} EQUIPOS`,
        title: `Simulación de Traspaso: ${tradeEvaluation.teamResults.map((r) => r.teamAbbr).join(' ↔ ')}`,
        subtitle: `${tradeModeStrict ? 'Validación Estricta CBA + Regla Stepien' : 'Modo Libre (Sandbox)'} · ${tradeEvaluation.totalPlayersMoved} contrato${tradeEvaluation.totalPlayersMoved === 1 ? '' : 's'}${tradeEvaluation.totalPicksMoved > 0 ? ` · ${tradeEvaluation.totalPicksMoved} ronda${tradeEvaluation.totalPicksMoved === 1 ? '' : 's'} Draft` : ''} · ${formatSalaryCompact(tradeEvaluation.totalSalaryMoved)} movidos`,
        verdictBadgeText: statusLabel,
        verdictBadgeTone: statusTone,
        showWatermark: true,
        kpis: [
          {
            label: 'VEREDICTO CBA',
            value: statusLabel,
            sublabel: tradeModeStrict ? 'Aprons + Emparejamiento + Stepien' : 'Sin restricciones CBA',
            tone: statusTone,
          },
          {
            label: 'ACTIVOS MOVIDOS',
            value:
              tradeEvaluation.totalPicksMoved > 0
                ? `${tradeEvaluation.totalPlayersMoved} jug. · ${tradeEvaluation.totalPicksMoved} picks`
                : `${tradeEvaluation.totalPlayersMoved} jugador${tradeEvaluation.totalPlayersMoved === 1 ? '' : 'es'}`,
            sublabel: `Entre ${tradeTeamCount} franquicias`,
            tone: 'accent',
          },
          {
            label: 'VOLUMEN SALARIAL',
            value: formatSalaryCompact(tradeEvaluation.totalSalaryMoved),
            sublabel: 'Temporada 2026-27',
            tone: 'sky',
          },
        ],
        teams: tradeEvaluation.teamResults.map((res) => {
          const preMeta = getCbaTierVisualMeta(res.preTier);
          const postMeta = getCbaTierVisualMeta(res.postTier);

          const incomingAssets: TradeMachineSnapshotAsset[] = [
            ...res.incomingItems.map((item) => ({
              name: item.player.name,
              meta: item.fromAbbr,
              valueText: formatSalaryShort(item.effectiveIncomingSalary),
              isPick: false,
            })),
            ...res.incomingPicks.map((ip) => ({
              name: `${ip.pick.year} ${ip.pick.round === 1 ? '1ªR' : '2ªR'} · ${ip.pick.summaryEs}`,
              meta: ip.fromAbbr,
              valueText: 'Draft',
              isPick: true,
            })),
          ];

          const outParts: string[] = [];
          if (res.outgoingPlayers.length > 0) {
            outParts.push(
              `${res.outgoingPlayers.length} jug.`
            );
          }
          if (res.outgoingPicks.length > 0) {
            outParts.push(
              `${res.outgoingPicks.length} pick${res.outgoingPicks.length === 1 ? '' : 's'}`
            );
          }
          const outgoingCountLabel =
            outParts.length > 0 ? outParts.join(' + ') : 'Sin salidas';

          const hasPicksDelta =
            res.outgoingPicks.length > 0 || res.incomingPicks.length > 0;
          const picksBalanceText = hasPicksDelta
            ? `Balance Draft: 1ªR ${res.netFirstRoundDelta > 0 ? `+${res.netFirstRoundDelta}` : res.netFirstRoundDelta} · 2ªR ${res.netSecondRoundDelta > 0 ? `+${res.netSecondRoundDelta}` : res.netSecondRoundDelta}`
            : undefined;

          return {
            teamAbbr: res.teamAbbr,
            teamName: res.teamName,
            preTierLabel: preMeta.shortLabel,
            postTierLabel: postMeta.shortLabel,
            tierChanged: res.preTier !== res.postTier,
            postPayrollText: formatSalaryShort(res.postPayroll),
            salaryDeltaText: formatSignedSalaryShort(res.salaryDelta),
            salaryDeltaTone:
              res.salaryDelta < -500_000
                ? 'positive'
                : res.salaryDelta > 500_000
                ? 'warning'
                : 'neutral',
            taxDeltaText:
              res.taxBillDelta === 0 ? '$0' : formatSignedSalaryShort(res.taxBillDelta),
            taxDeltaTone:
              res.taxBillDelta < 0
                ? 'positive'
                : res.taxBillDelta > 0
                ? 'negative'
                : 'muted',
            isValid: res.isCbaValid,
            statusLabel: res.isCbaValid
              ? tradeModeStrict
                ? 'VÁLIDO CBA'
                : 'SANDBOX'
              : 'INVÁLIDO CBA',
            incomingAssets,
            outgoingCountLabel,
            outgoingSalaryText: formatSalaryShort(res.totalOutgoingSalary),
            picksBalanceText,
            ptsDeltaText: formatDeltaStat(res.ptsDelta),
            ptsDeltaTone:
              res.ptsDelta >= 0.5
                ? 'positive'
                : res.ptsDelta <= -0.5
                ? 'negative'
                : 'neutral',
            rebDeltaText: formatDeltaStat(res.rebDelta),
            astDeltaText: formatDeltaStat(res.astDelta),
            impactDeltaText: formatDeltaStat(res.impactDelta),
            impactDeltaTone:
              res.impactDelta >= 0.5
                ? 'positive'
                : res.impactDelta <= -0.5
                ? 'negative'
                : 'neutral',
            primaryViolation: res.violationsEs[0],
          };
        }),
        editorialVerdict: tradeEvaluation.editorialVerdictEs,
        editorialVerdictTone: statusTone,
      });
    }

    // 2) Team Cap Sheet PNG Export Card
    if (activeTab === 'sheets' && selectedTeamSheet) {
      const roster = selectedTeamSheet.players.slice(0, 18);
      const tierMeta = getCbaTierVisualMeta(selectedTeamSheet.cbaTier);
      return buildTableSnapshotBlob({
        filename: `radarnba-nomina-${selectedTeamSheet.teamAbbr.toLowerCase()}-${dateSlug}.png`,
        categoryTag: 'NÓMINAS Y CAP SHEETS NBA 2026-27',
        title: `${selectedTeamSheet.teamName} — Radiografía Salarial CBA`,
        subtitle: `Masa salarial activa: ${formatSalaryExact(selectedTeamSheet.activePayroll)} (${tierMeta.labelEs})`,
        entityColumnLabel: 'JUGADOR',
        entityColumnWeight: 2.2,
        kpis: [
          {
            label: 'MASA SALARIAL',
            value: formatSalaryCompact(selectedTeamSheet.activePayroll),
            sublabel: `${selectedTeamSheet.capPct}% del Salary Cap`,
            tone: 'accent',
          },
          {
            label: 'DISTANCIA 2º APRON',
            value: formatSalaryCompact(selectedTeamSheet.distanceToSecondApron),
            sublabel:
              selectedTeamSheet.distanceToSecondApron >= 0
                ? 'Margen disponible'
                : 'Exceso sobre 2º Apron',
            tone: selectedTeamSheet.distanceToSecondApron >= 0 ? 'positive' : 'negative',
          },
          {
            label: 'CONTRATOS ACTIVOS',
            value: `${selectedTeamSheet.rosterCount} jugadores`,
            sublabel: `${selectedTeamSheet.twoWayCount} two-way`,
            tone: 'neutral',
          },
        ],
        columns: [
          { key: 'sal', label: 'SALARIO 26-27', align: 'right', widthWeight: 1.0 },
          { key: 'cap', label: '% CAP', align: 'right', widthWeight: 0.7 },
          { key: 'rem', label: 'REST.', align: 'right', widthWeight: 0.7 },
          { key: 'eff', label: 'EFICIENCIA', align: 'right', widthWeight: 1.0 },
        ],
        rows: roster.map((p, idx) => {
          const effMeta = getEfficiencyTierMeta(p.efficiencyTier);
          const cells: Record<string, TableSnapshotCell> = {
            sal: { text: formatSalaryShort(p.salary) },
            cap: { text: `${p.capPct}%` },
            rem: { text: `${p.yearsRemaining}a (${p.optionType})` },
            eff: {
              text: effMeta.label,
              tone: p.efficiencyTier === 'ganga' ? 'positive' : 'neutral',
            },
          };
          return {
            rank: idx + 1,
            teamAbbr: selectedTeamSheet.teamAbbr,
            entityName: p.name,
            entitySubtext: `${p.position} · Impacto ${p.sportingImpactScore}`,
            cells,
          };
        }),
        editorialVerdict: `${selectedTeamSheet.teamName} sitúa su masa salarial en ${formatSalaryCompact(selectedTeamSheet.activePayroll)} (${tierMeta.labelEs}) con ${selectedTeamSheet.officialContractsCount} contratos oficiales verificados.`,
      });
    }

    // 3) Guide / League Overview PNG Export Card
    const topTeams = [...teamsList]
      .sort((a, b) => b.activePayroll - a.activePayroll)
      .slice(0, 15);
    return buildTableSnapshotBlob({
      filename: `radarnba-mapa-cba-liga-${dateSlug}.png`,
      categoryTag: 'MAPA SALARIAL Y APRONS CBA 2026-27',
      title: 'Radiografía Financiera de la NBA (Top 15 Nóminas)',
      subtitle: `Salary Cap: ${formatSalaryCompact(th.salaryCap)} · Luxury Tax: ${formatSalaryCompact(th.luxuryTax)} · 1er Apron: ${formatSalaryCompact(th.firstApron)} · 2º Apron: ${formatSalaryCompact(th.secondApron)}`,
      entityColumnLabel: 'FRANQUICIA',
      entityColumnWeight: 2.0,
      kpis: [
        {
          label: 'MEDIA LIGA',
          value: formatSalaryCompact(summary?.avgTeamPayroll || 0),
          sublabel: 'Por franquicia',
          tone: 'accent',
        },
        {
          label: 'MÁS ALTA',
          value: topTeams[0]?.teamAbbr || '—',
          sublabel: formatSalaryCompact(topTeams[0]?.activePayroll || 0),
          tone: 'negative',
        },
        {
          label: 'SOBRE 2º APRON',
          value: `${summary?.tierCounts.second_apron || 0} equipos`,
          sublabel: 'Restricción máxima',
          tone: 'warning',
        },
      ],
      columns: [
        { key: 'payroll', label: 'NÓMINA', align: 'right', widthWeight: 1.0 },
        { key: 'capPct', label: '% CAP', align: 'right', widthWeight: 0.75 },
        { key: 'tier', label: 'SITUACIÓN CBA', align: 'left', widthWeight: 1.4 },
      ],
      rows: topTeams.map((t, idx) => {
        const tierMeta = getCbaTierVisualMeta(t.cbaTier);
        const cells: Record<string, TableSnapshotCell> = {
          payroll: { text: formatSalaryShort(t.activePayroll) },
          capPct: { text: `${t.capPct}%` },
          tier: {
            text: tierMeta.labelEs,
            tone: t.cbaTier === 'second_apron' ? 'negative' : 'neutral',
          },
        };
        return {
          rank: idx + 1,
          teamAbbr: t.teamAbbr,
          entityName: t.teamName,
          entitySubtext: `${t.rosterCount} jugadores · ${t.conference}`,
          cells,
        };
      }),
      editorialVerdict: `La liga suma ${summary?.tierCounts.second_apron || 0} franquicias sobre el 2º Apron, ${summary?.tierCounts.first_apron || 0} en el 1er Apron y ${(summary?.tierCounts.under_cap || 0) + (summary?.tierCounts.under_floor || 0)} bajo el Salary Cap.`,
    });
  };

  if (loading && !contractsData) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-[#1E293B]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="p-4 space-y-2 animate-pulse">
              <div className="h-3 w-28 bg-[#1E293B] rounded" />
              <div className="h-7 w-16 bg-[#1E293B] rounded" />
              <div className="h-3 w-36 bg-[#1E293B] rounded" />
            </div>
          ))}
        </div>
        <div className="h-96 bg-[#131C2E] border border-[#1E293B] rounded-lg p-6 animate-pulse" />
      </div>
    );
  }

  if (errorMsg && !contractsData) {
    return (
      <div className="bg-[#131C2E] border border-rose-500/30 rounded-lg p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              No se pudieron cargar los contratos y nóminas NBA
            </h2>
            <p className="text-xs text-slate-400 mt-1">{errorMsg}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-400 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Reintentar
        </button>
      </div>
    );
  }

  const thermometerMax = th.secondApron * 1.15;
  const pctOfBar = (val: number) => Math.min(100, Math.max(0, (val / thermometerMax) * 100));
  const selectedTeamTaxBill = selectedTeamSheet
    ? estimateLuxuryTaxBill(selectedTeamSheet.activePayroll, th)
    : 0;

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
            <DollarSign className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Convenio Colectivo CBA 2023</span>
            <span aria-hidden="true">·</span>
            <span>Temporada 2026–27</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Cap {formatSalaryShort(th.salaryCap)} / Tax {formatSalaryShort(th.luxuryTax)} / 2º Apron {formatSalaryShort(th.secondApron)}
            </span>
          </div>
          <h2 className="font-display text-xl md:text-2xl font-bold text-slate-100 mt-1">
            Contratos, Límites Salariales y Trade Machine
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Nóminas plurianuales oficiales de las 30 franquicias, guía interactiva de Aprons y simulador de traspasos (2 a 4 equipos) con validación real del CBA y exportación PNG.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="h-9 px-3 rounded-lg bg-[#131C2E] border border-[#1E293B] hover:border-orange-500/50 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar datos
          </button>
          <ExportImageButton onBuildImage={handleExportSnapshot} />
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-[#131C2E] border border-[#1E293B] rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-[#1E293B]">
        <div className="p-4">
          <div className="text-xs text-slate-400">Nómina media de liga</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-2xl font-bold text-emerald-400">
              {formatSalaryShort(summary?.avgTeamPayroll || 0)}
            </span>
            <span className="text-xs text-slate-400">por equipo</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
            {summary?.officialContractsCount || 0} oficiales · {summary?.totalPlayers || 0} contratos
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400">Equipos sobre el 2º Apron</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-2xl font-bold text-rose-400">
              {summary?.tierCounts.second_apron || 0}
            </span>
            <span className="text-xs text-slate-400">franquicias</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Match 100% estricto y sin agregación
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400">Equipos en Impuesto de Lujo</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-2xl font-bold text-amber-300">
              {(summary?.tierCounts.luxury_tax || 0) +
                (summary?.tierCounts.first_apron || 0) +
                (summary?.tierCounts.second_apron || 0)}
            </span>
            <span className="text-xs text-slate-400">pagadores</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
            Por encima de {formatSalaryShort(th.luxuryTax)}
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400">Equipos bajo el Salary Cap</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-2xl font-bold text-sky-300">
              {(summary?.tierCounts.under_cap || 0) +
                (summary?.tierCounts.under_floor || 0)}
            </span>
            <span className="text-xs text-slate-400">con Cap Space</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Capacidad directa para absorber salarios
          </div>
        </div>
      </div>

      {/* Hub Tabs Navigation */}
      <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-3">
        <div className="inline-flex items-center gap-1.5 p-1 bg-[#0B1120] border border-[#1E293B] rounded-lg overflow-x-auto max-w-full">
          {[
            { id: 'sheets', label: 'Nóminas y Cap Sheets (30 Equipos)', icon: Layers },
            { id: 'guide', label: 'Guía Visual CBA y Aprons', icon: HelpCircle },
            { id: 'trademachine', label: 'Trade Machine (2–4 Equipos)', icon: ArrowLeftRight },
          ].map((tab) => {
            const active = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as ContractsTab)}
                className={`h-9 px-4 rounded-md text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-orange-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: CAP SHEETS & TEAM NOMINAS */}
      {/* ========================================================================= */}
      {activeTab === 'sheets' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Team Selector List */}
          <div className="lg:col-span-4 bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Shield className="w-4 h-4 text-orange-400" />
                Franquicias NBA ({filteredTeamsForSheets.length})
              </h3>
              <select
                aria-label="Ordenar franquicias"
                value={teamSort}
                onChange={(e) => setTeamSort(e.target.value as TeamSortMode)}
                className="h-7 px-2 rounded-md bg-[#0B1120] border border-[#1E293B] text-[11px] text-slate-300 focus:outline-none focus:border-orange-500/60"
              >
                <option value="payroll_desc">Mayor nómina</option>
                <option value="payroll_asc">Menor nómina</option>
                <option value="apron_margin">Margen 2º Apron</option>
                <option value="alpha">A–Z</option>
              </select>
            </div>

            <div className="space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  placeholder="Buscar equipo o división..."
                  className="w-full h-9 pl-8 pr-3 rounded-lg bg-[#0B1120] border border-[#1E293B] text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500/60"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  aria-label="Filtrar por conferencia"
                  value={confFilter}
                  onChange={(e) => setConfFilter(e.target.value as 'all' | 'East' | 'West')}
                  className="flex-1 h-8 px-2 rounded-lg bg-[#0B1120] border border-[#1E293B] text-xs text-slate-200 focus:outline-none focus:border-orange-500/60"
                >
                  <option value="all">Ambas conf.</option>
                  <option value="East">Este</option>
                  <option value="West">Oeste</option>
                </select>

                <select
                  aria-label="Filtrar por situación CBA"
                  value={tierFilter}
                  onChange={(e) => setTierFilter(e.target.value)}
                  className="flex-1 h-8 px-2 rounded-lg bg-[#0B1120] border border-[#1E293B] text-xs text-slate-200 focus:outline-none focus:border-orange-500/60"
                >
                  <option value="all">Todas situaciones</option>
                  <option value="second_apron">Sobre 2º Apron</option>
                  <option value="first_apron">Sobre 1er Apron</option>
                  <option value="luxury_tax">Impuesto de Lujo</option>
                  <option value="over_cap">Sobre el Cap</option>
                  <option value="under_cap">Bajo el Cap</option>
                  <option value="under_floor">Bajo Suelo</option>
                </select>
              </div>
            </div>

            <div className="overflow-y-auto max-h-[620px] space-y-1 pr-1 divide-y divide-[#1E293B]/40">
              {filteredTeamsForSheets.map((t) => {
                const isSelected = selectedTeamSheet?.teamAbbr === t.teamAbbr;
                const tierMeta = getCbaTierVisualMeta(t.cbaTier);
                return (
                  <button
                    key={t.teamAbbr}
                    type="button"
                    onClick={() => setSelectedTeamAbbr(t.teamAbbr)}
                    className={`w-full py-2.5 px-3 rounded-lg flex items-center justify-between gap-3 text-left transition-colors ${
                      isSelected
                        ? 'bg-orange-500/15 border border-orange-500/40 text-white'
                        : 'hover:bg-[#182338] text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <TeamLogo
                        abbr={t.teamAbbr}
                        teamId={t.teamId}
                        logoUrl={t.logoUrl}
                        size="sm"
                        framed
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-100 truncate">
                          {t.teamName}
                        </div>
                        <div className={`text-[11px] font-medium ${tierMeta.textClass}`}>
                          {tierMeta.shortLabel}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono tabular-nums text-xs font-bold text-slate-200">
                        {formatSalaryShort(t.activePayroll)}
                      </div>
                      <div className="font-mono tabular-nums text-[10px] text-slate-400">
                        {t.capPct}% Cap
                      </div>
                    </div>
                  </button>
                );
              })}
              {filteredTeamsForSheets.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400">
                  Ninguna franquicia coincide con estos filtros.
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Selected Team Detailed Cap Sheet */}
          <div className="lg:col-span-8 bg-[#131C2E] border border-[#1E293B] rounded-lg p-5 space-y-5">
            {selectedTeamSheet ? (
              <>
                {/* Team Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1E293B]">
                  <div className="flex items-center gap-3.5">
                    <TeamLogo
                      abbr={selectedTeamSheet.teamAbbr}
                      teamId={selectedTeamSheet.teamId}
                      logoUrl={selectedTeamSheet.logoUrl}
                      size="lg"
                      framed
                    />
                    <div>
                      <h3 className="font-display text-lg font-bold text-slate-100">
                        {selectedTeamSheet.teamName}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 flex-wrap">
                        <span>{selectedTeamSheet.conference} · {selectedTeamSheet.division}</span>
                        <span aria-hidden="true">·</span>
                        <span className={`font-semibold ${getCbaTierVisualMeta(selectedTeamSheet.cbaTier).textClass}`}>
                          {getCbaTierVisualMeta(selectedTeamSheet.cbaTier).labelEs}
                        </span>
                        {selectedTeamTaxBill > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums text-amber-300">
                              Impuesto est.: {formatSalaryCompact(selectedTeamTaxBill)}
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {getCbaTierVisualMeta(selectedTeamSheet.cbaTier).summaryEs}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handlePreloadTeamIntoTradeMachine(selectedTeamSheet.teamAbbr)}
                      className="h-9 px-3.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      Simular traspaso
                    </button>
                    <button
                      type="button"
                      onClick={() => onInspectEntity('team', selectedTeamSheet.teamId)}
                      className="h-9 px-3 rounded-lg bg-[#0B1120] border border-[#1E293B] hover:border-slate-500 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      Dossier Franquicia
                    </button>
                  </div>
                </div>

                {/* Visual Salary Thermometer Bar with Real Proportional Markers */}
                <div className="space-y-2.5 bg-[#0B1120] border border-[#1E293B] rounded-lg p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                    <span className="font-semibold text-slate-200">
                      Termómetro Salarial 2026–27 · Masa Activa:{' '}
                      <span className="font-mono tabular-nums text-white">
                        {formatSalaryExact(selectedTeamSheet.activePayroll)}
                      </span>
                    </span>
                    <span className="font-mono tabular-nums text-slate-400">
                      {selectedTeamSheet.distanceToSecondApron >= 0
                        ? `Margen hasta 2º Apron: ${formatSalaryShort(selectedTeamSheet.distanceToSecondApron)}`
                        : `Exceso sobre 2º Apron: +${formatSalaryShort(Math.abs(selectedTeamSheet.distanceToSecondApron))}`}
                    </span>
                  </div>

                  {/* Multi-tier bar with threshold lines */}
                  <div className="relative h-4 bg-[#1E293B] rounded-full overflow-hidden">
                    <div
                      className={`absolute top-0 left-0 h-full transition-all duration-500 ${
                        selectedTeamSheet.activePayroll >= th.secondApron
                          ? 'bg-rose-500'
                          : selectedTeamSheet.activePayroll >= th.firstApron
                          ? 'bg-orange-500'
                          : selectedTeamSheet.activePayroll >= th.luxuryTax
                          ? 'bg-amber-400'
                          : selectedTeamSheet.activePayroll >= th.salaryCap
                          ? 'bg-sky-400'
                          : 'bg-emerald-400'
                      }`}
                      style={{ width: `${pctOfBar(selectedTeamSheet.activePayroll)}%` }}
                    />
                    {[
                      { val: th.salaryCap, color: 'bg-emerald-200/80', label: 'Salary Cap' },
                      { val: th.luxuryTax, color: 'bg-amber-200/90', label: 'Luxury Tax' },
                      { val: th.firstApron, color: 'bg-orange-300/90', label: '1er Apron' },
                      { val: th.secondApron, color: 'bg-rose-300', label: '2º Apron' },
                    ].map((marker) => (
                      <div
                        key={marker.label}
                        title={`${marker.label}: ${formatSalaryShort(marker.val)}`}
                        className={`absolute top-0 bottom-0 w-0.5 ${marker.color}`}
                        style={{ left: `${pctOfBar(marker.val)}%` }}
                      />
                    ))}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] font-mono tabular-nums pt-0.5">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Suelo (90%)</span>
                      <span className="text-teal-300">{formatSalaryShort(th.salaryFloor)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Salary Cap</span>
                      <span className="text-emerald-400">{formatSalaryShort(th.salaryCap)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Luxury Tax</span>
                      <span className="text-amber-300">{formatSalaryShort(th.luxuryTax)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">1er Apron</span>
                      <span className="text-orange-400">{formatSalaryShort(th.firstApron)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">2º Apron</span>
                      <span className="text-rose-400">{formatSalaryShort(th.secondApron)}</span>
                    </div>
                  </div>
                </div>

                {/* Available Exceptions & Horizon Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-3.5 space-y-2">
                    <div className="text-xs font-semibold text-slate-200">
                      Excepciones y Herramientas Disponibles
                    </div>
                    {selectedTeamSheet.availableExceptions.map((ex) => (
                      <div key={ex.code} className="text-xs space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-emerald-400">{ex.labelEs}</span>
                          <span className="font-mono tabular-nums font-bold text-slate-200">
                            {formatSalaryShort(ex.amount)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">{ex.noteEs}</p>
                      </div>
                    ))}
                  </div>

                  <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-3.5 space-y-2">
                    <div className="text-xs font-semibold text-slate-200">
                      Horizontes de Nómina Plurianual
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono tabular-nums">
                      {(
                        [
                          ['26-27', selectedTeamSheet.futurePayroll['2026-27']],
                          ['27-28', selectedTeamSheet.futurePayroll['2027-28']],
                          ['28-29', selectedTeamSheet.futurePayroll['2028-29']],
                          ['29-30', selectedTeamSheet.futurePayroll['2029-30']],
                        ] as const
                      ).map(([seasonLbl, val]) => (
                        <div key={seasonLbl} className="p-2 rounded bg-[#131C2E] border border-[#1E293B]/60">
                          <div className="text-[10px] text-slate-400">{seasonLbl}</div>
                          <div className="font-bold text-slate-100 mt-0.5">
                            {formatSalaryShort(val)}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="text-[11px] text-slate-400 pt-1">
                      {selectedTeamSheet.expiringCount} contratos expiran en 2027 · {selectedTeamSheet.standardContractsCount} estándar · {selectedTeamSheet.twoWayCount} two-way
                    </div>
                  </div>
                </div>

                {/* Player Salary Table with Current vs Multi-Year Switch */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">
                        Plantilla y Contratos ({selectedTeamSheet.players.length} jugadores)
                      </h4>
                      <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                        {selectedTeamSheet.officialContractsCount} oficiales · {selectedTeamSheet.estimatedContractsCount} estimados
                      </span>
                    </div>

                    <div
                      className="inline-flex items-center gap-1 p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg self-start sm:self-auto"
                      role="group"
                      aria-label="Vista de tabla salarial"
                    >
                      <button
                        type="button"
                        onClick={() => setRosterTableView('current')}
                        aria-pressed={rosterTableView === 'current'}
                        className={`h-7 px-3 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                          rosterTableView === 'current'
                            ? 'bg-orange-500 text-slate-950'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Vista 26–27 y Eficiencia
                      </button>
                      <button
                        type="button"
                        onClick={() => setRosterTableView('multiyear')}
                        aria-pressed={rosterTableView === 'multiyear'}
                        className={`h-7 px-3 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                          rosterTableView === 'multiyear'
                            ? 'bg-orange-500 text-slate-950'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        <Calendar className="w-3 h-3" />
                        Plurianual (26–30)
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    {rosterTableView === 'current' ? (
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="text-xs text-slate-400 border-b border-[#1E293B]">
                            <th className="py-2.5 px-3 font-medium">Jugador</th>
                            <th className="py-2.5 px-2 text-center font-medium">Pos</th>
                            <th className="py-2.5 px-2 text-right font-medium">Salario 26-27</th>
                            <th className="py-2.5 px-2 text-right font-medium">% Cap</th>
                            <th className="py-2.5 px-2 text-center font-medium">Cláusula</th>
                            <th className="py-2.5 px-2 text-center font-medium">Eficiencia</th>
                            <th className="py-2.5 px-3 text-right font-medium">Ficha</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1E293B]/60 text-xs">
                          {selectedTeamSheet.players.map((p) => {
                            const effMeta = getEfficiencyTierMeta(p.efficiencyTier);
                            return (
                              <tr key={p.id} className="hover:bg-[#182338]/60 transition-colors">
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-2.5">
                                    <PlayerAvatar
                                      playerId={p.playerId}
                                      name={p.name}
                                      headshotUrl={p.headshotUrl}
                                      teamAbbr={selectedTeamSheet.teamAbbr}
                                      size="sm"
                                    />
                                    <div>
                                      {p.playerId ? (
                                        <button
                                          type="button"
                                          onClick={() => onInspectEntity('player', p.playerId!)}
                                          className="font-semibold text-slate-100 hover:text-orange-300 text-left"
                                        >
                                          {p.name}
                                        </button>
                                      ) : (
                                        <span className="font-semibold text-slate-200">{p.name}</span>
                                      )}
                                      <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                                        {p.gamesPlayed} PJ · {p.pointsPg.toFixed(1)} PTS · {p.minutesPg.toFixed(1)} MIN
                                      </div>
                                    </div>
                                  </div>
                                </td>

                                <td className="py-2.5 px-2 text-center text-slate-300 font-mono">
                                  {p.position}
                                </td>

                                <td className="py-2.5 px-2 text-right font-mono tabular-nums font-bold text-slate-100">
                                  {formatSalaryShort(p.salary)}
                                </td>

                                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-300">
                                  {p.capPct}%
                                </td>

                                <td className="py-2.5 px-2 text-center">
                                  <div className="text-[11px] font-mono text-slate-300 space-x-1.5">
                                    <span className="font-semibold text-slate-200">
                                      {p.yearsRemaining}a · {p.optionType}
                                    </span>
                                    {p.tradeKickerPct > 0 && (
                                      <span className="text-amber-300" title="Trade Kicker activo">
                                        +{p.tradeKickerPct}% TK
                                      </span>
                                    )}
                                    {p.tradeRestriction && (
                                      <span className="text-rose-300" title="Restricción temporal de traspaso">
                                        NTC/Rest.
                                      </span>
                                    )}
                                    {p.dataQuality !== 'official_espn' && (
                                      <span className="text-slate-500" title="Contrato estimado por convenio">
                                        Est.
                                      </span>
                                    )}
                                  </div>
                                </td>

                                <td className="py-2.5 px-2 text-center">
                                  <span className={`font-medium ${effMeta.textClass}`}>
                                    {effMeta.label}
                                  </span>
                                </td>

                                <td className="py-2.5 px-3 text-right">
                                  {p.playerId && (
                                    <button
                                      type="button"
                                      onClick={() => onInspectEntity('player', p.playerId!)}
                                      className="h-7 px-2.5 rounded bg-[#0B1120] border border-[#1E293B] hover:border-orange-500 text-[11px] font-medium text-slate-200 transition-colors whitespace-nowrap"
                                    >
                                      Inspeccionar
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="text-xs text-slate-400 border-b border-[#1E293B]">
                            <th className="py-2.5 px-3 font-medium">Jugador</th>
                            <th className="py-2.5 px-2 text-right font-medium font-mono">2026-27</th>
                            <th className="py-2.5 px-2 text-right font-medium font-mono">2027-28</th>
                            <th className="py-2.5 px-2 text-right font-medium font-mono">2028-29</th>
                            <th className="py-2.5 px-2 text-right font-medium font-mono">2029-30</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1E293B]/60 text-xs">
                          {selectedTeamSheet.players.map((p) => {
                            const seasons = ['2026-27', '2027-28', '2028-29', '2029-30'] as const;
                            return (
                              <tr key={p.id} className="hover:bg-[#182338]/60 transition-colors">
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-2">
                                    <PlayerAvatar
                                      playerId={p.playerId}
                                      name={p.name}
                                      headshotUrl={p.headshotUrl}
                                      teamAbbr={selectedTeamSheet.teamAbbr}
                                      size="sm"
                                    />
                                    <div>
                                      {p.playerId ? (
                                        <button
                                          type="button"
                                          onClick={() => onInspectEntity('player', p.playerId!)}
                                          className="font-semibold text-slate-100 hover:text-orange-300 text-left"
                                        >
                                          {p.name}
                                        </button>
                                      ) : (
                                        <span className="font-semibold text-slate-200">{p.name}</span>
                                      )}
                                      <div className="text-[10px] text-slate-400">
                                        {p.position} · {p.yearsRemaining} año{p.yearsRemaining === 1 ? '' : 's'}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                {seasons.map((seasonKey) => {
                                  const slot = p.yearlySalaries?.find((s) => s.season === seasonKey);
                                  const sal = slot?.salary ?? null;
                                  const opt = slot?.option;
                                  const optColor =
                                    opt === 'PO'
                                      ? 'text-sky-300'
                                      : opt === 'TO'
                                      ? 'text-emerald-400'
                                      : opt === 'TWO_WAY'
                                      ? 'text-amber-300'
                                      : 'text-slate-500';
                                  return (
                                    <td
                                      key={seasonKey}
                                      className="py-2.5 px-2 text-right font-mono tabular-nums"
                                    >
                                      {sal !== null && sal > 0 ? (
                                        <div>
                                          <div
                                            className={`font-semibold ${
                                              seasonKey === '2026-27'
                                                ? 'text-slate-100'
                                                : 'text-slate-300'
                                            }`}
                                          >
                                            {formatSalaryShort(sal)}
                                          </div>
                                          {opt && opt !== 'GTD' && (
                                            <div className={`text-[10px] font-semibold ${optColor}`}>
                                              {opt === 'TWO_WAY' ? '2W' : opt}
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-slate-600">—</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-10 text-center text-xs text-slate-400">
                Selecciona una franquicia para ver su Cap Sheet detallado.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: VISUAL DIDACTIC CBA & APRONS GUIDE */}
      {/* ========================================================================= */}
      {activeTab === 'guide' && (
        <div className="space-y-6">
          {/* Intro Header */}
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-5 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-base font-display font-bold text-slate-100 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-orange-400 shrink-0" />
                Guía Didáctica del Convenio Colectivo CBA 2023 (Temporada 2026–27)
              </h3>
              <button
                type="button"
                onClick={() => setActiveTab('trademachine')}
                className="h-8 px-3 rounded-lg bg-orange-500 hover:bg-orange-400 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5 self-start sm:self-auto whitespace-nowrap"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Probar reglas en Trade Machine
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">
              El convenio NBA divide a las 30 franquicias en seis escalones salariales. Cada línea que cruza un equipo activa nuevas herramientas o restricciones estrictas en traspasos, excepciones de agencia libre y rondas futuras del Draft. Haz clic en cualquier equipo del mapa para abrir su nómina detallada.
            </p>
          </div>

          {/* 6 Escalones CBA Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                tier: 'under_floor' as CbaTeamTier,
                range: `< ${formatSalaryShort(th.salaryFloor)}`,
                headline: 'Reconstrucción y Espacio Máximo',
                body: 'Por debajo del 90% del Salary Cap. Pueden absorber grandes contratos a cambio de rondas de Draft, pero deben alcanzar el suelo salarial al final del curso para cobrar su parte del reparto del impuesto de lujo.',
              },
              {
                tier: 'under_cap' as CbaTeamTier,
                range: `${formatSalaryShort(th.salaryFloor)} – ${formatSalaryShort(th.salaryCap)}`,
                headline: 'Flexibilidad Directa (Cap Space)',
                body: 'Operan con espacio libre bajo el tope salarial. Pueden firmar agentes libres directamente, absorber contratos sin devolver salario equivalente y disponen de la Room MLE ($9.4M) tras agotar su margen.',
              },
              {
                tier: 'over_cap' as CbaTeamTier,
                range: `${formatSalaryShort(th.salaryCap)} – ${formatSalaryShort(th.luxuryTax)}`,
                headline: 'Zona Competitiva sin Impuesto',
                body: 'Superan el tope gracias a derechos Bird y renovaciones, pero no pagan multa fiscal. Tienen acceso pleno a la Non-Taxpayer MLE ($15.0M) y a la Bi-Annual Exception ($5.5M), además de los tramos holgados de emparejamiento en traspasos.',
              },
              {
                tier: 'luxury_tax' as CbaTeamTier,
                range: `${formatSalaryShort(th.luxuryTax)} – ${formatSalaryShort(th.firstApron)}`,
                headline: 'Zona Pagadora Progresiva',
                body: 'Cada dólar sobre los $200.4M conlleva multas escalonadas (desde 1.50x hasta más de 5x). Conservan flexibilidad moderada en traspasos siempre que la operación no les haga cruzar el muro del 1er Apron.',
              },
              {
                tier: 'first_apron' as CbaTeamTier,
                range: `${formatSalaryShort(th.firstApron)} – ${formatSalaryShort(th.secondApron)}`,
                headline: 'Regla del 100% en Traspasos',
                body: 'Prohibido recibir más salario del que se envía (match 100% estricto). No pueden adquirir jugadores vía Sign-and-Trade, no pueden usar excepciones de traspaso previas (TPE) ni firmar buyouts con salario superior a la Non-Tax MLE.',
              },
              {
                tier: 'second_apron' as CbaTeamTier,
                range: `> ${formatSalaryShort(th.secondApron)}`,
                headline: 'El Muro Definitivo del CBA',
                body: 'Bloqueo máximo: prohibido agregar dos o más contratos para fichar a un jugador más caro, sin Taxpayer MLE (solo mínimos), prohibido enviar efectivo en traspasos y congelación de su primera ronda del Draft a 7 años.',
              },
            ].map((item) => {
              const meta = getCbaTierVisualMeta(item.tier);
              const tierTeams = teamsByCbaTier[item.tier] || [];
              const count = tierTeams.length;
              const isExpanded = Boolean(expandedGuideTiers[item.tier]);
              return (
                <div
                  key={item.tier}
                  className={`bg-[#131C2E] border ${meta.borderClass} rounded-lg p-5 space-y-3 flex flex-col justify-between`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-bold font-mono ${meta.textClass}`}>
                        {meta.labelEs}
                      </span>
                      <span className="font-mono tabular-nums text-[11px] text-slate-300">
                        {item.range}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-100">{item.headline}</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">{item.body}</p>
                  </div>

                  <div className="pt-2.5 border-t border-[#1E293B] space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[11px] font-mono tabular-nums font-semibold ${meta.textClass}`}>
                        {count} franquicia{count === 1 ? '' : 's'} en 2026–27
                      </span>
                      {count > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedGuideTiers((prev) => ({
                              ...prev,
                              [item.tier]: !prev[item.tier],
                            }))
                          }
                          aria-expanded={isExpanded}
                          className="h-6 px-2 rounded-md bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/60 text-[11px] font-medium text-slate-200 inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                        >
                          {isExpanded ? (
                            <>
                              <Minus className="w-3 h-3 text-orange-400" />
                              <span>Ocultar</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3 text-orange-400" />
                              <span>Detalle</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {count > 0 && !isExpanded && (
                      <div className="flex items-center flex-wrap gap-1.5">
                        {tierTeams.map((t) => (
                          <button
                            key={t.teamAbbr}
                            type="button"
                            onClick={() => {
                              setSelectedTeamAbbr(t.teamAbbr);
                              setActiveTab('sheets');
                            }}
                            title={`${t.teamName} · ${formatSalaryCompact(t.activePayroll)} (clic para ver nómina)`}
                            className="p-0.5 rounded-md bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/70 transition-colors"
                          >
                            <TeamLogo
                              abbr={t.teamAbbr}
                              teamId={t.teamId}
                              logoUrl={t.logoUrl}
                              size="sm"
                            />
                          </button>
                        ))}
                      </div>
                    )}

                    {count > 0 && isExpanded && (
                      <div className="bg-[#0B1120] border border-[#1E293B] rounded-lg divide-y divide-[#1E293B]/60 max-h-56 overflow-y-auto">
                        {tierTeams.map((t) => (
                          <button
                            key={t.teamAbbr}
                            type="button"
                            onClick={() => {
                              setSelectedTeamAbbr(t.teamAbbr);
                              setActiveTab('sheets');
                            }}
                            className="w-full px-2.5 py-2 flex items-center justify-between gap-2 text-left hover:bg-[#182338] transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <TeamLogo
                                abbr={t.teamAbbr}
                                teamId={t.teamId}
                                logoUrl={t.logoUrl}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-100 truncate">
                                  {t.teamName}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono tabular-nums">
                                  {t.capPct}% Cap · {t.rosterCount} jug.
                                </div>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-mono tabular-nums text-xs font-bold text-slate-100">
                                {formatSalaryShort(t.activePayroll)}
                              </div>
                              <div className="text-[10px] text-orange-400">Ver nómina →</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive 30-Team League Map by CBA Tier */}
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Scale className="w-4 h-4 text-orange-400" />
                  Mapa Interactivo de las 30 Franquicias por Escalón CBA (2026–27)
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Haz clic en cualquier franquicia para inspeccionar su Cap Sheet completo.
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                {teamsList.length} equipos clasificados en vivo
              </span>
            </div>

            <div className="space-y-3">
              {CBA_TIER_ORDER.map((tier) => {
                const meta = getCbaTierVisualMeta(tier);
                const tierTeams = teamsByCbaTier[tier] || [];
                return (
                  <div
                    key={tier}
                    className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className={`font-bold ${meta.textClass}`}>
                        {meta.labelEs}
                      </span>
                      <span className="font-mono tabular-nums text-slate-400">
                        {tierTeams.length} equipo{tierTeams.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    {tierTeams.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2">
                        {tierTeams.map((t) => (
                          <button
                            key={t.teamAbbr}
                            type="button"
                            onClick={() => {
                              setSelectedTeamAbbr(t.teamAbbr);
                              setActiveTab('sheets');
                            }}
                            className="p-2 rounded-lg bg-[#131C2E] border border-[#1E293B] hover:border-orange-500/60 flex items-center gap-2 text-left transition-colors"
                          >
                            <TeamLogo
                              abbr={t.teamAbbr}
                              teamId={t.teamId}
                              logoUrl={t.logoUrl}
                              size="sm"
                              framed
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-100 truncate">
                                {t.teamAbbr}
                              </div>
                              <div className="font-mono tabular-nums text-[10px] text-slate-400">
                                {formatSalaryCompact(t.activePayroll)}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500">
                        Ninguna franquicia se encuentra actualmente en este tramo.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Comparative Rules Matrix */}
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-5 space-y-3">
            <div>
              <h4 className="text-sm font-bold text-slate-100">
                Matriz Comparativa: Qué puedes hacer en cada escalón
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Resumen operativo de las reglas aplicadas por la Trade Machine en Modo Estricto CBA.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-[#1E293B]">
                    <th className="py-2.5 px-3 font-medium">Escalón CBA</th>
                    <th className="py-2.5 px-3 font-medium">Emparejamiento Salarial</th>
                    <th className="py-2.5 px-3 font-medium">Agregación</th>
                    <th className="py-2.5 px-3 font-medium">Excepciones (MLE / BAE)</th>
                    <th className="py-2.5 px-3 font-medium">Sign-and-Trade</th>
                    <th className="py-2.5 px-3 font-medium">Restricciones Adicionales</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]/60">
                  {CBA_RULES_MATRIX.map((row) => {
                    const meta = getCbaTierVisualMeta(row.tier);
                    return (
                      <tr key={row.tier} className="hover:bg-[#182338]/50">
                        <td className={`py-2.5 px-3 font-bold whitespace-nowrap ${meta.textClass}`}>
                          {meta.shortLabel}
                        </td>
                        <td className="py-2.5 px-3 text-slate-200">{row.matchRule}</td>
                        <td className="py-2.5 px-3 text-slate-300">{row.aggregation}</td>
                        <td className="py-2.5 px-3 text-slate-300">{row.mleAccess}</td>
                        <td className="py-2.5 px-3 text-slate-300">{row.signAndTrade}</td>
                        <td className="py-2.5 px-3 text-slate-400">{row.draftPenalty}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Contract Clauses Glossary */}
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-5 space-y-3">
            <h4 className="text-sm font-bold text-slate-100">
              Diccionario Rápido de Cláusulas y Conceptos Salariales
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {CBA_GLOSSARY_ITEMS.map((item) => (
                <div
                  key={item.code}
                  className="bg-[#0B1120] border border-[#1E293B] rounded-lg p-3.5 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-100">{item.title}</span>
                    <span className="font-mono text-[10px] font-bold text-orange-400 shrink-0">
                      {item.code}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {item.explanation}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: TRADE MACHINE (2 TO 4 TEAMS) */}
      {/* ========================================================================= */}
      {activeTab === 'trademachine' && (
        <div className="space-y-5">
          {/* Controls & Presets Bar */}
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-300">Franquicias:</span>
                  <div
                    className="inline-flex items-center gap-1 p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg"
                    role="group"
                    aria-label="Número de equipos en el traspaso"
                  >
                    {([2, 3, 4] as const).map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setTradeTeamCount(cnt)}
                        aria-pressed={tradeTeamCount === cnt}
                        className={`h-7 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                          tradeTeamCount === cnt
                            ? 'bg-orange-500 text-slate-950 shadow-sm'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {cnt} Equipos
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-300">Validación:</span>
                  <div
                    className="inline-flex items-center gap-1 p-0.5 bg-[#0B1120] border border-[#1E293B] rounded-lg"
                    role="group"
                    aria-label="Modo de validación CBA"
                  >
                    <button
                      type="button"
                      onClick={() => setTradeModeStrict(true)}
                      aria-pressed={tradeModeStrict}
                      className={`h-7 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                        tradeModeStrict
                          ? 'bg-orange-500 text-slate-950 shadow-sm'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Estricto CBA
                    </button>
                    <button
                      type="button"
                      onClick={() => setTradeModeStrict(false)}
                      aria-pressed={!tradeModeStrict}
                      className={`h-7 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                        !tradeModeStrict
                          ? 'bg-orange-500 text-slate-950 shadow-sm'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Libre (Sandbox)
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {tradeTeamCount === 2 && (
                  <button
                    type="button"
                    onClick={handleSwapTwoTeams}
                    className="h-8 px-3 rounded-lg bg-[#0B1120] border border-[#1E293B] hover:border-slate-500 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    Intercambiar
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleClearTrade}
                  disabled={!tradeEvaluation.hasAnyPlayers}
                  className="h-8 px-3 rounded-lg bg-[#0B1120] border border-[#1E293B] hover:border-rose-500/50 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-40"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Limpiar traspaso
                </button>
                <ExportImageButton
                  onBuildImage={handleExportSnapshot}
                  label="Exportar imagen"
                  copyLabel="Copiar imagen"
                  showCopyLabel
                  compactOnMobile={false}
                  disabled={!tradeEvaluation.hasAnyPlayers}
                  title={
                    tradeEvaluation.hasAnyPlayers
                      ? 'Descargar imagen PNG del traspaso con marca de agua de RadarNBA'
                      : 'Selecciona al menos un jugador o ronda del Draft para exportar el traspaso'
                  }
                />
              </div>
            </div>

            {/* Didactic Quick Presets */}
            {didacticPresets.length > 0 && (
              <div className="pt-2.5 border-t border-[#1E293B] flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-400 inline-flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Ejemplos rápidos:
                </span>
                {didacticPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    title={preset.description}
                    className="h-7 px-2.5 rounded-md bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/60 text-[11px] font-medium text-slate-200 transition-colors whitespace-nowrap"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Global Trade Verdict Banner */}
          <div
            className={`rounded-lg border p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 ${
              !tradeEvaluation.hasAnyPlayers
                ? 'bg-[#131C2E] border-[#1E293B]'
                : !tradeModeStrict
                ? 'bg-sky-500/10 border-sky-500/35'
                : tradeEvaluation.isOverallValid
                ? 'bg-emerald-500/10 border-emerald-500/35'
                : 'bg-rose-500/10 border-rose-500/40'
            }`}
          >
            <div className="flex items-start gap-3">
              {!tradeEvaluation.hasAnyPlayers ? (
                <ArrowLeftRight className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
              ) : !tradeModeStrict ? (
                <Zap className="w-5 h-5 text-sky-300 shrink-0 mt-0.5" />
              ) : tradeEvaluation.isOverallValid ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-sm font-bold ${
                      !tradeEvaluation.hasAnyPlayers
                        ? 'text-slate-100'
                        : !tradeModeStrict
                        ? 'text-sky-300'
                        : tradeEvaluation.isOverallValid
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {!tradeEvaluation.hasAnyPlayers
                      ? 'Simulador listo — Selecciona contratos para construir el traspaso'
                      : !tradeModeStrict
                      ? 'Simulación en Modo Libre (Sandbox)'
                      : tradeEvaluation.isOverallValid
                      ? 'TRASPASO VÁLIDO BAJO EL CBA 2026–27'
                      : `TRASPASO INVÁLIDO — ${tradeEvaluation.totalViolations} infracción${tradeEvaluation.totalViolations > 1 ? 'es' : ''} CBA`}
                  </span>
                  {tradeEvaluation.hasAnyPlayers && (
                    <span className="text-xs font-mono tabular-nums text-slate-300">
                      · {tradeEvaluation.totalPlayersMoved} jugador{tradeEvaluation.totalPlayersMoved === 1 ? '' : 'es'}
                      {tradeEvaluation.totalPicksMoved > 0
                        ? ` · ${tradeEvaluation.totalPicksMoved} ronda${tradeEvaluation.totalPicksMoved === 1 ? '' : 's'} Draft`
                        : ''}
                      {' '}· {formatSalaryCompact(tradeEvaluation.totalSalaryMoved)} movidos
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 mt-1">{tradeEvaluation.editorialVerdictEs}</p>
              </div>
            </div>

            {tradeEvaluation.hasAnyPlayers && (
              <div className="shrink-0">
                <ExportImageButton
                  onBuildImage={handleExportSnapshot}
                  label="Exportar PNG"
                  copyLabel="Copiar"
                  showCopyLabel
                  compactOnMobile={false}
                  title="Descargar tarjeta PNG del traspaso con marca de agua de RadarNBA"
                />
              </div>
            )}
          </div>

          {/* Teams Grid for Trade Selection */}
          <div
            className={`grid grid-cols-1 ${
              tradeTeamCount === 2
                ? 'md:grid-cols-2'
                : tradeTeamCount === 3
                ? 'md:grid-cols-3'
                : 'md:grid-cols-2 xl:grid-cols-4'
            } gap-4`}
          >
            {Array.from({ length: tradeTeamCount }).map((_, teamIdx) => {
              const currentAbbr = tradeTeams[teamIdx];
              const teamSheet =
                teamsList.find((t) => t.teamAbbr === currentAbbr) || teamsList[teamIdx];
              const selectedPlayerIdsForTeam = outgoingPlayerIds[teamIdx] || new Set<string>();
              const tierMeta = teamSheet ? getCbaTierVisualMeta(teamSheet.cbaTier) : null;
              const rosterQuery = (tradeRosterSearch[teamIdx] || '').trim().toLowerCase();
              const visibleRoster = (teamSheet?.players || []).filter((p) => {
                if (!rosterQuery) return true;
                return (
                  p.name.toLowerCase().includes(rosterQuery) ||
                  p.position.toLowerCase().includes(rosterQuery)
                );
              });

              const otherActiveTeams = Array.from({ length: tradeTeamCount })
                .map((__, idx) => ({ idx, abbr: tradeTeams[idx] }))
                .filter((item) => item.idx !== teamIdx);

              const selectedOutTotal = (teamSheet?.players || [])
                .filter((p) => selectedPlayerIdsForTeam.has(p.id))
                .reduce((s, p) => s + p.salary, 0);

              const teamPicksInventory = futurePicksTeams.find(
                (t) => t.teamAbbr === currentAbbr
              );
              const controlledPicks = (teamPicksInventory?.picks || []).filter(
                (pk) => pk.isControlled
              );
              const selectedPickIdsForTeam = outgoingPickIds[teamIdx] || new Set<string>();
              const isPicksDrawerOpen = Boolean(expandedPicksSlot[teamIdx]);

              return (
                <div
                  key={teamIdx}
                  className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-4 space-y-3 flex flex-col"
                >
                  {/* Team Header & Selector */}
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#1E293B]">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <TeamLogo
                        abbr={teamSheet?.teamAbbr || currentAbbr}
                        teamId={teamSheet?.teamId || ''}
                        logoUrl={teamSheet?.logoUrl}
                        size="md"
                        framed
                      />
                      <select
                        aria-label={`Seleccionar equipo ${teamIdx + 1}`}
                        value={currentAbbr}
                        onChange={(e) => handleChangeTradeTeam(teamIdx, e.target.value)}
                        className="h-8 px-2 rounded-lg bg-[#0B1120] border border-[#1E293B] text-xs font-bold text-slate-100 focus:outline-none focus:border-orange-500 min-w-0 flex-1"
                      >
                        {teamsList.map((t) => (
                          <option key={t.teamAbbr} value={t.teamAbbr}>
                            {t.teamAbbr} · {t.teamName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Team Payroll + Tier Sub-line */}
                  {teamSheet && tierMeta && (
                    <div className="flex items-center justify-between text-[11px] gap-2">
                      <span className={`font-semibold ${tierMeta.textClass}`}>
                        {tierMeta.shortLabel}
                      </span>
                      <span className="font-mono tabular-nums text-slate-300">
                        Nómina: {formatSalaryShort(teamSheet.activePayroll)}
                      </span>
                    </div>
                  )}

                  {/* Quick Player Search */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={tradeRosterSearch[teamIdx] || ''}
                      onChange={(e) =>
                        setTradeRosterSearch((prev) => ({
                          ...prev,
                          [teamIdx]: e.target.value,
                        }))
                      }
                      placeholder="Filtrar jugador..."
                      className="w-full h-8 pl-8 pr-2.5 rounded-lg bg-[#0B1120] border border-[#1E293B] text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500/60"
                    />
                  </div>

                  {/* Selectable Outgoing Players */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-semibold">
                        Salidas ({selectedPlayerIdsForTeam.size})
                      </span>
                      <span className="font-mono tabular-nums text-orange-300 font-semibold">
                        {formatSalaryShort(selectedOutTotal)}
                      </span>
                    </div>
                    <div className="overflow-y-auto max-h-[340px] space-y-1 pr-1">
                      {visibleRoster.map((p) => {
                        const isSelected = selectedPlayerIdsForTeam.has(p.id);
                        const currentDestIdx =
                          playerDestinations[p.id] !== undefined &&
                          playerDestinations[p.id] !== teamIdx &&
                          playerDestinations[p.id] < tradeTeamCount
                            ? playerDestinations[p.id]
                            : (teamIdx + 1) % tradeTeamCount;

                        return (
                          <div
                            key={p.id}
                            className={`p-2 rounded-lg border transition-colors ${
                              isSelected
                                ? 'bg-orange-500/15 border-orange-500/50 text-white'
                                : 'bg-[#0B1120]/50 border-transparent hover:bg-[#182338] text-slate-300'
                            }`}
                          >
                            <div
                              onClick={() => {
                                setOutgoingPlayerIds((prev) => {
                                  const setCopy = new Set(prev[teamIdx] || []);
                                  if (setCopy.has(p.id)) {
                                    setCopy.delete(p.id);
                                  } else {
                                    setCopy.add(p.id);
                                    if (tradeTeamCount > 2) {
                                      const nextIdx = (teamIdx + 1) % tradeTeamCount;
                                      setPlayerDestinations((dPrev) => ({
                                        ...dPrev,
                                        [p.id]: nextIdx,
                                      }));
                                    }
                                  }
                                  return { ...prev, [teamIdx]: setCopy };
                                });
                              }}
                              className="cursor-pointer flex items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  aria-label={`Incluir a ${p.name} en el traspaso`}
                                  className="rounded border-slate-700 text-orange-500 focus:ring-0"
                                />
                                <div className="min-w-0">
                                  <div className="text-xs font-medium text-slate-100 truncate">
                                    {p.name}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-mono tabular-nums">
                                    {p.position} · {p.pointsPg.toFixed(1)} PTS · {p.optionType}
                                    {p.tradeKickerPct > 0 ? ` · +${p.tradeKickerPct}% TK` : ''}
                                  </div>
                                </div>
                              </div>

                              <div className="text-right font-mono tabular-nums text-xs font-bold text-slate-200 shrink-0">
                                {formatSalaryShort(p.salary)}
                              </div>
                            </div>

                            {/* Explicit Destination Picker for 3 & 4 Team Trades */}
                            {isSelected && tradeTeamCount > 2 && (
                              <div className="mt-2 pt-1.5 border-t border-orange-500/25 flex items-center justify-between gap-2">
                                <span className="text-[10px] text-orange-200 font-semibold inline-flex items-center gap-1">
                                  <ArrowRight className="w-3 h-3" />
                                  Destino:
                                </span>
                                <div className="flex items-center gap-1">
                                  {otherActiveTeams.map((dest) => (
                                    <button
                                      key={dest.idx}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPlayerDestinations((prev) => ({
                                          ...prev,
                                          [p.id]: dest.idx,
                                        }));
                                      }}
                                      className={`h-6 px-2 rounded text-[10px] font-mono font-bold transition-colors ${
                                        currentDestIdx === dest.idx
                                          ? 'bg-orange-500 text-slate-950'
                                          : 'bg-[#0B1120] text-slate-300 border border-[#1E293B] hover:border-orange-500/50'
                                      }`}
                                    >
                                      {dest.abbr}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Future Draft Picks Selector (2027-2033) */}
                  {controlledPicks.length > 0 && (
                    <div className="pt-2.5 border-t border-[#1E293B] space-y-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedPicksSlot((prev) => ({
                            ...prev,
                            [teamIdx]: !prev[teamIdx],
                          }))
                        }
                        className="w-full flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-300 hover:text-orange-300 transition-colors"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Briefcase className="w-3.5 h-3.5 text-orange-400" />
                          <span>
                            Rondas Draft 27–33 ({controlledPicks.length})
                          </span>
                          {selectedPickIdsForTeam.size > 0 && (
                            <span className="font-mono text-orange-300">
                              · {selectedPickIdsForTeam.size} sel.
                            </span>
                          )}
                        </span>
                        {isPicksDrawerOpen ? (
                          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </button>

                      {isPicksDrawerOpen && (
                        <div className="overflow-y-auto max-h-[210px] space-y-1 pr-1">
                          {controlledPicks.map((pk) => {
                            const isPickSelected = selectedPickIdsForTeam.has(pk.id);
                            const currentPickDestIdx =
                              pickDestinations[pk.id] !== undefined &&
                              pickDestinations[pk.id] !== teamIdx &&
                              pickDestinations[pk.id] < tradeTeamCount
                                ? pickDestinations[pk.id]
                                : (teamIdx + 1) % tradeTeamCount;

                            return (
                              <div
                                key={pk.id}
                                className={`p-2 rounded-lg border transition-colors ${
                                  isPickSelected
                                    ? 'bg-orange-500/15 border-orange-500/50 text-white'
                                    : 'bg-[#0B1120]/60 border-transparent hover:bg-[#182338] text-slate-300'
                                }`}
                              >
                                <div
                                  onClick={() => {
                                    setOutgoingPickIds((prev) => {
                                      const setCopy = new Set(prev[teamIdx] || []);
                                      if (setCopy.has(pk.id)) {
                                        setCopy.delete(pk.id);
                                      } else {
                                        setCopy.add(pk.id);
                                        if (tradeTeamCount > 2) {
                                          const nextIdx = (teamIdx + 1) % tradeTeamCount;
                                          setPickDestinations((dPrev) => ({
                                            ...dPrev,
                                            [pk.id]: nextIdx,
                                          }));
                                        }
                                      }
                                      return { ...prev, [teamIdx]: setCopy };
                                    });
                                  }}
                                  className="cursor-pointer flex items-start justify-between gap-2"
                                >
                                  <div className="flex items-start gap-2 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={isPickSelected}
                                      onChange={() => {}}
                                      aria-label={`Incluir ronda ${pk.year} R${pk.round} en el traspaso`}
                                      className="rounded border-slate-700 text-orange-500 focus:ring-0 mt-0.5"
                                    />
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-mono tabular-nums">
                                        <span className="font-bold text-slate-100">
                                          {pk.year}
                                        </span>
                                        <span
                                          className={`font-bold ${
                                            pk.round === 1 ? 'text-amber-300' : 'text-sky-300'
                                          }`}
                                        >
                                          {pk.round === 1 ? '1ªR' : '2ªR'}
                                        </span>
                                        {pk.stepienLocked && (
                                          <span
                                            title="Bloqueada por Regla Ted Stepien: traspasarla dejaría a la franquicia sin 1ª ronda en dos Drafts consecutivos"
                                            className="inline-flex items-center gap-0.5 text-[10px] text-rose-400 font-sans font-semibold"
                                          >
                                            <Lock className="w-2.5 h-2.5" />
                                            Stepien
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-slate-400 truncate">
                                        {pk.summaryEs}
                                      </div>
                                    </div>
                                  </div>
                                  <span className="text-[10px] font-mono text-slate-500 shrink-0">
                                    $0
                                  </span>
                                </div>

                                {isPickSelected && tradeTeamCount > 2 && (
                                  <div className="mt-1.5 pt-1.5 border-t border-orange-500/25 flex items-center justify-between gap-2">
                                    <span className="text-[10px] text-orange-200 font-semibold inline-flex items-center gap-1">
                                      <ArrowRight className="w-3 h-3" />
                                      Destino:
                                    </span>
                                    <div className="flex items-center gap-1">
                                      {otherActiveTeams.map((dest) => (
                                        <button
                                          key={dest.idx}
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setPickDestinations((prev) => ({
                                              ...prev,
                                              [pk.id]: dest.idx,
                                            }));
                                          }}
                                          className={`h-5 px-1.5 rounded text-[10px] font-mono font-bold transition-colors ${
                                            currentPickDestIdx === dest.idx
                                              ? 'bg-orange-500 text-slate-950'
                                              : 'bg-[#0B1120] text-slate-300 border border-[#1E293B] hover:border-orange-500/50'
                                          }`}
                                        >
                                          {dest.abbr}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Detailed Per-Team CBA Verdict & Sporting Impact Panel */}
          <div className="bg-[#131C2E] border border-[#1E293B] rounded-lg p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Auditoría CBA, Impacto en Aprons y Balance Deportivo por Franquicia
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Valida en tiempo real los tramos de emparejamiento salarial, la prohibición de agregación del 2º Apron, el muro del 1er Apron, Trade Kickers, Impuesto de Lujo y balance de producción en pista.
                </p>
              </div>
              {tradeEvaluation.hasAnyPlayers && (
                <ExportImageButton
                  onBuildImage={handleExportSnapshot}
                  label="Exportar imagen"
                  copyLabel="Copiar"
                  showCopyLabel
                  compactOnMobile={false}
                  title="Exportar o copiar el resumen visual del traspaso con marca de agua RadarNBA"
                />
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {tradeEvaluation.teamResults.map((res) => {
                const preMeta = getCbaTierVisualMeta(res.preTier);
                const postMeta = getCbaTierVisualMeta(res.postTier);
                const tierChanged = res.preTier !== res.postTier;

                return (
                  <div
                    key={res.teamIdx}
                    className={`bg-[#0B1120] border rounded-lg p-4 space-y-3.5 ${
                      !tradeEvaluation.hasAnyPlayers
                        ? 'border-[#1E293B]'
                        : res.isCbaValid
                        ? 'border-emerald-500/30'
                        : 'border-rose-500/45'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#1E293B]">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <TeamLogo
                          abbr={res.teamAbbr}
                          teamId={res.teamSheet?.teamId || ''}
                          logoUrl={res.teamSheet?.logoUrl}
                          size="sm"
                          framed
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-100 truncate">
                            {res.teamName}
                          </div>
                          <div className="text-[11px] flex items-center gap-1.5 flex-wrap">
                            <span className={preMeta.textClass}>{preMeta.shortLabel}</span>
                            {tierChanged && (
                              <>
                                <ArrowRight className="w-3 h-3 text-slate-500" />
                                <span className={`font-bold ${postMeta.textClass}`}>
                                  {postMeta.shortLabel}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div
                          className={`text-xs font-bold inline-flex items-center gap-1 ${
                            res.isCbaValid ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {res.isCbaValid ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {res.isCbaValid
                              ? tradeModeStrict
                                ? 'Válido CBA'
                                : 'Sandbox'
                              : 'Inválido CBA'}
                          </span>
                        </div>
                        <div className="font-mono tabular-nums text-[11px] text-slate-400">
                          Post: {formatSalaryShort(res.postPayroll)}
                        </div>
                      </div>
                    </div>

                    {/* Outgoing vs Incoming Lists */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="text-[11px] font-semibold text-rose-300 flex items-center justify-between">
                          <span>
                            Envía ({res.outgoingPlayers.length}
                            {res.outgoingPicks.length > 0
                              ? ` + ${res.outgoingPicks.length} pick${res.outgoingPicks.length > 1 ? 's' : ''}`
                              : ''}
                            )
                          </span>
                          <span className="font-mono tabular-nums">
                            {formatSalaryShort(res.totalOutgoingSalary)}
                          </span>
                        </div>
                        {res.outgoingPlayers.length > 0 || res.outgoingPicks.length > 0 ? (
                          <ul className="space-y-1 text-[11px] text-slate-300">
                            {res.outgoingPlayers.map((p) => (
                              <li
                                key={p.id}
                                className="flex items-center justify-between gap-2 py-0.5"
                              >
                                <span className="truncate">{p.name}</span>
                                <span className="font-mono tabular-nums text-slate-400 shrink-0">
                                  {formatSalaryShort(p.salary)}
                                </span>
                              </li>
                            ))}
                            {res.outgoingPicks.map((pk) => (
                              <li
                                key={pk.id}
                                className="flex items-center justify-between gap-2 py-0.5 text-amber-200/90"
                              >
                                <span className="truncate">
                                  <span className="font-mono font-bold">
                                    {pk.year} {pk.round === 1 ? '1ªR' : '2ªR'}
                                  </span>{' '}
                                  · {pk.summaryEs}
                                </span>
                                <span className="font-mono tabular-nums text-[10px] text-slate-500 shrink-0">
                                  $0 · Draft
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-[11px] text-slate-500">Sin activos salientes</div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="text-[11px] font-semibold text-emerald-400 flex items-center justify-between">
                          <span>
                            Recibe ({res.incomingItems.length}
                            {res.incomingPicks.length > 0
                              ? ` + ${res.incomingPicks.length} pick${res.incomingPicks.length > 1 ? 's' : ''}`
                              : ''}
                            )
                          </span>
                          <span className="font-mono tabular-nums">
                            {formatSalaryShort(res.totalEffectiveIncomingSalary)}
                          </span>
                        </div>
                        {res.incomingItems.length > 0 || res.incomingPicks.length > 0 ? (
                          <ul className="space-y-1 text-[11px] text-slate-300">
                            {res.incomingItems.map((item) => (
                              <li
                                key={item.player.id}
                                className="flex items-center justify-between gap-2 py-0.5"
                              >
                                <span className="truncate">
                                  {item.player.name}{' '}
                                  <span className="text-slate-500 font-mono text-[10px]">
                                    ({item.fromAbbr})
                                  </span>
                                </span>
                                <span className="font-mono tabular-nums text-slate-400 shrink-0">
                                  {formatSalaryShort(item.effectiveIncomingSalary)}
                                </span>
                              </li>
                            ))}
                            {res.incomingPicks.map((ip) => (
                              <li
                                key={ip.pick.id}
                                className="flex items-center justify-between gap-2 py-0.5 text-emerald-300/90"
                              >
                                <span className="truncate">
                                  <span className="font-mono font-bold">
                                    {ip.pick.year} {ip.pick.round === 1 ? '1ªR' : '2ªR'}
                                  </span>{' '}
                                  · {ip.pick.summaryEs}{' '}
                                  <span className="text-slate-500 font-mono text-[10px]">
                                    ({ip.fromAbbr})
                                  </span>
                                </span>
                                <span className="font-mono tabular-nums text-[10px] text-slate-500 shrink-0">
                                  $0 · Draft
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-[11px] text-slate-500">Sin activos entrantes</div>
                        )}
                      </div>
                    </div>

                    {/* Net Draft Capital Delta Summary (only when picks moved for this team) */}
                    {(res.outgoingPicks.length > 0 || res.incomingPicks.length > 0) && (
                      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-[#131C2E] border border-[#1E293B] text-[11px] font-mono tabular-nums">
                        <span className="text-slate-400 font-sans font-semibold">
                          Balance de Rondas Draft:
                        </span>
                        <div className="flex items-center gap-3">
                          <span
                            className={
                              res.netFirstRoundDelta > 0
                                ? 'text-emerald-400 font-bold'
                                : res.netFirstRoundDelta < 0
                                ? 'text-rose-400 font-bold'
                                : 'text-slate-400'
                            }
                          >
                            1ªR: {res.netFirstRoundDelta > 0 ? `+${res.netFirstRoundDelta}` : res.netFirstRoundDelta}
                          </span>
                          <span
                            className={
                              res.netSecondRoundDelta > 0
                                ? 'text-emerald-400 font-bold'
                                : res.netSecondRoundDelta < 0
                                ? 'text-rose-400 font-bold'
                                : 'text-slate-400'
                            }
                          >
                            2ªR: {res.netSecondRoundDelta > 0 ? `+${res.netSecondRoundDelta}` : res.netSecondRoundDelta}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Financial Summary Strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#1E293B] text-[11px] font-mono tabular-nums">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Delta 26-27</span>
                        <span
                          className={`font-bold ${
                            res.salaryDelta <= 0 ? 'text-emerald-400' : 'text-amber-300'
                          }`}
                        >
                          {formatSignedSalaryShort(res.salaryDelta)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Máx. legal CBA</span>
                        <span className="font-bold text-slate-200">
                          {formatSalaryShort(res.maxAllowedIncomingSalary)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Delta Tax est.</span>
                        <span
                          className={`font-bold ${
                            res.taxBillDelta < 0
                              ? 'text-emerald-400'
                              : res.taxBillDelta > 0
                              ? 'text-rose-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {res.taxBillDelta === 0
                            ? '$0'
                            : formatSignedSalaryShort(res.taxBillDelta)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Delta 27-28</span>
                        <span className="font-bold text-slate-300">
                          {formatSignedSalaryShort(res.payrollDelta2728)}
                        </span>
                      </div>
                    </div>

                    {/* Full Sporting Impact Strip */}
                    <div className="grid grid-cols-4 gap-2 pt-2 border-t border-[#1E293B] text-center font-mono tabular-nums">
                      {[
                        { label: 'PTS', val: res.ptsDelta },
                        { label: 'REB', val: res.rebDelta },
                        { label: 'AST', val: res.astDelta },
                        { label: 'IMPACTO', val: res.impactDelta },
                      ].map((metric) => (
                        <div key={metric.label} className="py-1.5 px-1 rounded bg-[#131C2E]">
                          <div className="text-[10px] text-slate-400">{metric.label}</div>
                          <div
                            className={`text-xs font-bold mt-0.5 ${
                              metric.val > 0.1
                                ? 'text-emerald-400'
                                : metric.val < -0.1
                                ? 'text-rose-400'
                                : 'text-slate-300'
                            }`}
                          >
                            {formatDeltaStat(metric.val)}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Applied CBA Rule + Violations + Warnings */}
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-slate-300 bg-[#131C2E] px-2.5 py-2 rounded border border-[#1E293B]">
                        {res.appliedRuleEs}
                      </p>

                      {res.violationsEs.map((v, vIdx) => (
                        <div
                          key={vIdx}
                          className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-2.5 py-2 flex items-start gap-2"
                        >
                          <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                          <span>{v}</span>
                        </div>
                      ))}

                      {res.warningsEs.map((w, wIdx) => (
                        <div
                          key={wIdx}
                          className="text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded px-2.5 py-2 flex items-start gap-2"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
