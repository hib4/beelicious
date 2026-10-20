import { createPrismaClient } from '@beelicious/database';
import { z } from 'zod';
import { parseEnvironment } from '../../config.js';

async function main() {
  const config = parseEnvironment(process.env);
  const client = createPrismaClient(config.DATABASE_URL);
  try {
    const events = await client.whatsAppEvent.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        kind: true,
        state: true,
        attempts: true,
        lastError: true,
        updatedAt: true,
        data: true,
      },
    });
    const statusSchema = z.object({
      status: z.enum(['sent', 'delivered', 'read', 'failed', 'deleted']),
      errorCodes: z.array(z.number().int()),
    });
    const safeEvents = events.map(({ data, ...event }) => {
      const status =
        event.kind === 'status' ? statusSchema.safeParse(data) : undefined;
      return {
        ...event,
        ...(status?.success
          ? {
              deliveryStatus: status.data.status,
              errorCodes: status.data.errorCodes,
            }
          : {}),
      };
    });
    console.log(JSON.stringify(safeEvents, null, 2));
  } finally {
    await client.$disconnect();
  }
}
main().catch(() => {
  console.error(
    'Unable to inspect events: check database configuration and migrations.',
  );
  process.exitCode = 1;
});
