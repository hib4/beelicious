import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function verifySignature(
  body: Buffer,
  header: unknown,
  secret: string,
): boolean {
  if (typeof header !== 'string' || !/^sha256=[a-fA-F0-9]{64}$/.test(header))
    return false;
  return timingSafeEqual(
    createHmac('sha256', secret).update(body).digest(),
    Buffer.from(header.slice(7), 'hex'),
  );
}
export function verifyToken(provided: unknown, expected: string): boolean {
  return (
    typeof provided === 'string' &&
    timingSafeEqual(
      createHash('sha256').update(provided).digest(),
      createHash('sha256').update(expected).digest(),
    )
  );
}
