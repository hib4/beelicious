'use client';
import { useEffect } from 'react';
import { mountJourneyPlayback } from '@/lib/journey-playback';
/** Progressive enhancement only: every chapter remains readable without this module. */
export function ExperienceMotion() {
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void Promise.all([import('gsap'), import('gsap/ScrollTrigger')])
      .then(([{ gsap }, { ScrollTrigger }]) => {
        if (disposed) return;
        gsap.registerPlugin(ScrollTrigger);
        const media = gsap.matchMedia();
        const root = document.querySelector<HTMLElement>('[data-experience]');
        if (!root) return;
        const story = root.querySelector<HTMLElement>('[data-journey]');
        media.add(
          '(prefers-reduced-motion: no-preference)',
          () => {
            const intro = gsap.timeline({
              defaults: { duration: 0.8, ease: 'power3.out' },
            });
            intro
              .fromTo('[data-hero-line]', { y: 24 }, { y: 0, stagger: 0.1 })
              .fromTo(
                '[data-mascot="hero"]',
                { y: 36, rotation: -3 },
                { y: 0, rotation: 0, duration: 1 },
                0.05,
              );
            gsap.to('[data-mascot="hero"]', {
              y: -55,
              rotation: 4,
              ease: 'none',
              scrollTrigger: {
                trigger: '.hero',
                start: 'top top',
                end: 'bottom top',
                scrub: true,
              },
            });
            gsap.fromTo(
              '.kinetic-words',
              { xPercent: 3 },
              {
                xPercent: -3,
                ease: 'none',
                scrollTrigger: {
                  trigger: '.kinetic',
                  start: 'top bottom',
                  end: 'bottom top',
                  scrub: true,
                },
              },
            );
            gsap.utils
              .toArray<HTMLElement>('[data-editorial-photo]')
              .forEach((photo) => {
                gsap.fromTo(
                  photo,
                  { scale: 1.04, yPercent: 3 },
                  {
                    scale: 1,
                    yPercent: -3,
                    ease: 'none',
                    scrollTrigger: {
                      trigger: photo.parentElement,
                      start: 'top bottom',
                      end: 'bottom top',
                      scrub: true,
                    },
                  },
                );
              });
            gsap.utils
              .toArray<HTMLElement>('[data-arrive]')
              .forEach((element) => {
                gsap.fromTo(
                  element,
                  { y: 20 },
                  {
                    y: 0,
                    duration: 0.7,
                    ease: 'power3.out',
                    scrollTrigger: {
                      trigger: element,
                      start: 'top 92%',
                      toggleActions: 'play none none reverse',
                    },
                  },
                );
              });
            gsap.fromTo(
              '[data-mascot="closing"]',
              { y: 50, rotation: -5 },
              {
                y: 0,
                rotation: 0,
                ease: 'none',
                scrollTrigger: {
                  trigger: '.closing',
                  start: 'top bottom',
                  end: 'bottom bottom',
                  scrub: true,
                },
              },
            );
          },
          root,
        );
        media.add(
          '(prefers-reduced-motion: no-preference)',
          () => {
            if (story) return mountJourneyPlayback(story, gsap);
          },
          root,
        );
        cleanup = () => media.revert();
        void document.fonts.ready.then(() => {
          if (!disposed) ScrollTrigger.refresh();
        });
      })
      .catch(() => {
        /* The server-rendered vertical story is the fallback. */
      });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
  return null;
}
