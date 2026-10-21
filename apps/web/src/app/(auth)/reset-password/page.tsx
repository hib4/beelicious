import Link from 'next/link';
import { recover } from '@/lib/dashboard/actions';
import '@/components/dashboard/dashboard.css';
export default async function Reset({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;
  return (
    <main id="main" className="dashboard auth-page">
      <section className="auth-panel">
        <Link href="/login">Kembali ke masuk</Link>
        <h1>Pulihkan akses</h1>
        {sent ? (
          <p role="status">
            Jika akun terdaftar, tautan pemulihan akan dikirim. Periksa email
            kamu.
          </p>
        ) : (
          <form action={recover}>
            <label>
              Email
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <button className="dash-primary">Kirim tautan pemulihan</button>
          </form>
        )}
      </section>
    </main>
  );
}
