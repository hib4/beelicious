import Image from 'next/image';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { Header } from '@/components/marketing/header';
import { Mascot } from '@/components/marketing/mascot';
import { WhatsAppCta } from '@/components/marketing/whatsapp-cta';
import { Journey } from '@/components/marketing/journey';
import { ExperienceMotion } from '@/components/marketing/experience-motion';
import { MerchantSpotlight } from '@/components/marketing/merchant-spotlight';
import { merchants, navigation } from '@/lib/content';
import { editorialPhotos } from '@/lib/editorial';
export default function Home() {
  return (
    <>
      <Header cta={<WhatsAppCta compact />} />
      <main id="main" data-experience>
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="page-frame hero-scene">
            <div className="hero-copy">
              <h1 id="hero-title">
                <span data-hero-line>LAPAR?</span>
                <span data-hero-line>CHAT AJA.</span>
              </h1>
              <p className="hero-description">
                Pesan makanan lewat WhatsApp.
                <br />
                Pilih menu. Atur pickup. Lanjut dari chat.
              </p>
              <div className="hero-action">
                <WhatsAppCta />
              </div>
              <p className="pilot-note">
                Pilot terbatas untuk pengguna yang diundang.
              </p>
            </div>
            <div className="hero-art">
              <Mascot />
            </div>
            <a
              className="scroll-invitation"
              href="#jelajah"
              aria-label="Jelajahi cerita Beelicious"
            >
              <ArrowDown size={18} aria-hidden="true" />
            </a>
          </div>
        </section>
        <section className="kinetic" aria-label="Chat. Pilih. Pick up.">
          <div className="kinetic-words" aria-hidden="true">
            <span>CHAT.</span>
            <span>PILIH.</span>
            <span>PICK UP.</span>
          </div>
        </section>
        <section
          className="food-editorial"
          id="jelajah"
          aria-labelledby="food-title"
        >
          <div className="page-frame food-grid">
            <h2 id="food-title" data-arrive>
              BIKIN
              <br />
              LAPAR.
            </h2>
            <p className="food-intro">
              Tentang rasa yang familiar, pilihan yang beragam, dan obrolan yang
              mengantarmu ke menu berikutnya.
            </p>
            {editorialPhotos.map((photo, index) => (
              <figure
                className={`food-photo food-photo-${index + 1}`}
                key={photo.src}
              >
                <div className="photo-window">
                  <Image
                    data-editorial-photo
                    src={photo.image}
                    alt={photo.alt}
                    width={photo.width}
                    height={photo.height}
                    sizes={
                      index === 0
                        ? '(max-width: 767px) 100vw, 70vw'
                        : '(max-width: 767px) 100vw, 45vw'
                    }
                  />
                </div>
                <figcaption>{photo.label}</figcaption>
              </figure>
            ))}
          </div>
        </section>
        <Journey />
        <section
          className="merchant-editorial"
          id="tenant"
          aria-label="Tenant pilot"
        >
          {merchants.map((merchant) => (
            <MerchantSpotlight key={merchant.name} merchant={merchant} />
          ))}
        </section>
        <section
          className="manifesto"
          id="tentang"
          aria-labelledby="manifesto-title"
        >
          <div className="page-frame">
            <h2 id="manifesto-title" data-arrive>
              Bukan
              <br />
              restoran.
            </h2>
            <div className="manifesto-copy">
              <p className="manifesto-statement">
                Cara baru buat
                <br />
                pesan makanan.
              </p>
              <p>
                Beelicious menghubungkan kamu dengan tenant makanan melalui
                percakapan WhatsApp. Makanan dari tenant, pilihan dan jadwal
                pickup dalam satu alur.
              </p>
              <p className="manifesto-note">
                Bukan dapur. Bukan layanan pengantaran.
              </p>
            </div>
          </div>
        </section>
        <section className="closing" aria-labelledby="closing-title">
          <div className="page-frame closing-scene">
            <div className="closing-copy">
              <h2 id="closing-title" data-arrive>
                TINGGAL
                <br />
                CHAT!
              </h2>
              <p>
                Makanan favoritmu.
                <br />
                Mulai dari satu “Halo”.
              </p>
              <WhatsAppCta />
              <p className="pilot-note">
                Akses pilot terbatas. Belum melayani pembayaran produksi.
              </p>
            </div>
            <Mascot closing />
          </div>
        </section>
        <ExperienceMotion />
      </main>
      <footer className="site-footer">
        <div className="page-frame">
          <a
            href="#top"
            className="footer-wordmark"
            aria-label="Beelicious — kembali ke atas"
          >
            beelicious.
          </a>
          <div className="footer-details">
            <p>
              Pesan lewat chat.
              <br />
              Ambil sesuai rencana.
            </p>
            <nav aria-label="Navigasi footer">
              {navigation.map(({ href, label }) => (
                <a key={href} href={href}>
                  {label}
                  <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              ))}
            </nav>
            <p>
              Beelicious
              <br />
              Pilot pengembangan
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
