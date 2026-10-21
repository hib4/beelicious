import { redirect } from 'next/navigation';
import { authClient } from '@/lib/dashboard/auth';
import { WorkspaceProvider } from '@/components/dashboard/workspace';
import '@/components/dashboard/dashboard.css';
export const metadata = {
  title: 'Dashboard Tenant — Beelicious',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const client = await authClient();
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!user) redirect('/login');
  return (
    <WorkspaceProvider account={user.email ?? 'Akun tenant'}>
      {children}
    </WorkspaceProvider>
  );
}
