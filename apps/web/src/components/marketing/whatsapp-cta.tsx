import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { publicConfig } from '@/lib/public-config';
export function WhatsAppCta({
  compact = false,
  href = publicConfig.whatsappUrl,
}: {
  compact?: boolean;
  href?: string | undefined;
}) {
  if (!href)
    return (
      <Button disabled size={compact ? 'small' : 'default'}>
        Segera Hadir
      </Button>
    );
  return (
    <Button asChild size={compact ? 'small' : 'default'}>
      <a href={href} target="_blank" rel="noopener noreferrer">
        Pesan via WhatsApp
        <ArrowUpRight size={18} aria-hidden="true" />
      </a>
    </Button>
  );
}
