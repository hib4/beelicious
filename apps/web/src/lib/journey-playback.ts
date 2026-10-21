import type { gsap as Gsap } from 'gsap';
import { journeySteps } from './journey';

export const replyReadSeconds = (text: string) =>
  Math.min(4, Math.max(2, text.length / 60));

/** The animated copy is decorative; the server-rendered transcript stays readable. */
export function mountJourneyPlayback(story: HTMLElement, gsap: typeof Gsap) {
  const track = story.querySelector<HTMLElement>('[data-chat-track]')!;
  const viewport = story.querySelector<HTMLElement>('.journey-chat-viewport')!;
  const exchanges = Array.from(
    story.querySelectorAll<HTMLElement>('[data-exchange]'),
  );
  const explanations = Array.from(
    story.querySelectorAll<HTMLElement>('[data-explanation]'),
  );
  const links = Array.from(
    story.querySelectorAll<HTMLAnchorElement>('[data-select-chapter]'),
  );
  const typing = story.querySelector<HTMLElement>('[data-typing]')!;
  const toggle = story.querySelector<HTMLButtonElement>(
    '[data-playback-toggle]',
  )!;
  const replay = story.querySelector<HTMLButtonElement>(
    '[data-playback-replay]',
  )!;
  const label = story.querySelector<HTMLElement>('[data-playback-label]')!;
  const transcript = story.querySelector<HTMLDetailsElement>(
    '.journey-full-transcript',
  )!;
  const transcriptWasOpen = transcript.open;
  let timeline: gsap.core.Timeline;
  let animations: gsap.core.Tween[] = [];
  let inView = false;
  let manualPause = false;
  let complete = false;
  let disposed = false;
  story.dataset.playback = 'true';
  transcript.open = false;

  const setChapter = (index: number) => {
    story.dataset.activeChapter = String(index);
    explanations.forEach((copy, position) => {
      copy.hidden = position !== index;
    });
    links.forEach((link, position) => {
      if (position === index) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
  };
  const follow = (instant = false) => {
    if (disposed) return;
    const y = -Math.max(0, track.scrollHeight - viewport.clientHeight);
    gsap.killTweensOf(track);
    if (instant) gsap.set(track, { y });
    else
      animations.push(
        gsap.to(track, {
          y,
          duration: 0.35,
          ease: 'power2.out',
          overwrite: true,
        }),
      );
  };
  const arrive = (element: HTMLElement) => {
    element.hidden = false;
    animations.push(
      gsap.fromTo(
        element,
        { y: 8, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.18, ease: 'power2.out' },
      ),
    );
    follow();
  };
  const sync = () => {
    const running = inView && !document.hidden && !manualPause && !complete;
    timeline.paused(!running);
    animations.forEach((animation) => animation.paused(!running));
    story.dataset.playbackStatus = complete
      ? 'complete'
      : running
        ? 'playing'
        : 'paused';
    toggle.textContent = manualPause || complete ? 'Lanjutkan' : 'Jeda';
    toggle.disabled = complete;
    label.textContent = complete
      ? 'Cerita selesai. Putar ulang untuk melihat lagi.'
      : running
        ? 'Ilustrasi percakapan sedang diputar.'
        : 'Percakapan dijeda.';
  };
  const resetAnimations = () => {
    timeline?.kill();
    animations.forEach((animation) => animation.kill());
    animations = [];
    gsap.killTweensOf(track);
    gsap.set(track, { y: 0 });
    typing.hidden = true;
    story.dataset.chatPhase = 'waiting';
    exchanges.forEach((exchange) => {
      exchange.hidden = true;
      for (const bubble of exchange.querySelectorAll<HTMLElement>('p')) {
        bubble.hidden = true;
        bubble.removeAttribute('style');
      }
    });
  };
  const prepare = (start: number) => {
    timeline = gsap.timeline({
      paused: true,
      onComplete: () => {
        complete = true;
        sync();
      },
    });
    for (let index = start; index < exchanges.length; index++) {
      const exchange = exchanges[index]!;
      const customer = exchange.querySelector<HTMLElement>('[data-customer]')!;
      const response = exchange.querySelector<HTMLElement>('[data-response]')!;
      timeline
        .call(() => {
          setChapter(index);
          exchange.hidden = false;
          story.dataset.chatPhase = 'customer';
          arrive(customer);
        })
        .to({}, { duration: 0.5 })
        .call(() => {
          story.dataset.chatPhase = 'typing';
          typing.hidden = false;
          follow();
        })
        .to({}, { duration: 0.9 })
        .call(() => {
          typing.hidden = true;
          story.dataset.chatPhase = 'reply';
          arrive(response);
        })
        .to({}, { duration: replyReadSeconds(journeySteps[index]!.response) });
    }
  };
  const restart = () => {
    resetAnimations();
    manualPause = false;
    complete = false;
    setChapter(0);
    prepare(0);
    sync();
  };
  const pause = () => {
    manualPause = !manualPause;
    sync();
  };
  const select = (event: MouseEvent) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>(
      '[data-select-chapter]',
    );
    if (
      !link ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const index = links.indexOf(link);
    if (index < 0) return;
    event.preventDefault();
    resetAnimations();
    exchanges.forEach((exchange, position) => {
      exchange.hidden = position > index;
      exchange.querySelectorAll<HTMLElement>('p').forEach((bubble) => {
        bubble.hidden = position > index;
      });
    });
    setChapter(index);
    manualPause = true;
    complete = index === exchanges.length - 1;
    prepare(index + 1);
    follow(true);
    sync();
  };
  resetAnimations();
  setChapter(0);
  prepare(0);
  const observer = new IntersectionObserver(
    ([entry]) => {
      inView = !!entry && entry.intersectionRatio >= 0.25;
      sync();
    },
    { threshold: [0, 0.25] },
  );
  observer.observe(viewport);
  const resize = new ResizeObserver(() => follow(true));
  resize.observe(viewport);
  toggle.addEventListener('click', pause);
  replay.addEventListener('click', restart);
  story.addEventListener('click', select);
  document.addEventListener('visibilitychange', sync);
  void document.fonts.ready.then(() => follow(true));
  sync();
  return () => {
    disposed = true;
    observer.disconnect();
    resize.disconnect();
    timeline.kill();
    animations.forEach((animation) => animation.kill());
    gsap.killTweensOf(track);
    track.removeAttribute('style');
    exchanges.forEach((exchange) => {
      exchange.hidden = false;
      exchange.querySelectorAll<HTMLElement>('p').forEach((bubble) => {
        bubble.hidden = false;
        bubble.removeAttribute('style');
      });
    });
    typing.hidden = true;
    transcript.open = transcriptWasOpen;
    links.forEach((link) => link.removeAttribute('aria-current'));
    toggle.removeEventListener('click', pause);
    replay.removeEventListener('click', restart);
    story.removeEventListener('click', select);
    document.removeEventListener('visibilitychange', sync);
    delete story.dataset.playback;
    delete story.dataset.activeChapter;
    delete story.dataset.playbackStatus;
    delete story.dataset.chatPhase;
  };
}
