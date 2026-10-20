'use client';
import { useEffect } from 'react';
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
          '(min-width: 1024px) and (min-height: 720px) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
          () => {
            if (!story) return;
            const chapters = Array.from(
              story.querySelectorAll<HTMLElement>('[data-chapter]'),
            );
            const panels = Array.from(
              story.querySelectorAll<HTMLElement>('[data-panel]'),
            );
            const progress = Array.from(
              story.querySelectorAll<HTMLElement>('[data-progress]'),
            );
            const links = Array.from(
              story.querySelectorAll<HTMLAnchorElement>('.chapter-nav a'),
            );
            story.dataset.enhanced = 'true';
            story.classList.remove('is-rest');
            story.classList.add('is-live');
            let active = -1;
            const show = (index: number, instant = false) => {
              if (index === active) return;
              active = index;
              story.dataset.activeChapter = String(index);
              panels.forEach((panel, position) =>
                gsap.to(panel, {
                  autoAlpha: position === index ? 1 : 0,
                  y: position === index ? 0 : 14,
                  duration: instant ? 0 : 0.22,
                  overwrite: true,
                }),
              );
              progress.forEach(
                (bar, position) =>
                  (bar.dataset.active = String(position === index)),
              );
              links.forEach((link, position) => {
                if (position === index)
                  link.setAttribute('aria-current', 'step');
                else link.removeAttribute('aria-current');
              });
            };
            show(0, true);
            ScrollTrigger.create({
              trigger: '.journey-body',
              pin: '.journey-visual',
              start: 'top 96px',
              end: 'bottom bottom-=24px',
              pinSpacing: false,
              invalidateOnRefresh: true,
              id: 'beelicious-journey',
            });
            chapters.forEach((chapter, index) => {
              ScrollTrigger.create({
                trigger: chapter,
                start: 'top 55%',
                end: 'bottom 55%',
                onEnter: () => show(index),
                onEnterBack: () => show(index),
              });
            });
            ScrollTrigger.refresh();
            let current = 0;
            chapters.forEach((chapter, index) => {
              if (
                chapter.getBoundingClientRect().top <=
                window.innerHeight * 0.55
              )
                current = index;
            });
            show(current, true);
            return () => {
              panels.forEach((panel) => {
                gsap.killTweensOf(panel);
                panel.removeAttribute('style');
              });
              story.classList.remove('is-live');
              story.classList.add('is-rest');
              delete story.dataset.enhanced;
              delete story.dataset.activeChapter;
              links.forEach((link) => link.removeAttribute('aria-current'));
              progress.forEach((bar) => delete bar.dataset.active);
            };
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
