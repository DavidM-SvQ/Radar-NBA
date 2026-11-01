import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import type { SeasonMode } from '../types/nba.ts';

/**
 * Strips ASCII control characters and trims surrounding whitespace.
 */
export function stripControlChars(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\x00-\x1F\x7F]+/g, ' ').trim();
}

const FORBIDDEN_PROTOTYPE_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

/**
 * Strict entity identifier schema for NBA/ESPN playerIds, teamIds, team abbreviations, and eventIds.
 * Allows alphanumeric characters plus ':', '_', '-' (e.g., "203999", "player:203999", "BOS", "0022600123")
 * while blocking path traversal (".."), slashes, quotes, SQL/NoSQL operators, and prototype keys.
 */
export const safeEntityIdSchema = z
  .string({ error: 'Identificador requerido.' })
  .trim()
  .min(1, 'El identificador no puede estar vacío.')
  .max(48, 'Identificador demasiado largo (máx. 48 caracteres).')
  .regex(
    /^[a-zA-Z0-9:_-]+$/,
    'Formato de identificador no válido (solo letras, números, ":", "_" o "-").'
  )
  .refine(
    (val) => !val.includes('..') && !FORBIDDEN_PROTOTYPE_KEYS.has(val.toLowerCase()),
    'Identificador reservado o secuencia no permitida.'
  );

export const seasonModeSchema = z.enum(['continuous', '2027', '2026'], {
  error: 'Modo de temporada no válido (permitidos: continuous, 2027, 2026).',
});

export const booleanQueryFlagSchema = z
  .enum(['0', '1', 'true', 'false'], {
    error: 'Parámetro booleano no válido (usa 0 o 1).',
  })
  .optional()
  .transform((val) => val === '1' || val === 'true');

/**
 * Validates strict YYYY-MM-DD calendar dates within reasonable NBA seasons (2020..2035)
 * and verifies that month/day exist in the Gregorian calendar (e.g., rejects 2026-02-30).
 */
export const isoDateSchema = z
  .string({ error: 'Fecha no válida.' })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato estricto YYYY-MM-DD.')
  .refine((val) => {
    const [yStr, mStr, dStr] = val.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);
    if (!Number.isInteger(y) || y < 2020 || y > 2035) return false;
    if (!Number.isInteger(m) || m < 1 || m > 12) return false;
    if (!Number.isInteger(d) || d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() + 1 === m &&
      dt.getUTCDate() === d
    );
  }, 'Fecha fuera de rango o inexistente en el calendario.');

/* ============================================================================
 * Endpoint Schemas (Query, Params & Body)
 * ========================================================================== */

export const emptyQuerySchema = z.strictObject({});

export const refreshOnlyQuerySchema = z.strictObject({
  refresh: booleanQueryFlagSchema,
});

export const bootstrapQuerySchema = z
  .strictObject({
    seasonMode: seasonModeSchema.optional(),
    season: seasonModeSchema.optional(),
    refresh: booleanQueryFlagSchema,
    wire: z
      .enum(['compact', 'v2', 'legacy'], {
        error: 'Formato wire no válido (permitidos: compact, v2, legacy).',
      })
      .optional(),
    full: booleanQueryFlagSchema,
  })
  .transform((q): {
    seasonMode: SeasonMode;
    refresh: boolean;
    wire: 'compact' | 'v2' | 'legacy';
  } => ({
    seasonMode: q.seasonMode ?? q.season ?? 'continuous',
    refresh: Boolean(q.refresh),
    wire: q.wire ?? 'compact',
  }));

export const searchQuerySchema = z.strictObject({
  q: z
    .string({ error: 'Parámetro de búsqueda no válido.' })
    .max(80, 'La búsqueda no puede superar 80 caracteres.')
    .transform(stripControlChars)
    .refine(
      (s) => !/[<>${}\\]/.test(s),
      'La búsqueda contiene caracteres especiales no permitidos.'
    )
    .optional()
    .default(''),
});

export const playerParamsSchema = z.strictObject({
  playerId: safeEntityIdSchema,
});

export const playerSummaryQuerySchema = z
  .strictObject({
    seasonMode: seasonModeSchema.optional(),
    season: seasonModeSchema.optional(),
    name: z.string().max(80).transform(stripControlChars).optional(),
    teamAbbr: z
      .string()
      .max(12)
      .transform(stripControlChars)
      .refine((v) => v === '' || /^[a-zA-Z0-9_-]{1,12}$/.test(v), 'Abreviatura de equipo no válida.')
      .optional(),
    position: z
      .string()
      .max(16)
      .transform(stripControlChars)
      .refine((v) => v === '' || /^[a-zA-Z0-9/_ -]{1,16}$/.test(v), 'Posición no válida.')
      .optional(),
  })
  .transform((q) => ({
    seasonMode: (q.seasonMode ?? q.season ?? 'continuous') as SeasonMode,
    name: q.name,
    teamAbbr: q.teamAbbr,
    position: q.position,
  }));

