# SPEC — Beelicious · "Balas Angka"

GOAL: The viewer leaves knowing you order campus food by replying to Beelicious on WhatsApp with numbers, pay with QRIS, and walk up at your pickup time, and they feel the snap of how quick it is.

OUTPUT: HyperFrames, 1920 × 1080, 60 fps, seamless loop.

TIME: 26.0 s × 60 = 1560 frames. 120 BPM: 1 beat = 30 frames (0.5 s), 1 bar = 120 frames (2.0 s), 13 bars.
Bar n starts at (n−1) × 2.1333 s, computed from its index and never accumulated.

MUSIC: "Hustle" (Kevin MacLeod, CC BY 3.0), a punchy percussion-and-bass groove chosen to match the Apple-promo reference. A 13-bar excerpt at its native 120 BPM, crossfaded so it loops (`assets/audio/bed-loop.wav`). Hard stops: the bed is silent from bayar+0 to the Rp60.000 slam (one beat), and from "0 Kembali" until the loop zoom lands.

LOOK (DESIGN.md, normative):
- Grounds are flat full-bleed fields with no grain, gradient, shadow or vignette: Bee Yellow #FDC43D, Charcoal #1D1B1B, Parchment #FFFBF3.
- Ink #1D1B1B; on charcoal, parchment #FFF9EF and muted #D7CABC.
- Accent: yellow as a *fill* or a giant glyph on charcoal, never as small text on light grounds.
- Display face: Plus Jakarta Sans 800, tracking −0.045em, line-height 0.86–0.91.
  - Numerals 1150 px.
  - Hero words 170–400 px.
- UI face: Inter 600/700, tabular numerals, 32–72 px; nothing under 28 px.
- Chat prompts are 20 px-radius blocks: charcoal-2 #2C2724 on charcoal, ink on light.
- The mascot is the film bee (`assets/brand/bubble-bee.svg`, inline SVG in hook and akhir), drawn after the original bee-bot: same helmet head, crown band, large ivory face, slanted capsule eyes, blush, ear cups and brown antennae, brown 6–7 unit outlines, head straight (0°), symmetric ear cups each with a dark centre; plus a small brown-striped body with a bubble-tail stinger and small ivory wings. Rig: `-wingL`/`-wingR` flap around svgOrigin 232 545 / 368 545, `-eyes` blink around their own centre; the hook zoom targets the left eye.

OBJECTS:
- Numerals are the user's typed replies.
- Prompt blocks carry the bot's real message formats.
- The cart message is "Keranjang: 2 porsi, subtotal Rp60.000 / Mau tambah menu lainnya? / 1. Tambah Menu 2. Lihat Keranjang 3. Lanjut Pembayaran".
- The QRIS card is white, 440 px, with an ink module grid.
- Status pill: "Siap diambil".
- The tenant is Bakmi Effata (named by the user). The halal-only menu and prices are illustrative; the end card carries no fine print (the user removed it).

MOTION:
- Slam: scale 1.22 → 1 and blur 14 → 0 px in 11 frames on `expo.out`, starting on the downbeat as a 0-ms set.
- Text arrival: blur 8 → 0 px with opacity 0 → 1 in 9 frames, 4 frames apart per word, with no translate.
- Exit: 40% of its entry, `power3.in`.
- Mascot: `elastic.out(1, 0.55)` (damping ≈ 0.5) on position and rotation only.
- Camera, zooms and floods: `power2.inOut` (floods) and `power3.in` (zoom-through).
- A landed title is dead still.

SHOTS (times below are from the 112.5 BPM version; revision 5 runs every bar at 2.0 s, so scene n starts at (n−1) × 2.0 s; revision 3 inserts "whatsapp" at 2.133–4.267, and shots 2–9 below start one bar (2.133 s) later than listed):
- **whatsapp · 2.133–4.267.** Charcoal, continuing from the hook's zoom. "Cukup" (parchment) / "WhatsApp." (yellow) at 230 px; on b2 "Tanpa aplikasi baru."; a blur swap into tenant on the same ground.
1. **hook · 0.000–2.133.**
   - Frame 0: yellow field with LAPAR? at 340 px in the top-left.
   - b2: the mascot tile springs up at bottom-right.
   - b3: the white "Halo" bubble pops (key).
   - b4: zoom into the mascot's dark sky until charcoal fills the frame (whoosh).
