import { Prisma } from './generated/prisma/client.js';

/** Prisma 7 reports raw-query serialization failures through the driver adapter. */
export function isTransactionConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2034') return true;
  if (error.code !== 'P2010') return false;
  const meta = error.meta as
    { driverAdapterError?: { cause?: { kind?: string } } } | undefined;
  return meta?.driverAdapterError?.cause?.kind === 'TransactionWriteConflict';
}
