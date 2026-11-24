# SPEC — Beelicious · "Satu Pesanan" (product demo)

GOAL: After watching, a viewer can explain how Beelicious works. A student orders by replying with numbers in WhatsApp, picks a pickup time and pays with QRIS. The merchant accepts and prepares the order from a dashboard, and every step comes back to the student's chat until they pick the food up at the chosen time.

OUTPUT: HyperFrames, 1920 × 1080, 60 fps, linear (no loop).

TIME: 57.67 s × 60 = 3460 frames. Music: "Digital Clouds" at 129 BPM, so 1 beat = 0.4651 s (27.9 frames) and 1 bar = 1.860 s. The film is 124 beats; scene n starts on a beat (hook 0, chat 8, pickup 38, bayar 52, dapur 80, notif 100, ambil 106, akhir 116). Rp60.000 slams on the track's drop (beat 64) after one beat of silence.

## World and look (DESIGN.md is normative)

**Grounds** are flat, full-bleed fields with no grain, gradient, glow or decorative shadow:

| World | Ground | Hex |
|---|---|---|
| CHAT | Charcoal | #1D1B1B |
| PICKUP | Parchment | #FFFBF3 |
| PAY | Bee Yellow | #FDC43D |
| DAPUR | Parchment, with white panels and a #E6DACB hairline | #FFFBF3 |

**Ink:**
- #1D1B1B on light grounds.
- #FFF9EF on charcoal, with #D7CABC for muted text.
- Bot bubbles are #2C2724 with a 20 px radius.
- Student reply bubbles are Bee Yellow with ink text.

**Accent:** yellow is a *fill*, a giant numeral or the selected-row bar, never small text on parchment.

**Display type:** Plus Jakarta Sans 800, −0.045em tracking, line-height 0.88.
- Reply numerals: 760–1000 px.
- Heroes: 150–420 px.

**UI type:** Inter.
- Chat bubbles: 32 px / 44 px line-height, weights 500 and 700 for `*bold*`.
- Dashboard: native 14 px, always shown at ≥ 2× in the punch-ins.
- Nothing that must be read is under 28 px on screen.

**Emoji** are the product's own (🐝 🍽️ 🍳 ✅ 🛒 🏪 🧾), drawn from Twemoji SVGs (`assets/emoji`) at 1.05 em.

**Mascot:** the film bee from the promo (`bubble-bee.svg`, inlined), with the same rig: wings flap around svgOrigin 232 545 / 368 545, and the eyes blink.

**Cursor:** the registry `oversized-cursor` arrow path, 120 px tall, ink body with a parchment 1.4 stroke, and no shadow.

## Objects

- **The student's phone (revision 2):** a flat, upright 768 × 1000 screen at (1056, 40) with a 10 px charcoal bezel, in the same place in every chat scene.
  - **Header:** the bee avatar, "Beelicious" and "online".
  - **Chat area:** beige wallpaper #EFEAE2. Incoming bubbles are white and outgoing ones #D9FDD3 with blue ticks, with Inter 28/38 text and 20 px timestamps.
  - **Input bar:** the "Ketik pesan" field, where the number is typed, and a #00A884 send button.
  - **Typing indicator:** shown before every bot reply.
- **Callouts:** to the left of the phone, Plus Jakarta 800 at 128 px names each step ("Pilih tenant", "Pilih menu", "Pilih jam pickup", "Bayar QRIS", "Siap diambil"). A yellow reply chip shows the typed number and the choice. Each selected option line in the bot's message gets a yellow marker.

- **The chat thread:** a left column (x 96–916) of real bot messages, verbatim templates.
- **The deconstruction:** each student reply also lands as a monumental yellow numeral on the right stage, with the chosen line named under it. The matching line in the bubble gets a yellow selection bar.
- **The QRIS card:** white, 460 px, an ink module grid with three finder squares. It is drawn and deliberately not scannable.
- **The dashboard:** the real layout from `apps/web/src/components/dashboard`. The 240 px sidebar has "beelicious." and Ringkasan / **Pesanan** / Menu / Jadwal Pickup / Pengaturan. Then come the Pesanan table, and the detail page with "Rincian pesanan" and "Tindakan" panels, the confirm dialog and "Riwayat pemenuhan".
- **Data:**
  - Tenant: Bakmi Effata (illustrative).
  - Order: 2 × Bakmi Ayam Pangsit at Rp30.000, total Rp60.000.
  - Order number: BEE-20261125-3F9A1C2B.
  - Times: ordered 25 Nov 2026 at 11.05 WIB; QRIS deadline 11.20; pickup 12.30 WIB.