2. **tenant · 2.133–4.267.** Charcoal.
   - b1: "1" slams in yellow at the right (key), with the "Pilih tenant:" prompt.
   - "Bakmi Effata" lands at 250 px.
   - End: parchment panel covers from the bottom (whoosh).
3. **kategori · 4.267–6.400.** Parchment.
   - Rows 1 Bakmi / 2 Minuman / 3 Tambahan at 160 px.
   - b2: "1" slams on the left (tick); the row-1 yellow bar wipes in and the other rows dim.
   - End: the bar grows to fill the frame in yellow.
4. **menu · 6.400–8.533.** Yellow.
   - The slot roll passes 1 Bakmi Ayam Rp25.000, 2 Bakmi Ayam Pangsit Rp30.000, 3 Bakmi Ayam Jamur Rp28.000 and 4 Kwetiau Goreng Ayam Rp28.000 (halal only), landing on 2 at b2.
   - b2: "2" slams on the right (key).
   - End: dip cut.
5. **porsi · 8.533–10.667.** Charcoal.
   - b1: "2" slams (tick), then PORSI and "Bakmi Ayam Pangsit · 2 × Rp30.000".
   - End: horizontal whip to parchment (whoosh).
6. **keranjang · 10.667–12.800.** Parchment.
   - The cart card rises with the real message.
   - b2: "3" slams (key); the "Lanjut Pembayaran" row lights.
   - End: a yellow iris opens from the 3.
7. **pickup · 12.800–14.933.** Yellow.
   - The "Pilih Waktu Pickup" list 12.15 / 12.30 / 12.45 WIB.
   - b2: "1" slams (tick); 12.15 grows to 400 px.
   - The riser starts under this bar.
   - End: dip to a hard cut.
8. **bayar · 14.933–17.067.** Charcoal.
   - "Total" holds for 0.53 s.
   - b2: Rp60.000 slams at full width (impact, plus a 3-frame shake).
   - b3: it carries to the left at 0.5× as the QRIS card builds module by module.
9. **lunas · 17.067–19.200.** Charcoal.
   - The QR card flips to "✓ Pembayaran terverifikasi".
   - The "Siap diambil · 12.15" pill pops.
   - End: colour flood to yellow.
10. **klaim · 21.333–23.467.** Yellow.
    - "Pesan duluan." then, on b2, "Ambil pas jamnya."
    - End: a charcoal panel drops from the top (whoosh).
11. **akhir · 23.467–27.733.** Charcoal.
    - The mascot is carried in from the lower-left.
    - b2: TINGGAL / CHAT! (with CHAT! in yellow).
    - b3: the beelicious. wordmark wipes in with "Mulai dari satu “Halo”.".
    - Hold of 2 s or more.
    - Bar 13 b2: "0 Kembali" lands (key).
    - Zoom through the 0's yellow stroke to a yellow field; LAPAR? rises into its frame-0 position by frame 1663.

BANNED:
- A dark void with small floating UI.
- Glow, particles, gradients, glass or shadows.
- Mono-caps labels; corner labels or frame borders.
- Three cards in a row.
- Everything fading up.
- Titles drifting after landing.
- Breathing or float loops.
- The logo docked in a corner.
- Real WhatsApp chrome or logos.
- Food photography attached to tenant names.
- Facial edits to the mascot.
- Invented claims about real tenants.
- Emoji glyphs (render-dependent); draw a ✓ instead.

QA:
- Frame 0 vs frame 1663 (identical composition).
- Each slam frame +12 (landed and readable).
- 15.6 s: payoff at full width.
- 25.5 s: the end card fully readable.
- Cut strips ±0.2 s around every bar line.
- Every text block at least 28 px; text inside the 90% action-safe box, except deliberate numeral bleed.
