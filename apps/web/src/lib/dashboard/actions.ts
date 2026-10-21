'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { authClient } from './auth';
import { dashboardConfig } from './config';
export async function login(form: FormData) {
  const data = z
    .object({ email: z.email().max(254), password: z.string().min(1).max(256) })
    .safeParse(Object.fromEntries(form));
  const client = await authClient();
  if (!client || !data.success) redirect('/login?error=invalid');
  const result = await client.auth.signInWithPassword(data.data);
  if (result.error) redirect('/login?error=invalid');
  redirect('/dashboard');
}
export async function logout() {
  const client = await authClient();
  const result = await client?.auth.signOut({ scope: 'local' });
  if (result?.error) redirect('/dashboard?logout=failed');
  redirect('/login');
}
export async function recover(form: FormData) {
  const email = z.email().max(254).safeParse(form.get('email'));
  const origin = dashboardConfig()?.siteUrl;
  const client = await authClient();
  if (email.success && client && origin) {
    const url = new URL('/auth/callback', origin);
    if (
      url.protocol === 'https:' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === 'localhost'
    )
      await client.auth.resetPasswordForEmail(email.data, {
        redirectTo: url.toString(),
      });
  }
  redirect('/reset-password?sent=true');
}
export async function updatePassword(form: FormData) {
  const password = z.string().min(12).max(256).safeParse(form.get('password'));
  const client = await authClient();
  if (!client || !(await client.auth.getUser()).data.user) redirect('/login');
  if (
    !password.success ||
    (await client.auth.updateUser({ password: password.data })).error
  )
    redirect('/dashboard/password?error=true');
  redirect('/dashboard');
}
