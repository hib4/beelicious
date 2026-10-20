import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/components/marketing/experience-motion', () => ({
  ExperienceMotion: () => null,
}));
import Home from '../src/app/(marketing)/page';
import { Header } from '../src/components/marketing/header';
import { WhatsAppCta } from '../src/components/marketing/whatsapp-cta';
describe('landing page', () => {
  it('renders every requested section and marks examples honestly', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'LAPAR?CHAT AJA.',
    );
    for (const id of ['cara-kerja', 'tenant', 'pengalaman', 'tentang'])
      expect(document.getElementById(id)).toBeInTheDocument();
    expect(screen.getAllByText('Warung Babe').length).toBeGreaterThan(0);
    expect(screen.getByText('Contoh tenant pilot')).toBeInTheDocument();
    expect(
      screen.getByText(/foto asli tenant belum tersedia/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Bagian contoh percakapan' }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll('[data-chapter]')).toHaveLength(6);
    expect(document.querySelectorAll('[data-editorial-photo]')).toHaveLength(3);
    expect(screen.getByText('Pexels License')).toHaveAttribute(
      'href',
      'https://www.pexels.com/license/',
    );
    expect(screen.getByAltText(/Bee-bot, maskot/)).toHaveAttribute(
      'alt',
      expect.stringContaining('dua mata hitam'),
    );
    for (const anchor of document.querySelectorAll('a[href^="#"]'))
      expect(
        document.querySelector(anchor.getAttribute('href')!),
      ).not.toBeNull();
  });
  it('does not create a broken ordering link', () => {
    render(<WhatsAppCta />);
    expect(screen.getByRole('button', { name: 'Segera Hadir' })).toBeDisabled();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
  it('uses an accessible external link when configured', () => {
    render(<WhatsAppCta href="https://wa.me/6281234567890?text=Halo" />);
    expect(
      screen.getByRole('link', { name: 'Pesan via WhatsApp' }),
    ).toHaveAttribute('rel', 'noopener noreferrer');
  });
  it('opens mobile navigation, follows anchors, and closes on Escape', () => {
    render(<Header />);
    const trigger = screen.getByRole('button', { name: 'Buka navigasi' });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(
      screen
        .getByRole('navigation', { name: 'Navigasi seluler' })
        .querySelector('a')!,
    );
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });
});
