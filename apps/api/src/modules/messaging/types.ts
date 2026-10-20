import { z } from 'zod';

export type MessagingProvider = 'cloud-api' | 'baileys' | 'mock';
export interface IncomingMessage {
  provider: MessagingProvider;
  accountId: string;
  messageId: string;
  chatId: string;
  senderId: string;
  /** Used only for approval, never inferred from an opaque LID. */
  senderPhone?: string;
  text: string;
  timestamp: number;
  type: 'text';
  direction: 'incoming';
}
export interface TextMessage {
  chatId: string;
  /** Private approval alias from the normalized inbound envelope. */
  recipientPhone?: string;
  text: string;
}
export interface ImageMessage {
  chatId: string;
  recipientPhone?: string;
  image: Buffer;
  mimeType: 'image/png';
  caption: string;
}
export interface SendResult {
  provider: MessagingProvider;
  messageId?: string;
  status: 'accepted' | 'recorded';
}
export interface DeliveryUpdate {
  provider: MessagingProvider;
  accountId: string;
  messageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
}
export interface MessagingAdapter {
  readonly provider: MessagingProvider;
  accountId(): string | undefined;
  connected(): boolean;
  start(): Promise<void>;
  /** Stop accepting input before draining the worker. */
  pause(): void;
  stop(): Promise<void>;
  sendText(message: TextMessage, signal?: AbortSignal): Promise<SendResult>;
  sendImage?(message: ImageMessage, signal?: AbortSignal): Promise<SendResult>;
  approved(chatId: string, senderPhone?: string): Promise<boolean>;
}
export interface AdapterCallbacks {
  receive(messages: IncomingMessage[]): Promise<void>;
  delivery(updates: DeliveryUpdate[]): Promise<void>;
  warn(event: string): void;
}
export const phoneSchema = z.string().regex(/^[1-9]\d{6,14}$/);
export const textSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((s) => s.trim().length > 0);
export function isGreeting(text: string): boolean {
  return ['halo', 'hi'].includes(text.trim().toLowerCase());
}
export const GREETING =
  'Halo! Selamat datang di Beelicious 🐝\n\nKoneksi WhatsApp berhasil. Fitur pemesanan makanan akan segera tersedia.';

export class MessagingError extends Error {
  constructor(
    readonly category:
      | 'invalid_input'
      | 'authentication'
      | 'rejected'
      | 'rate_limit'
      | 'unavailable'
      | 'uncertain',
    readonly retryable = false,
    readonly safeToRetry = false,
    readonly retryAfterMs = 0,
    readonly httpStatus?: number,
    readonly metaCode?: number,
  ) {
    super(`Messaging send failed: ${category}`);
  }
}
