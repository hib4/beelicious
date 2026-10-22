import { expect, it } from 'vitest';
import { Prisma } from '@beelicious/database';
import { DomainError } from '../../src/modules/catalog/validation.js';
import {
  preparationDiagnostic,
  recordPreparationFailure,
  PreparationLimitError,
} from '../../src/modules/conversation/diagnostics.js';

it('preserves only a safe Prisma code through sanitized domain failures', () => {
  const error = new DomainError('unavailable', {
    cause: new Prisma.PrismaClientKnownRequestError(
      'private connection/password/customer message',
      {
        code: 'P2028',
        clientVersion: 'fixture',
        meta: { private: 'secret' },
      },
    ),
  });
  recordPreparationFailure(error, 'transition', 5001.6);
  const diagnostic = preparationDiagnostic(error);
  expect(diagnostic).toEqual({
    category: 'transaction',
    stage: 'transition',
    elapsedMs: 5002,
    prismaCode: 'P2028',
  });
  expect(JSON.stringify(diagnostic)).not.toMatch(
    /private|password|customer|secret/,
  );
});
it('does not trust an arbitrary exception code or message', () => {
  const error = Object.assign(new Error('private data'), {
    code: 'P2028-secret',
  });
  expect(preparationDiagnostic(error, 5)).toEqual({
    category: 'unknown',
    stage: 'unknown',
    elapsedMs: 5,
  });
});
it.each(['budget_exceeded', 'lease_lost'] as const)(
  'classifies %s without logging the error itself',
  (reason) => {
    expect(
      preparationDiagnostic(new PreparationLimitError(reason)),
    ).toMatchObject({
      category: reason === 'lease_lost' ? 'lease_lost' : 'timeout',
    });
  },
);
it('bounds cause traversal even for cyclic exception chains', () => {
  const error = new Error('private data');
  error.cause = error;
  expect(preparationDiagnostic(error)).toMatchObject({ category: 'unknown' });
});
