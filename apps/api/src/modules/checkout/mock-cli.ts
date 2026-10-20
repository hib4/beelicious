import { createDatabase } from '@beelicious/database';
import { parseEnvironment } from '../../config.js';

const config = parseEnvironment(process.env);
if (config.NODE_ENV !== 'development' || config.checkout?.provider !== 'mock')
  throw new Error('Mock payment controls require development mock checkout');
const [reference, status] = process.argv.slice(2);
if (!reference || !['settlement', 'deny', 'expire'].includes(status ?? ''))
  throw new Error(
    'Usage: npm run payment:mock -- <provider-reference> settlement|deny|expire',
  );
const db = createDatabase(config.DATABASE_URL);
try {
  const p = await db.prisma.payment.findFirst({
    where: {
      provider: 'mock',
      merchantId: 'local-mock',
      providerOrderId: reference,
    },
    include: { mockTransaction: true },
  });
  if (!p?.mockTransaction)
    throw new Error('Mock transaction not found; wait for initiation');
  await db.prisma.$transaction(async (tx) => {
    await tx.mockPaymentTransaction.update({
      where: { paymentId: p.id },
      data: { status: status! },
    });
    await tx.payment.update({
      where: { id: p.id },
      data: {
        availableAt: new Date(),
        ...(['EXPIRED', 'CANCELLED', 'FAILED'].includes(p.status)
          ? { status: 'REQUIRES_REVIEW' }
          : {}),
      },
    });
  });
  console.log(
    'Simulated gateway status updated; reconciliation will apply the result.',
  );
} catch {
  console.error('Mock payment simulation failed');
  process.exitCode = 1;
} finally {
  await db.disconnect();
}
