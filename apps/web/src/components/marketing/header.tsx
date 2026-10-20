'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import { navigation } from '@/lib/content';
export function Header({ cta }: { cta?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLElement>(null);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const resize = () => {
      if (window.innerWidth >= 1024) setOpen(false);
    };
    window.addEventListener('keydown', close);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('keydown', close);
      window.removeEventListener('resize', resize);
    };
  }, [open]);
  return (
    <header
      className="site-header"
      ref={container}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <div className="header-inner">
        <a href="#top" className="wordmark" aria-label="Beelicious — beranda">
          beelicious<span aria-hidden="true">.</span>
        </a>
        <nav className="desktop-nav" aria-label="Navigasi utama">
          {navigation.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          {cta}
          <button
            ref={trigger}
            className="nav-toggle"
            aria-label={open ? 'Tutup navigasi' : 'Buka navigasi'}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>
      <nav
        id="mobile-navigation"
        className="mobile-nav"
        aria-label="Navigasi seluler"
        hidden={!open}
      >
        {navigation.map((item) => (
          <a key={item.href} href={item.href} onClick={() => setOpen(false)}>
            {item.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
