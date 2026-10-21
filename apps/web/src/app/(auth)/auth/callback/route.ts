import { NextResponse } from 'next/server';
import { authClient } from '@/lib/dashboard/auth';
export async function GET(request: Request) {
  const url = new URL(request.url),
    code = url.searchParams.get('code');
  const client = await authClient();
  if (code && client) {
    const result = await client.auth.exchangeCodeForSession(code);
    if (!result.error)
      return NextResponse.redirect(new URL('/dashboard/password', url));
  }
  return NextResponse.redirect(new URL('/login?error=invalid', url));
}
