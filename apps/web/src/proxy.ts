import { dashboardConfig } from '@/lib/dashboard/config';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
export async function proxy(request: NextRequest) {
  const configuration = dashboardConfig();
  if (!configuration) return NextResponse.next();
  const { url, key } = configuration;
  let response = NextResponse.next({ request });
  const client = createServerClient(url, key, {
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  await client.auth.getUser().catch(() => null);
  response.headers.set('cache-control', 'private, no-store');
  return response;
}
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/login',
    '/reset-password',
    '/api/dashboard/:path*',
  ],
};
