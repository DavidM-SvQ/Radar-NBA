# Implementation Plan: Optimization of Team Comparison Table & 17 Leader Categories

This plan outlines the visual, layout, and structural enhancements for **RadarNBA** game reports: adding an independent comparison bar column in "Tabla + Barras" mode and grouping 17 Individual Leader categories into 3 structured tactical blocks with subtle winner highlights.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following design choices were confirmed by the user:
> - **Tabla + Barras Layout**: The visual comparison bar will be placed in a dedicated, independent 4th column titled `"Comparación"` located after `"Ventaja (Δ)"`. The table height will be compacted with streamlined row padding.
> - **Líderes Individuales Highlights**: The leading player cell in each metric row will be highlighted with a soft emerald background fill (`bg-emerald-950/25 border-l-2 border-emerald-500`) without extra badge icons.
> - **17 Leader Categories Grouping**: The 17 categories will be organized into 3 structured tactical blocks (*Minutos y Anotación*, *Creación, Juego Colectivo y Rebote*, *Eficiencia, Impacto y Defensa*).

---

## 1. Overview & Core Concept

- **Independent Comparison Column**: Moves the dual-color percentage bar out of the metric title cell into a dedicated 4th table column (`Categoría` | `Visitante` | `Local` | `Ventaja (Δ)` | `Comparación`). This aligns all bars vertically and reduces row height.
- **Structured 17-Leader Grid**: Organizes all 17 individual player comparison categories into 3 distinct tactical blocks, with formatted `#Dorsal I. Apellido (Dato)` labels and interactive player inspection.

---

## 2. User Experience & Visual Design

### 2.1 "Tabla + Barras" 4-Column Layout
- **Headers**: `Categoría` | `[Visitante] (Visitante)` | `[Local] (Local)` | `Ventaja (Δ)` | `Comparación`.
- **Compacted Rhythm**: `py-1.5` / `py-2` padding for dense, high-efficiency inspection.
- **Bar Alignment**: All mini progress bars (`h-1.5 w-28 bg-[#0B1120] rounded-full`) align vertically in Column 5.

### 2.2 17 Leader Categories across 3 Tactical Blocks
1. **Bloque 1: Minutos y Anotación**
   - Minutos Jugados (`MIN`)
   - Puntos (`PTS`)
   - Tiros de Campo Anotados (`TC`)
   - Triples Anotados (`T3`)
   - Tiros Libres Anotados (`TL`)

2. **Bloque 2: Creación, Juego Colectivo y Rebote**
   - Rebotes Totales (`REB`)
   - Rebotes Ofensivos (`OREB`)
   - Asistencias (`AST`)
   - Ratio Asistencias/Pérdidas (`AST/PER`)
   - Mejor Suplente (`6º Hombre`)

3. **Bloque 3: Eficiencia, Impacto y Defensa**
   - Acierto Real (`TS%`)
   - Pérdidas (`PER`)
   - Robos de Balón (`ROB`)
   - Tapones (`TAP`)
   - Impacto Más / Menos (`+/-`)
   - Valoración (`GmSc`)
   - Uso Ofensivo Est. (`USG%`)

---

## 3. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                   GameScoutingReportModal (Tab 2)                       │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Header & 3-Way Mode Switcher (Tabla + Barras / Clean / Barras TV)   │
│ 2. 23 Team Metrics in 3 Sections (Anotación / Pizarra / Rebote)        │
│    └─ Col 1: Metric | Col 2: Away | Col 3: Home | Col 4: Δ | Col 5: Bar │
│ 3. 17 Individual Leader Categories in 3 Tactical Sub-Blocks            │
│    └─ Block 1: Minutos & Anotación                                     │
│    └─ Block 2: Creación & Rebote                                       │
│    └─ Block 3: Eficiencia, Impacto & Defensa                           │
│    └─ Soft Emerald Highlight on Winner Cell                            │
└────────────────────────────────────────────────────────────────────────┘
```

### Proposed Data Structure Updates (`src/server/scoutingEngine.ts` & `src/types/nba.ts`)
- In `GameLeaderComparisonRow`:
  - `blockSection: 'minutes_scoring' | 'playmaking_rebound' | 'efficiency_defense'`
- Populate all 17 categories in `buildGameOfficialReportData`.

---

## 4. Plan Execution Steps

1. **Update `src/types/nba.ts`**: Add `blockSection?: 'minutes_scoring' | 'playmaking_rebound' | 'efficiency_defense'` to `GameLeaderComparisonRow`.
2. **Update `src/server/scoutingEngine.ts`**: Ensure `leaderComparisonRows` contains all 17 categories in exact order assigned to the 3 blocks.
3. **Update `src/components/GameScoutingReportModal.tsx`**:
   - Add Column 5 `"Comparación"` to team stats tables in `statsViewStyle === 'table_bars'`.
   - Compact table row height.
   - Render 17 individual leaders in 3 grouped sub-sections with soft emerald winning cell highlight.
4. **Compile & Verify**: Run `compile_applet` to confirm zero build or lint issues.
