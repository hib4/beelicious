import Link from 'next/link';
import { login } from '@/lib/dashboard/actions';
import { authConfig } from '@/lib/dashboard/auth';
import '@/components/dashboard/dashboard.css';
export const metadata = {
  title: 'Masuk Tenant — Beelicious',
  robots: { index: false, follow: false },
};
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const enabled = !!authConfig();
  return (
    <main id="main" className="dashboard auth-page">
      <section className="auth-panel">
        <Link className="dash-brand" href="/">
          beelicious.
        </Link>
        <h1>Masuk ke ruang tenant</h1>
        <p>Kelola pesanan, menu, dan jadwal pickup di satu tempat.</p>
        {enabled ? (
          <form action={login}>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
              />
            </label>
            <label>
              Kata sandi
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={256}
              />
            </label>
            {error && (
              <p role="alert">
                Tidak dapat masuk. Periksa email dan kata sandi, lalu coba
                kembali.
              </p>
            )}
            <button className="dash-primary">Masuk</button>
            <Link href="/reset-password">Lupa kata sandi?</Link>
          </form>
        ) : (
          <p role="status">
            Dashboard belum dikonfigurasi. Hubungi pengelola untuk mengaktifkan
            akses tenant.
          </p>
        )}
        <p className="dash-muted">
          Akses hanya untuk pemilik dan staf yang telah didaftarkan.
        </p>
      </section>
    </main>
  );
}
