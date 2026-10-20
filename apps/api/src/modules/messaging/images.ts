import {
  MessagingError,
  phoneSchema,
  type ImageMessage,
  type SendResult,
} from './types.js';
import type { WhatsAppConfig } from '../../config.js';
export function validateImage(message: ImageMessage) {
  if (
    !message.chatId.trim() ||
    message.chatId.length > 512 ||
    !message.image.length ||
    message.image.length > 2_000_000 ||
    message.mimeType !== 'image/png' ||
    message.caption.length > 1024 ||
    !message.image.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
  )
    throw new MessagingError('invalid_input');
}
export async function sendCloudImage(
  config: WhatsAppConfig,
  message: ImageMessage,
  signal?: AbortSignal,
  transport: typeof fetch = fetch,
): Promise<SendResult> {
  validateImage(message);
  if (!phoneSchema.safeParse(message.chatId).success)
    throw new MessagingError('invalid_input');
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
    : AbortSignal.timeout(5000);
  const base = `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}`;
  try {
    const form = new FormData();
    form.set('messaging_product', 'whatsapp');
    form.set('type', 'image/png');
    form.set(
      'file',
      new Blob([new Uint8Array(message.image)], { type: 'image/png' }),
      'payment.png',
    );
    const uploaded = await transport(`${base}/media`, {
      method: 'POST',
      redirect: 'error',
      signal: requestSignal,
      headers: { Authorization: `Bearer ${config.accessToken}` },
      body: form,
    });
    const media = (await uploaded.json()) as { id?: unknown };
    if (!uploaded.ok || typeof media.id !== 'string')
      throw new MessagingError('rejected');
    const response = await transport(`${base}/messages`, {
      method: 'POST',
      redirect: 'error',
      signal: requestSignal,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: message.chatId,
        type: 'image',
        image: { id: media.id, caption: message.caption },
      }),
    });
    const data = (await response.json()) as { messages?: { id?: string }[] };
    if (!response.ok) throw new MessagingError('uncertain');
    return {
      provider: 'cloud-api',
      status: 'accepted',
      ...(data.messages?.[0]?.id ? { messageId: data.messages[0].id } : {}),
    };
  } catch (e) {
    if (e instanceof MessagingError) throw e;
    throw new MessagingError('uncertain');
  }
}
