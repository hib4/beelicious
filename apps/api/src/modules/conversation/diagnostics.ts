import { Prisma } from '@beelicious/database';

export type PreparationStage =
  | 'validation'
  | 'identity'
  | 'transaction'
  | 'session'
  | 'transition'
  | 'persist'
  | 'lease'
  | 'unknown';
export interface PreparationDiagnostic {
  category:
    | 'timeout'
    | 'conflict'
    | 'validation'
    | 'lease_lost'
    | 'database'
    | 'transaction'
    | 'unknown';
  stage: PreparationStage;
  elapsedMs: number;
  prismaCode?: string;
}
export type PreparationLogger = (
  event: string,
  diagnostic?: PreparationDiagnostic,
) => void;
const contexts = new WeakMap<
  object,
  { stage: PreparationStage; elapsedMs: number }
>();

export class PreparationLimitError extends Error {
  constructor(readonly reason: 'budget_exceeded' | 'lease_lost') {
    super(
      reason === 'lease_lost'
        ? 'Conversation lease lost'
        : 'Conversation preparation budget exceeded',
    );
  }
}
export function recordPreparationFailure(
  error: unknown,
  stage: PreparationStage,
  elapsedMs: number,
) {
  if (error !== null && typeof error === 'object')
    contexts.set(error, {
      stage,
      elapsedMs: Math.max(0, Math.round(elapsedMs)),
    });
}
/** Only known codes and fixed stage/category values leave the error boundary. */
export function preparationDiagnostic(
  error: unknown,
  elapsedMs = 0,
): PreparationDiagnostic {
  const context =
    error !== null && typeof error === 'object'
      ? contexts.get(error)
      : undefined;
  const result: PreparationDiagnostic = {
    category: 'unknown',
    stage: context?.stage ?? 'unknown',
    elapsedMs: context?.elapsedMs ?? Math.max(0, Math.round(elapsedMs)),
  };
  const visited = new Set<unknown>();
  for (
    let depth = 0;
    depth < 5 && error instanceof Error && !visited.has(error);
    depth++
  ) {
    visited.add(error);
    if (error instanceof PreparationLimitError) {
      result.category =
        error.reason === 'lease_lost' ? 'lease_lost' : 'timeout';
      return result;
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      /^P\d{4}$/.test(error.code)
    ) {
      result.prismaCode = error.code;
      result.category =
        error.code === 'P2028'
          ? 'transaction'
          : ['P2034', 'P2002'].includes(error.code)
            ? 'conflict'
            : 'database';
      return result;
    }
    if (error.name === 'ZodError') result.category = 'validation';
    error = error.cause;
  }
  return result;
}
