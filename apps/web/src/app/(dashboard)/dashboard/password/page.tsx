import { updatePassword } from '@/lib/dashboard/actions';
export default async function Password({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <section>
      <h1>Ganti kata sandi</h1>
      <form action={updatePassword} className="dash-form">
        <label>
          Kata sandi baru
          <input
            name="password"
            type="password"
            minLength={12}
            maxLength={256}
            autoComplete="new-password"
            required
          />
        </label>
        {error && (
          <p role="alert">Gunakan minimal 12 karakter. Coba kembali.</p>
        )}
        <button className="dash-primary">Simpan kata sandi</button>
      </form>
    </section>
  );
}
