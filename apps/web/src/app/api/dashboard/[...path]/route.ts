import { dashboardConfig } from '@/lib/dashboard/config';
import { authClient } from '@/lib/dashboard/auth';
const allowed =
  /^(memberships|overview|orders(?:\/[0-9a-f-]{36}(?:\/transition)?)?|menu(?:\/[0-9a-f-]{36}(?:\/availability)?)?|categories(?:\/[0-9a-f-]{36})?|pickup(?:\/[0-9a-f-]{36})?|operating-hours|settings)$/;
async function forward(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const path = (await params).path.join('/');
  if (!allowed.test(path))
    return Response.json(
      { error: { message: 'Tidak ditemukan.' } },
      { status: 404 },
    );
  const configuration = dashboardConfig();
  if (!configuration)
    return Response.json(
      { error: { message: 'Layanan belum dikonfigurasi.' } },
      { status: 503 },
    );
  if (
    request.method !== 'GET' &&
    request.headers.get('origin') !== new URL(configuration.siteUrl).origin
  )
    return Response.json(
      { error: { message: 'Permintaan tidak diizinkan.' } },
      { status: 403 },
    );
  const client = await authClient();
  const { data } = client
    ? await client.auth.getSession()
    : { data: { session: null } };
  if (!data.session)
    return Response.json(
      { error: { message: 'Silakan masuk kembali.' } },
      { status: 401 },
    );
  const base = configuration.apiUrl;
  try {
    const target = new URL(`/api/v1/tenant-dashboard/${path}`, base);
    target.search = new URL(request.url).search;
    const body = request.method === 'GET' ? undefined : await request.text();
    if (body && body.length > 65536)
      return Response.json(
        { error: { message: 'Permintaan terlalu besar.' } },
        { status: 413 },
      );
    const response = await fetch(target, {
      method: request.method,
      headers: {
        authorization: `Bearer ${data.session.access_token}`,
        'x-tenant-id': request.headers.get('x-tenant-id') ?? '',
        'content-type': 'application/json',
      },
      ...(body ? { body } : {}),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'private, no-store',
      },
    });
  } catch {
    return Response.json(
      { error: { message: 'Layanan tidak dapat dihubungi. Coba kembali.' } },
      { status: 503 },
    );
  }
}
export { forward as GET, forward as POST, forward as PATCH };
