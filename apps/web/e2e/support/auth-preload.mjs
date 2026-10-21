// Only loaded explicitly by the browser test runner; never imported by application code.
if (process.env.BEELICIOUS_DASHBOARD_E2E !== 'true')
  throw new Error('Explicit E2E harness required');
const owner = '11111111-1111-4111-8111-111111111111',
  staff = '22222222-2222-4222-8222-222222222222';
const original = globalThis.fetch;
const user = (id) => ({
  id,
  aud: 'authenticated',
  role: 'authenticated',
  email: id === owner ? 'owner@example.test' : 'staff@example.test',
  email_confirmed_at: '2026-10-01T00:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [],
  created_at: '2026-10-01T00:00:00Z',
});
const encode = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (id) =>
  `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated', role: 'authenticated', session_id: '33333333-3333-4333-8333-333333333333' })}.test-signature`;
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === 'string' || input instanceof URL ? input : input.url,
  );
  if (url.origin !== 'https://auth.example.test') return original(input, init);
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  if (url.pathname.endsWith('/token')) {
    const body = JSON.parse(init?.body ?? '{}');
    const id =
      body.email === 'owner@example.test'
        ? owner
        : body.email === 'staff@example.test'
          ? staff
          : null;
    if (!id || body.password !== 'test-password-123')
      return Response.json(
        { msg: 'Invalid login credentials' },
        { status: 400 },
      );
    return Response.json({
      access_token: token(id),
      refresh_token: `test-refresh-${id}`,
      token_type: 'bearer',
      expires_in: 3600,
      user: user(id),
    });
  }
  if (url.pathname.endsWith('/user')) {
    try {
      const payload = JSON.parse(
        Buffer.from(
          (headers.get('authorization') ?? '').split('.')[1],
          'base64url',
        ).toString(),
      );
      if (
        payload.exp * 1000 > Date.now() &&
        [owner, staff].includes(payload.sub)
      )
        return Response.json(user(payload.sub));
    } catch {
      /* Invalid fixture credentials are rejected. */
    }
    return Response.json({ msg: 'Invalid token' }, { status: 401 });
  }
  if (url.pathname.endsWith('/logout'))
    return new Response(null, { status: 204 });
  return Response.json(
    { msg: 'Unsupported test auth operation' },
    { status: 400 },
  );
};
