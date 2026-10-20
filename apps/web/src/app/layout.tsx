import type { Metadata } from 'next';
import '@fontsource-variable/plus-jakarta-sans/wght.css';
import '@fontsource-variable/inter/wght.css';
import './globals.css';
import { publicConfig } from '@/lib/public-config';
export const metadata: Metadata = {
  ...(publicConfig.siteUrl
    ? {
        metadataBase: new URL(publicConfig.siteUrl),
        alternates: { canonical: '/' },
      }
    : {}),
  title: 'Beelicious — Lapar? Chat Aja. Makanan Siap!',
  description:
    'Kenali Beelicious, platform pemesanan makanan lewat WhatsApp. Pilih tenant, jelajahi menu, dan atur pickup dalam satu percakapan. Saat ini dalam tahap pilot.',
  robots: { index: false, follow: false },
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    siteName: 'Beelicious',
    title: 'Lapar? Chat Aja. Makanan Siap!',
    description: 'Dari pilih menu sampai atur pickup, mulai lewat WhatsApp.',
    ...(publicConfig.siteUrl
      ? {
          images: [
            {
              url: `${publicConfig.siteUrl}/brand/bee-bot.png`,
              width: 1254,
              height: 1254,
              alt: 'Bee-bot Beelicious',
            },
          ],
        }
      : {}),
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>
        <a className="skip-link" href="#main">
          Langsung ke konten
        </a>
        {children}
      </body>
    </html>
  );
}
