import type { FastifyInstance } from 'fastify';
import type { WhatsAppEventStore } from '@beelicious/database';
import type { WhatsAppConfig } from '../../config.js';
import { parsePayload } from './payload.js';
import { verifySignature, verifyToken } from './signature.js';

export async function registerWhatsAppRoutes(
  app: FastifyInstance,
  config: WhatsAppConfig,
  store: WhatsAppEventStore,
  conversationEnabled = false,
) {
  // Encapsulated in this plugin: all other routes retain their normal JSON parser.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer', bodyLimit: 1048576 },
    (_request, body, done) => {
      done(null, body);
    },
  );
  app.get<{ Querystring: Record<string, unknown> }>(
    '/webhooks/whatsapp',
    async (request, reply) => {
      const query = request.query;
      if (
        query['hub.mode'] !== 'subscribe' ||
        typeof query['hub.challenge'] !== 'string' ||
        !verifyToken(query['hub.verify_token'], config.verifyToken)
      ) {
        return reply.code(403).send({ error: 'Verification rejected' });
      }
      return reply.type('text/plain').send(query['hub.challenge']);
    },
  );
  app.post<{ Body: Buffer }>('/webhooks/whatsapp', async (request, reply) => {
    if (
      !Buffer.isBuffer(request.body) ||
      !verifySignature(
        request.body,
        request.headers['x-hub-signature-256'],
        config.appSecret,
      )
    ) {
      return reply.code(401).send({ error: 'Invalid signature' });
    }
    let events;
    try {
      events = parsePayload(
        JSON.parse(request.body.toString('utf8')),
        config,
        conversationEnabled,
      );
    } catch {
      return reply.code(400).send({ error: 'Invalid webhook payload' });
    }
    try {
      await store.receive(events);
    } catch {
      app.log.warn(
        { event: 'whatsapp_receipt_storage_failure' },
        'Webhook persistence failed',
      );
      return reply.code(503).send({ error: 'Webhook temporarily unavailable' });
    }
    return reply.code(200).send({ status: 'received' });
  });
}
