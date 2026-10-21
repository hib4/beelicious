import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DomainError } from '../catalog/validation.js';
import { DashboardError, DashboardService } from './service.js';
import type { IdentityVerifier } from './config.js';
export function registerDashboardRoutes(
  app: FastifyInstance,
  service: DashboardService,
  verify: IdentityVerifier,
) {
  app.addHook('onRequest', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const match = /^Bearer ([^\s]{1,8192})$/.exec(
      request.headers.authorization ?? '',
    );
    const user = match ? await verify(match[1]!).catch(() => null) : null;
    if (!user)
      return reply.code(401).send({
        error: { code: 'unauthenticated', message: 'Silakan masuk kembali.' },
      });
    identities.set(request, user);
  });
  app.setErrorHandler((error, _request, reply) => {
    const status =
      error instanceof DashboardError
        ? error.status
        : error instanceof z.ZodError
          ? 400
          : error instanceof DomainError
            ? {
                invalid_input: 400,
                not_found: 404,
                conflict: 409,
                unavailable: 503,
              }[error.code]
            : 503;
    const code =
      error instanceof DashboardError || error instanceof DomainError
        ? error.code
        : status === 400
          ? 'invalid_input'
          : 'service_unavailable';
    const message =
      status === 409
        ? 'Data berubah atau perubahan tidak aman. Muat ulang dan periksa kembali.'
        : status === 403
          ? 'Kamu tidak memiliki izin untuk tindakan ini.'
          : status === 404
            ? 'Data tidak ditemukan.'
            : status === 400
              ? 'Periksa kembali data yang dimasukkan.'
              : 'Layanan belum tersedia. Coba kembali.';
    if (status === 503)
      app.log.warn(
        { event: 'dashboard_request_failed' },
        'Dashboard request unavailable',
      );
    return reply.code(status).send({ error: { code, message } });
  });
  const scope = (r: FastifyRequest) => ({
    user: identities.get(r)!,
    tenant: z.uuid().parse(r.headers['x-tenant-id']),
  });
  const params = (r: FastifyRequest) =>
    z.object({ id: z.uuid() }).parse(r.params).id;
  app.get('/memberships', async (r) => ({
    data: await service.memberships(identities.get(r)!),
  }));
  app.get('/overview', async (r) => {
    const s = scope(r);
    return { data: await service.overview(s.user, s.tenant) };
  });
  app.get('/orders', async (r) => {
    const s = scope(r);
    return { data: await service.orders(s.user, s.tenant, r.query) };
  });
  app.get('/orders/:id', async (r) => {
    const s = scope(r);
    return { data: await service.detail(s.user, s.tenant, params(r)) };
  });
  app.post('/orders/:id/transition', async (r) => {
    const s = scope(r);
    return {
      data: await service.transition(s.user, s.tenant, params(r), r.body),
    };
  });
  app.get('/menu', async (r) => {
    const s = scope(r);
    return { data: await service.menu(s.user, s.tenant, r.query) };
  });
  app.post('/menu', async (r, reply) => {
    const s = scope(r);
    return reply
      .code(201)
      .send({ data: await service.mutateMenu(s.user, s.tenant, null, r.body) });
  });
  app.patch('/menu/:id', async (r) => {
    const s = scope(r);
    return {
      data: await service.mutateMenu(s.user, s.tenant, params(r), r.body),
    };
  });
  app.patch('/menu/:id/availability', async (r) => {
    const s = scope(r);
    return {
      data: await service.mutateMenu(s.user, s.tenant, params(r), r.body, true),
    };
  });
  app.post('/categories', async (r, reply) => {
    const s = scope(r);
    return reply
      .code(201)
      .send({ data: await service.category(s.user, s.tenant, null, r.body) });
  });
  app.patch('/categories/:id', async (r) => {
    const s = scope(r);
    return {
      data: await service.category(s.user, s.tenant, params(r), r.body),
    };
  });
  app.get('/pickup', async (r) => {
    const s = scope(r);
    return { data: await service.pickup(s.user, s.tenant, r.query) };
  });
  app.patch('/pickup/:id', async (r) => {
    const s = scope(r);
    return {
      data: await service.updateSlot(s.user, s.tenant, params(r), r.body),
    };
  });
  app.patch('/operating-hours', async (r) => {
    const s = scope(r);
    return { data: await service.updateHours(s.user, s.tenant, r.body) };
  });
  app.get('/settings', async (r) => {
    const s = scope(r);
    return { data: await service.settings(s.user, s.tenant) };
  });
  app.patch('/settings', async (r) => {
    const s = scope(r);
    return { data: await service.updateSettings(s.user, s.tenant, r.body) };
  });
}
const identities = new WeakMap<FastifyRequest, string>();
