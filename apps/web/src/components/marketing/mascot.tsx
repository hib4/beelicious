import Image from 'next/image';
export function Mascot({ closing = false }: { closing?: boolean }) {
  return (
    <div
      className={
        closing ? 'mascot-stage mascot-closing' : 'mascot-stage mascot-hero'
      }
      data-mascot={closing ? 'closing' : 'hero'}
    >
      <Image
        src="/brand/bee-bot.png"
        alt={
          closing
            ? ''
            : 'Bee-bot, maskot Beelicious dengan kepala kuning, wajah ivory, dan dua mata hitam.'
        }
        width={1254}
        height={1254}
        sizes={
          closing
            ? '(max-width: 767px) 65vw, 40vw'
            : '(max-width: 767px) 88vw, 55vw'
        }
        {...(closing ? { loading: 'lazy' as const } : { preload: true })}
      />
    </div>
  );
}
