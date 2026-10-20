import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import type { MerchantContent } from '@/lib/content';
import { WhatsAppCta } from './whatsapp-cta';
export function MerchantSpotlight({ merchant }: { merchant: MerchantContent }) {
  return (
    <article className="page-frame merchant-spotlight">
      <h2 data-arrive>{merchant.name}</h2>
      <div className="merchant-story">
        <p className="merchant-status">{merchant.label}</p>
        <p>{merchant.description}</p>
        <p>
          Katalog pilot berisi contoh pengembangan. Informasi layanan publik dan
          foto asli tenant belum tersedia.
        </p>
        {merchant.availability && <p>{merchant.availability}</p>}
        {merchant.orderingAvailable ? (
          <WhatsAppCta />
        ) : (
          <a className="editorial-link" href="#cara-kerja">
            Lihat alur pilot
            <ArrowUpRight size={20} aria-hidden="true" />
          </a>
        )}
      </div>
      {merchant.image && (
        <Image
          className="verified-merchant-photo"
          src={merchant.image.src}
          alt={merchant.image.alt}
          width={1200}
          height={800}
          sizes="100vw"
        />
      )}
    </article>
  );
}