export const teamParamsSchema = z.strictObject({
  teamId: safeEntityIdSchema,
});

export const gamedayQuerySchema = z.strictObject({
  date: z.preprocess(
    (val) => (val === '' ? undefined : val),
    isoDateSchema.optional()
  ),
  refresh: booleanQueryFlagSchema,
});

export const gameEventParamsSchema = z.strictObject({
  eventId: safeEntityIdSchema,
});

export const adminLoginBodySchema = z.strictObject({
  passcode: z
    .string({ error: 'Debes introducir una clave de acceso válida.' })
    .trim()
    .min(1, 'La clave de acceso no puede estar vacía.')
    .max(128, 'La clave supera la longitud máxima permitida.'),
});

export const ADMIN_SECURITY_BOUNDS = {
  nbaApiLimit: { min: 20, max: 2000 },
  nbaApiWindowMinutes: { min: 1, max: 60 },
  nbaRefreshLimit: { min: 2, max: 200 },
  nbaRefreshWindowMinutes: { min: 1, max: 60 },
  adminBruteForceMaxAttempts: { min: 2, max: 25 },
  adminBruteForceWindowMinutes: { min: 1, max: 180 },
  adminFloodLimit: { min: 10, max: 500 },
  adminFloodWindowMinutes: { min: 1, max: 180 },
  adminSessionTtlHours: { min: 1, max: 168 },
} as const;

export const adminSecurityConfigBodySchema = z.strictObject({
  nbaApiLimit: z.coerce
    .number({ error: 'El límite de peticiones API debe ser numérico.' })
    .int('Debe ser un número entero.')
    .min(ADMIN_SECURITY_BOUNDS.nbaApiLimit.min, 'Mínimo 20 peticiones.')
    .max(ADMIN_SECURITY_BOUNDS.nbaApiLimit.max, 'Máximo 2000 peticiones.'),
  nbaApiWindowMinutes: z.coerce
    .number({ error: 'La ventana de tiempo API debe ser numérica.' })
    .int('Debe ser un número entero.')
    .min(ADMIN_SECURITY_BOUNDS.nbaApiWindowMinutes.min, 'Mínimo 1 minuto.')
    .max(ADMIN_SECURITY_BOUNDS.nbaApiWindowMinutes.max, 'Máximo 60 minutos.'),
  nbaRefreshLimit: z.coerce
    .number({ error: 'El límite de recargas forzadas debe ser numérico.' })
    .int('Debe ser un número entero.')
    .min(ADMIN_SECURITY_BOUNDS.nbaRefreshLimit.min, 'Mínimo 2 recargas.')
    .max(ADMIN_SECURITY_BOUNDS.nbaRefreshLimit.max, 'Máximo 200 recargas.'),
  nbaRefreshWindowMinutes: z.coerce
    .number({ error: 'La ventana de recargas forzadas debe ser numérica.' })
    .int('Debe ser un número entero.')
    .min(ADMIN_SECURITY_BOUNDS.nbaRefreshWindowMinutes.min, 'Mínimo 1 minuto.')
    .max(ADMIN_SECURITY_BOUNDS.nbaRefreshWindowMinutes.max, 'Máximo 60 minutos.'),
  adminBruteForceMaxAttempts: z.coerce
    .number({ error: 'El máximo de intentos fallidos debe ser numérico.' })
    .int('Debe ser un número entero.')
    .min(ADMIN_SECURITY_BOUNDS.adminBruteForceMaxAttempts.min, 'Mínimo 2 intentos.')
    .max(ADMIN_SECURITY_BOUNDS.adminBruteForceMaxAttempts.max, 'Máximo 25 intentos.'),
  adminBruteForceWindowMinutes: z.coerce
    .number({ error: 'El tiempo de bloqueo login debe ser numérico.' })
    .int('Debe ser un número entero.')
    .min(ADMIN_SECURITY_BOUNDS.adminBruteForceWindowMinutes.min, 'Mínimo 1 minuto.')
    .max(ADMIN_SECURITY_BOUNDS.adminBruteForceWindowMinutes.max, 'Máximo 180 minutos.'),
  adminFloodLimit: z.coerce
    .number({ error: 'El límite de tráfico admin debe ser numérico.' })
    .int('Debe ser un número entero.')
    .min(ADMIN_SECURITY_BOUNDS.adminFloodLimit.min, 'Mínimo 10 solicitudes.')
    .max(ADMIN_SECURITY_BOUNDS.adminFloodLimit.max, 'Máximo 500 solicitudes.'),
  adminFloodWindowMinutes: z.coerce
    .number({ error: 'La ventana de tráfico admin debe ser numérica.' })
    .int('Debe ser un número entero.')
    .min(ADMIN_SECURITY_BOUNDS.adminFloodWindowMinutes.min, 'Mínimo 1 minuto.')
    .max(ADMIN_SECURITY_BOUNDS.adminFloodWindowMinutes.max, 'Máximo 180 minutos.'),
  adminSessionTtlHours: z.coerce
    .number({ error: 'La duración de sesión debe ser numérica.' })
    .int('Debe ser un número entero.')
    .min(ADMIN_SECURITY_BOUNDS.adminSessionTtlHours.min, 'Mínimo 1 hora.')
    .max(ADMIN_SECURITY_BOUNDS.adminSessionTtlHours.max, 'Máximo 168 horas (7 días).'),
});

const safeRivalKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-zA-Z0-9_-]+$/, 'Clave de equipo rival no válida.')
  .refine((k) => !FORBIDDEN_PROTOTYPE_KEYS.has(k.toLowerCase()), 'Clave reservada.');

export const manualFantasyStateBodySchema = z.strictObject({
  updatedAt: z.number().finite().nonnegative().optional(),
  myTeamName: z
    .string()
    .max(80, 'El nombre del equipo no puede superar 80 caracteres.')
    .transform(stripControlChars)
    .optional(),
  roster: z
    .array(
      z.strictObject({
        playerId: safeEntityIdSchema,
        slot: z.enum(['starter', 'bench']),
      })
    )
    .max(25, 'La plantilla no puede superar 25 jugadores.'),
  takenRivalIds: z
    .array(safeEntityIdSchema)
    .max(600, 'Demasiados jugadores rivales marcados.'),
  rivalRosters: z.record(
    safeRivalKeySchema,
    z.array(safeEntityIdSchema).max(30)
  ),
  rivalTeamNames: z.record(
    safeRivalKeySchema,
    z.string().max(80).transform(stripControlChars)
  ),
});

/* ============================================================================
 * Express Validation Middleware & Strongly-Typed Accessor
 * ========================================================================== */

export interface ValidationIssueItem {
  field: string;
  message: string;
}

export interface ValidatedPayloadBag<
  TParams = Record<string, unknown>,
  TQuery = Record<string, unknown>,
  TBody = unknown,
> {
  params: TParams;
  query: TQuery;
  body: TBody;
}

interface RequestWithValidated extends Request {
  __validated?: ValidatedPayloadBag<any, any, any>;
}

export function getValidated<
  TParams = Record<string, unknown>,
  TQuery = Record<string, unknown>,
  TBody = unknown,
>(req: Request): ValidatedPayloadBag<TParams, TQuery, TBody> {
  const bag = (req as RequestWithValidated).__validated;
  if (bag) {
    return bag as ValidatedPayloadBag<TParams, TQuery, TBody>;
  }
  return {
    params: (req.params ?? {}) as unknown as TParams,
    query: (req.query ?? {}) as unknown as TQuery,
    body: req.body as TBody,
  };
}

export function validateRequest<
  TParamsSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TQuerySchema extends z.ZodTypeAny = z.ZodTypeAny,
  TBodySchema extends z.ZodTypeAny = z.ZodTypeAny,
>(schemas: {
  params?: TParamsSchema;
  query?: TQuerySchema;
  body?: TBodySchema;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const issues: ValidationIssueItem[] = [];
    let parsedParams: unknown = req.params;
    let parsedQuery: unknown = req.query;
    let parsedBody: unknown = req.body;

    if (schemas.params) {
      const r = schemas.params.safeParse(req.params ?? {});
      if (!r.success) {
        for (const iss of r.error.issues) {
          const subPath = iss.path.map(String).join('.');
          issues.push({
            field: subPath ? `params.${subPath}` : 'params',
            message: iss.message,
          });
        }
      } else {
        parsedParams = r.data;
      }
    }

    if (schemas.query) {
      const r = schemas.query.safeParse(req.query ?? {});
      if (!r.success) {
        for (const iss of r.error.issues) {
          const subPath = iss.path.map(String).join('.');
          issues.push({
            field: subPath ? `query.${subPath}` : 'query',
            message: iss.message,
          });
        }
      } else {
        parsedQuery = r.data;
      }
    }

    if (schemas.body) {
      const r = schemas.body.safeParse(req.body ?? {});
      if (!r.success) {
        for (const iss of r.error.issues) {
          const subPath = iss.path.map(String).join('.');
          issues.push({
            field: subPath ? `body.${subPath}` : 'body',
            message: iss.message,
          });
        }
      } else {
        parsedBody = r.data;
      }
    }

    if (issues.length > 0) {
      res.status(400).json({
        error: issues[0]?.message || 'Parámetros de entrada no válidos.',
        code: 'VALIDATION_ERROR',
        issues,
      });
      return;
    }

    (req as RequestWithValidated).__validated = {
      params: parsedParams,
      query: parsedQuery,
      body: parsedBody,
    };

    next();
  };
}