## Motion

- **Slam:** scale 1.22 → 1 and blur 14 → 0 px in 11 frames, `expo.out`.
- **Text arrival:** blur 8 → 0 px with opacity 0 → 1 in 9 frames, staggered by 4 frames, with no translate.
- **Exit:** 40% of the entry duration, `power3.in`.
- **Camera:** pushes and pulls take 0.5 s on `power2.inOut`, with a 6 px peak blur on fast moves.
- **Thread scroll:** 0.35 s on `power3.inOut`.
- **Cursor:** glides in 0.5 s on `power3.out`. The press is 0.1 s to scale 0.9; the release is 0.2 s. The UI changes on the release frame.
- **Mascot:** `elastic.out(1, 0.55)` on position and rotation only.
- A landed title is dead still.
- **Transitions** (5 kinds, each caused by something on screen):
  - the Halo bubble becomes the world;
  - an iris from the "3";
  - colour flood;
  - carry across (the order becomes a table row);
  - a match cut on "12.30".

## Shots

| Scene | Time | What happens |
|---|---|---|
| hook | 0–3.72 | Yellow. LAPAR?; the bee flies in; "Halo" is typed into an ink bubble, which grows into the charcoal world. |
| chat | 3.72–17.67 | Five real exchanges: tenant (1), category (1), menu (2), quantity (2), cart (3). It ends with an iris from the 3. |
| pickup | 17.67–24.19 | Parchment. The slot list; 1 picks "12.30", which grows; the confirm card; 1 = Konfirmasi & Bayar. |
| bayar | 24.19–37.21 | Yellow. Order created; Rp60.000 slams (the one riser→impact); the QRIS instruction with the card; the verified message with its honesty line held ≥ 2 s. The order collapses to a slab. |
| dapur | 37.21–46.51 | Parchment dashboard. The slab lands as the table row; the cursor opens it; Terima pesanan → Konfirmasi → Diterima; Mulai siapkan → Disiapkan; Tandai siap diambil → Siap diambil. Each step drops its real notification into the charcoal chat strip on the right. |
| notif | 46.51–49.30 | The chat strip becomes the world: "Pesanan kamu sudah siap diambil!" at 2×. Match cut on 12.30. |
| ambil | 49.30–53.95 | Yellow 12.30. Tandai sudah diambil → Selesai; "Pesan duluan." / "Ambil pas jamnya." |
| akhir | 53.95–57.67 | Charcoal. The bee, TINGGAL CHAT!, the beelicious. wordmark wipe, "Mulai dari satu “Halo”."; hold. |

## Banned

- A dark void with small floating UI; a 3D-tilted phone or device mockup.
- The WhatsApp logo or name. The chat UI is WhatsApp-familiar at the user's request (revision 2): a look-alike, simplified, unbranded.
- Glow, particles, gradients, glass or shadows.
- Three cards in a row; KPI grids; an invented kanban or metrics.
- Mono-caps labels, corner labels or frame borders.
- Fade-and-slide-up everything; titles drifting after landing.
- The logo docked in a corner.
- Food photography for the tenant.
- Any claim of real money, a verified merchant or instant readiness.

## QA

- Every slam at +12 frames.
- The Rp60.000 payoff at full width.
- The honesty line readable for ≥ 2 s.
- Each dashboard click and +20 frames (chip label changed, ≥ 28 px on screen).
- Each notification bubble readable.
- The end card held ≥ 2.5 s.
- The mid-frames of every carry-across.
- Every string matches the source templates (see REVIEW.md, product-accuracy).
