export const navigation = [
  { href: '#cara-kerja', label: 'Cara Kerja' },
  { href: '#tenant', label: 'Tenant' },
  { href: '#tentang', label: 'Tentang Beelicious' },
] as const;
export interface MerchantContent {
  name: string;
  description: string;
  label: string;
  image: { src: string; alt: string } | null;
  /** Include only explicitly verified merchant information. */
  availability?: string;
  orderingAvailable: boolean;
}
export const merchants: readonly MerchantContent[] = [
  {
    name: 'Warung Babe',
    description: 'Tenant makanan Indonesia untuk pilot Beelicious.',
    label: 'Contoh tenant pilot',
    image: null,
    orderingAvailable: false,
  },
] as const;
