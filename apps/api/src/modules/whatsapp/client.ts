import { z } from 'zod';
import type { WhatsAppConfig } from '../../config.js';

export const recipientSchema = z.string().regex(/^[1-9]\d{6,14}$/);
const textSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => value.trim().length > 0);
const responseSchema = z.object({
  messages: z.array(z.object({ id: z.string().min(1) })).min(1),
});
const errorSchema = z.object({
  error: z.object({
    code: z.number().int(),
    error_subcode: z.number().int().optional(),
    is_transient: z.boolean().optional(),
  }),
});
export class WhatsAppSendError extends Error {
  constructor(
    readonly category:
      | 'invalid_input'
      | 'authentication'
      | 'rejected'
      | 'rate_limit'
      | 'uncertain',
    readonly retryable = false,
    readonly safeToRetry = false,
    readonly retryAfterMs = 0,
    readonly httpStatus?: number,
    readonly metaCode?: number,
  ) {
    super(`WhatsApp send failed: ${category}`);
  }
}
export interface TextSender {
  sendTextMessage(
    recipient: string,
    text: string,
    signal?: AbortSignal,
  ): Promise<string | undefined>;
}
export function createWhatsAppClient(
  config: WhatsAppConfig,
  transport: typeof fetch = fetch,
): TextSender {
  return {
    async sendTextMessage(recipient, text, signal) {
      if (
        !recipientSchema.safeParse(recipient).success ||
        !textSchema.safeParse(text).success
      )
        throw new WhatsAppSendError('invalid_input');
      const timeout = AbortSignal.timeout(5000);
      const requestSignal = signal
        ? AbortSignal.any([signal, timeout])
        : timeout;
      let response: Response;
      let body: unknown;
      try {
        response = await transport(
          `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`,
          {
            method: 'POST',
            redirect: 'error',
            signal: requestSignal,
            headers: {
              Authorization: `Bearer ${config.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: recipient,
              type: 'text',
              text: { body: text },
            }),
          },
        );
        // Deadline also covers consuming the response body.
        body = await response.json();
      } catch {
        throw new WhatsAppSendError('uncertain', true);
      }
      if (response.ok) {
        const parsed = responseSchema.safeParse(body);
        // A successful HTTP response may have accepted the message even without an ID.
        return parsed.success ? parsed.data.messages[0]?.id : undefined;
      }
      const parsed = errorSchema.safeParse(body);
      const code = parsed.success ? parsed.data.error.code : undefined;
      if (
        response.status === 401 ||
        response.status === 403 ||
        code === 190 ||
        code === 10 ||
        code === 200
      ) {
        throw new WhatsAppSendError(
          'authentication',
          false,
          false,
          0,
          response.status,
          code,
        );
      }
      if (
        parsed.success &&
        (response.status === 429 ||
          [4, 80007, 130429, 131056].includes(parsed.data.error.code))
      ) {
        const retryAfter = response.headers.get('retry-after');
        const seconds = retryAfter === null ? 0 : Number(retryAfter);
        const wait = Number.isFinite(seconds)
          ? Math.max(0, seconds * 1000)
          : Math.max(0, Date.parse(retryAfter ?? '') - Date.now());
        throw new WhatsAppSendError(
          'rate_limit',
          true,
          true,
          Number.isFinite(wait) ? wait : 0,
          response.status,
          code,
        );
      }
      if (
        (parsed.success && parsed.data.error.is_transient === true) ||
        response.status >= 500 ||
        response.status === 408 ||
        !parsed.success
      ) {
        throw new WhatsAppSendError(
          'uncertain',
          true,
          false,
          0,
          response.status,
          code,
        );
      }
      throw new WhatsAppSendError(
        'rejected',
        false,
        false,
        0,
        response.status,
        code,
      );
    },
  };
}
