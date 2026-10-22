import { z } from 'zod';
import { Prisma } from '@beelicious/database';

export class DomainError extends Error {
  constructor(
    readonly code: 'invalid_input' | 'not_found' | 'conflict' | 'unavailable',
    options?: ErrorOptions,
  ) {
    super(
      {
        invalid_input: 'Invalid input',
        not_found: 'Resource not found',
        conflict: 'Resource conflict',
        unavailable: 'Service temporarily unavailable',
      }[code],
      options,
    );
  }
}
export async function domainOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DomainError) throw error;
    if (error instanceof z.ZodError) throw new DomainError('invalid_input');
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002' || error.code === 'P2003')
        throw new DomainError('conflict');
      if (error.code === 'P2025') throw new DomainError('not_found');
    }
    throw new DomainError('unavailable', { cause: error });
  }
}
export const idSchema = z.uuid();
export const nameSchema = z.string().trim().min(1).max(120);
export const descriptionSchema = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .optional();
export const urlSchema = z
  .url({ protocol: /^https?$/ })
  .max(2048)
  .nullable()
  .optional();
export const integerSchema = z.number().int().min(-2147483648).max(2147483647);
export const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export function nonempty<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema
    .partial()
    .refine((value) => Object.values(value).some((v) => v !== undefined));
}

export function defined<T extends object>(
  value: T,
): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as { [K in keyof T]: Exclude<T[K], undefined> };
}
