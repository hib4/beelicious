import { updatePassword } from '@/lib/dashboard/actions';
import { PageHeading } from '@/components/dashboard/workspace';
export default async function Password({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="dash-page dash-password">
      <PageHeading
        title="Ganti kata sandi"
        description="Gunakan minimal 12 karakter. Kata sandi dikelola oleh layanan autentikasi, bukan disimpan oleh Beelicious."
      />
      <form action={updatePassword} className="dash-card dash-panel dash-form">
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
          <p role="alert" className="dash-error">
            Gunakan minimal 12 karakter. Coba kembali.
          </p>
        )}
        <div className="dash-form-actions">
          <button className="dash-button is-primary">Simpan kata sandi</button>
        </div>
      </form>
    </div>
  );
}
