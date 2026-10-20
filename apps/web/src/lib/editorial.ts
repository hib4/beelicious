import nasiGoreng from '../../public/editorial/nasi-goreng.jpg';
import sateAyam from '../../public/editorial/sate-ayam.jpg';
import esTeh from '../../public/editorial/es-teh.jpg';

/** Static imports give replacements content-hashed image URLs. */
export const editorialPhotos = [
  {
    src: '/editorial/nasi-goreng.jpg',
    image: nasiGoreng,
    alt: 'Nasi goreng dengan telur dan kerupuk di atas meja kayu.',
    label: 'Nasi goreng, hangat dan familiar.',
    width: 1800,
    height: 2696,
    title: 'Delicious Indonesian Fried Rice with Egg',
    creator: 'Dicky Agustian',
    source:
      'https://www.pexels.com/photo/delicious-indonesian-fried-rice-with-egg-32938734/',
    license: 'Pexels License',
    licenseUrl: 'https://www.pexels.com/license/',
    original:
      'https://images.pexels.com/photos/32938734/pexels-photo-32938734.jpeg?auto=compress&cs=tinysrgb&w=1800',
    modifications:
      'Ukuran dan bingkai tampilan disesuaikan; warna tidak diubah.',
  },
  {
    src: '/editorial/sate-ayam.jpg',
    image: sateAyam,
    alt: 'Sate ayam panggang di atas piring.',
    label: 'Sate ayam, dekat dengan keseharian.',
    width: 4896,
    height: 2760,
    title: 'Sate Ayam Panggang',
    creator: 'Meandkancil2020',
    source: 'https://commons.wikimedia.org/wiki/File:Sate_Ayam_Panggang.jpg',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    original:
      'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/44/Sate_Ayam_Panggang.jpg/1920px-Sate_Ayam_Panggang.jpg',
    modifications:
      'Ukuran dan bingkai tampilan disesuaikan; warna tidak diubah.',
  },
  {
    src: '/editorial/es-teh.jpg',
    image: esTeh,
    alt: 'Dua gelas es teh di depan dinding kayu.',
    label: 'Es teh, jeda yang menyegarkan.',
    width: 4000,
    height: 6000,
    title: 'Iced lychee tea and Es teh manis - Bali 2025-09-25',
    creator: 'Andy Li',
    source:
      'https://commons.wikimedia.org/wiki/File:Iced_lychee_tea_and_Es_teh_manis_-_Bali_2025-09-25.jpg',
    license: 'CC0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/deed.en',
    original:
      'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d4/Iced_lychee_tea_and_Es_teh_manis_-_Bali_2025-09-25.jpg/1920px-Iced_lychee_tea_and_Es_teh_manis_-_Bali_2025-09-25.jpg',
    modifications:
      'Ukuran dan bingkai tampilan disesuaikan; warna tidak diubah.',
  },
] as const;
