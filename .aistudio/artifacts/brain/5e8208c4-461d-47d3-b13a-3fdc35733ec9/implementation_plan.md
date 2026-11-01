# Implementation Plan - Rival Rosters Manager & Official Rules Tab (Tab 5)

## User Requirements Addressed
1. **Rrival Rosters & Free Agent Control**: Build a dedicated rival roster manager allowing the user to paste or assign players team by team across the 12 ESPN league teams so that available Free Agents / Waivers are precisely computed as anyone not on Team #11 and not on any rival roster.
2. **Tab 5 - Official Rules & Scoring Breakdown**: Create a dedicated 5th tab ("5. Reglas y Normativa Oficial") displaying the complete summary and scoring table from `Reglas Fantasy NBA.txt`, explaining the exact weight of each statistic (including Shai and Jamal Murray scoring references).
3. **Scoring Validation**: Confirm that Shai Gilgeous-Alexander and Jamal Murray FPTS calculations align perfectly with the official weighting rules.

---

## Proposed Changes

### 1. State Expansion for Rival Teams (`/src/types/nba.ts` & `/src/components/FantasyEspnAssistantView.tsx`)
- Support mapping rival team rosters (`rivalRosters: Record<string, string[]>`) in persisted localStorage state (`radarnba_fantasy_espn_445109163_t11_v1`), supporting teams 1 through 12.
- Update `unavailableIds` to automatically include all players assigned to any rival team.

### 2. Dedicated Rival Roster Manager Modal / Section (`/src/components/FantasyEspnAssistantView.tsx`)
- Add a new tab/sub-modal **"Gestor de Plantillas Rivales (12 Equipos)"** allowing team-by-team paste or assignment (`Equipo 1` to `Equipo 12`).
- Automatically exclude all assigned rival players from the Waiver Wire pool so remaining players are precisely tracked as true Free Agents.

### 3. New Tab 5: "5. Reglas y Normativa Oficial" (`/src/components/FantasyEspnAssistantView.tsx`)
- Add Tab 5 button in the top navigation bar.
- Render the complete official rules summary from `Reglas Fantasy NBA.txt`:
  - Roster structure: 12 contracts max, 10 active starters + 2 bench reserves.
  - Weekly lineup lock: Strict Monday morning lock, 0.0 FPTS for missed games.
  - Complete scoring weights table (`FGM +2.0`, `FGMI -1.0`, `FTM +1.0`, `FTMI -1.0`, `3PM +3.0 total`, `OREB +1.5`, `DREB +0.5`, `AST +1.5`, `STL +2.5`, `BLK +2.5`, `TO -2.0`, `EJ -5.0`).
  - Practical examples and verification notes.

---

## Verification Plan
1. Run `lint_applet` (`tsc --noEmit`) to verify zero TypeScript errors.
2. Run `compile_applet` (`vite build`) to verify clean build.
3. Live test rival team roster assignment and Tab 5 rendering.
