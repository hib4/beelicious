import { createDatabase } from '@beelicious/database';
import { parseEnvironment } from '../../config.js';
const config = parseEnvironment(process.env);
const db = createDatabase(config.DATABASE_URL);
try {
  const payments = await db.prisma.payment.findMany({
    take: 20,
    orderBy: { createdAt: 'desc' },
    select: {
      provider: true,
      providerOrderId: true,
      status: true,
      amount: true,
      expiresAt: true,
      failures: true,
      order: {
        select: {
          orderNumber: true,
          status: true,
          reviewReason: true,
          reservation: { select: { status: true } },
          notifications: { select: { kind: true, state: true } },
        },
      },
    },
  });
  console.log(JSON.stringify(payments, null, 2));
} catch {
  console.error('Payment inspection unavailable');
  process.exitCode = 1;
} finally {
  await db.disconnect();
}
