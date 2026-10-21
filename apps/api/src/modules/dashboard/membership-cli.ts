import { createDatabase } from '@beelicious/database';
import { z } from 'zod';
// Accounts are provisioned separately in Supabase Auth; no passwords or privileged key here.
const input = z
  .tuple([
    z.uuid(),
    z.uuid(),
    z.enum(['OWNER', 'STAFF']),
    z.enum(['active', 'inactive']),
    z.enum(['availability', 'readonly']),
  ])
  .safeParse(process.argv.slice(2));
if (!input.success)
  throw new Error(
    'Usage: tenant:member -- AUTH_USER_UUID TENANT_UUID OWNER|STAFF active|inactive availability|readonly',
  );
const [authUserId, tenantId, role, state, permission] = input.data;
const database = createDatabase(
  z.string().min(1).parse(process.env.DATABASE_URL),
);
try {
  await database.prisma.$transaction(async (tx) => {
    await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    await tx.tenantUser.upsert({
      where: { tenantId_authUserId: { tenantId, authUserId } },
      create: {
        authUserId,
        tenantId,
        role,
        isActive: state === 'active',
        canManageAvailability: permission === 'availability',
      },
      update: {
        role,
        isActive: state === 'active',
        canManageAvailability: permission === 'availability',
      },
    });
    await tx.tenantAudit.create({
      data: {
        tenantId,
        actorUserId: authUserId,
        action: 'MEMBERSHIP_PROVISIONED',
        targetId: authUserId,
        changes: {
          source: 'local_operator_cli',
          role,
          isActive: state === 'active',
          canManageAvailability: permission === 'availability',
        },
      },
    });
  });
  console.log('Tenant membership updated.');
} catch {
  process.exitCode = 1;
  console.error(
    'Membership update failed. Check the tenant and database configuration.',
  );
} finally {
  await database.disconnect();
}
