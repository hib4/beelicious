import { z } from 'zod';
import { Prisma, type PrismaClient } from '@beelicious/database';
import {
  domainOperation,
  DomainError,
  idSchema,
  nameSchema,
} from '../catalog/validation.js';

const token = z
  .string()
  .min(1)
  .max(512)
  .refine((v) => v === v.trim() && !/\s/.test(v));
const identityBase = { accountId: token, providerUserId: token };
export const messagingIdentitySchema = z.discriminatedUnion('provider', [
  z
    .strictObject({
      ...identityBase,
      provider: z.literal('baileys'),
      identifierType: z.enum(['jid', 'lid']),
    })
    .refine((v) =>
      v.identifierType === 'jid'
        ? /^[1-9]\d{6,14}@s\.whatsapp\.net$/.test(v.providerUserId)
        : /^\d+@lid$/.test(v.providerUserId),
    ),
  z.strictObject({
    ...identityBase,
    provider: z.literal('cloud-api'),
    identifierType: z.literal('cloud-user'),
  }),
  z.strictObject({
    ...identityBase,
    provider: z.literal('mock'),
    identifierType: z.literal('mock-user'),
  }),
]);
export type MessagingIdentity = z.infer<typeof messagingIdentitySchema>;
// Only a trusted internal ownership-verification workflow may construct this value.
// This phase deliberately provides no endpoint or mechanism to obtain verification.
export interface VerifiedIdentityOwnership {
  verified: true;
  customerId: string;
  identity: MessagingIdentity;
}
function key(identity: MessagingIdentity) {
  const { provider, accountId, providerUserId } = identity;
  return { provider, accountId, providerUserId };
}
export class CustomerService {
  constructor(private readonly db: PrismaClient) {}
  getById(id: string) {
    return domainOperation(() =>
      this.db.customer.findUniqueOrThrow({ where: { id: idSchema.parse(id) } }),
    );
  }
  findByIdentity(input: unknown) {
    return domainOperation(async () => {
      const identity = messagingIdentitySchema.parse(input);
      const record = await this.db.customerMessagingIdentity.findUnique({
        where: { provider_accountId_providerUserId: key(identity) },
        select: { customer: true },
      });
      return record?.customer ?? null;
    });
  }
  register(input: unknown, displayName?: string) {
    return domainOperation(async () => {
      const identity = messagingIdentitySchema.parse(input);
      const name =
        displayName === undefined ? undefined : nameSchema.parse(displayName);
      const existing = await this.findByIdentity(identity);
      if (existing) return existing;
      try {
        return await this.db.customer.create({
          data: {
            ...(name ? { displayName: name } : {}),
            identities: { create: identity },
          },
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        )
          throw error;
        const winner = await this.findByIdentity(identity);
        if (!winner) throw error;
        return winner;
      }
    });
  }
  associateIdentity(verification: VerifiedIdentityOwnership) {
    return domainOperation(async () => {
      const verified = z
        .strictObject({
          verified: z.literal(true),
          customerId: idSchema,
          identity: messagingIdentitySchema,
        })
        .parse(verification);
      const { identity, customerId } = verified;
      await this.db.customer.findUniqueOrThrow({
        where: { id: customerId },
        select: { id: true },
      });
      // PostgreSQL ON CONFLICT avoids the read/create race of empty-update upserts.
      // The winning identity remains owned by its original customer.
      await this.db.customerMessagingIdentity.createMany({
        data: [{ ...identity, customerId }],
        skipDuplicates: true,
      });
      const record = await this.db.customerMessagingIdentity.findUniqueOrThrow({
        where: { provider_accountId_providerUserId: key(identity) },
      });
      if (record.customerId !== customerId) throw new DomainError('conflict');
      return this.getById(customerId);
    });
  }
}
