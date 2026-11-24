# REVIEW — Beelicious · "Balas Angka"

Delivery: `renders/beelicious-balas-angka-1080p60.mp4`. H.264 and AAC, 1920×1080, 60 fps, 1560 frames, 26.0 s (13 bars at 120 BPM).

## Revision 9
- The bee's head is straight (0° tilt) and symmetric: both ear cups have the same dark centre, the face is centred with upright capsule eyes, and the antennae and blush are mirrored.

## Revision 8
- Head and ears made natural: the ear cups now tuck behind the helmet like headphones, with about half of each visible and the dark oval on the left. A brown band runs ear to ear over the crown. The face is smaller and set lower-left inside the helmet, leaving yellow helmet on top and right, as in the original bee-bot.

## Revision 7
- The film bee is redrawn to match the original bee-bot. Its head is a vector re-interpretation of `bee-bot.png`: wide yellow helmet with highlight and honey shade, brown crown band, large ivory face with rim shade, two black capsule eyes slanted like the original, peach blush, ivory ear cups (dark oval on the left), brown antennae with two-tone balls, thin brown outlines, head tilted 16°.
- It keeps a small brown-striped body, a bubble-tail stinger and small ivory wings for the flying moments.
- Hook: it now dives into the bee's left eye to reach the charcoal WhatsApp scene.

## Revision 6
- New film-only mascot, the **chat-bubble bee** (`assets/brand/bubble-bee.svg`). Its body is a yellow chat bubble whose tail is the stinger; the wings are cream message bubbles with typing dots. It keeps the bee-bot's two capsule eyes, ivory face, no mouth and an ink outline, so it reads on yellow and on charcoal. It is drawn as inline SVG so it can act:
  - the hook: it flies up with buzzing wings, settles with a hover bob, blinks and turns toward "Halo", and the camera dives into its charcoal stripe;
  - the end card: it flies in with buzzing wings, blinks, and glances at "0 Kembali".
- The original `bee-bot.png` is no longer used in the film and is untouched for the website.

## Revision 5
- Music: "Hustle" by Kevin MacLeod (CC BY 3.0), chosen from 12 free candidates as the closest to the Apple-promo reference. It is percussion-led (top tags: percussion, drums, bass drum, bass guitar), punchy (−9.3 LUFS source), steady at 120 BPM, and needs no time-stretch. Runner-up: "Crunk Knight" (Kevin MacLeod, 104 BPM, hip-hop). Measured, not heard.
- Apple-style hard stops via `#bgm` volume automation: silence for one beat before the Rp60.000 slam, and from "0 Kembali" until the loop zoom lands.
- The film follows the new tempo: 1 beat = 30 frames, scenes are 2.0 s, and the film is 26.0 s. "Kamu" pills are removed.
- A `line_unread` warning on `#akh-mark` is a false positive from its clip-path wipe; the wordmark is visible 23.0–24.5 s.

## Revision 2
- The tenant is **Bakmi Effata** (named by the user). The menu is halal only and illustrative: Bakmi Ayam Rp25.000, **Bakmi Ayam Pangsit Rp30.000** (chosen; 2 porsi = Rp60.000), Bakmi Ayam Jamur Rp28.000, Kwetiau Goreng Ayam Rp28.000.
- The categories are Bakmi / Minuman / Tambahan.
- **WhatsApp-only:** the claim grew to two bars. The first says "Cukup / WhatsApp." with "Tanpa aplikasi baru."; the second says "Pesan duluan. Ambil pas jamnya.". The end line reads "Cukup WhatsApp. Mulai dari satu “Halo”.".
- The music was re-cut as a 13-bar loop.

## Revision 3
- "Cukup WhatsApp. / Tanpa aplikasi baru." moved into the opening as its own scene (`compositions/whatsapp.html`, 2.133–4.267 s). It sits on the charcoal from the bee-bot zoom and blur-swaps into "Pilih tenant:" on the same ground.
- The claim is one bar again (21.333 s), and the end card is back to "Mulai dari satu “Halo”.".
- Scenes from tenant to lunas and their sound effects moved one bar later. The music and length (13 bars, 27.733 s) are unchanged.

## Creative calls
- **Storyline B, "Balas Angka".** Each numeric reply in the real Beelicious flow (1 · 1 · 2 · 2 · 3 · 1) is a monumental numeral on a downbeat. The loop seam is the bot's own back command, "0 Kembali": the camera zooms through the 0 into the yellow field, and LAPAR? rises into its frame-0 position.
- **Grid.** 13 bars at 112.5 BPM, so 1 beat = 32 frames and 1 bar = 128 frames. Every scene is one bar, except the two-bar end card.
- **Menu.** The tenant is Bakmi Effata, at the user's request. The dishes and prices are illustrative and halal only, not the merchant's real menu. At the user's request, the end card no longer carries the "Ilustrasi menu & percakapan · Pilot terbatas" fine print, so nothing on screen marks the menu as illustrative.
- **Copy.** The bot message formats follow the real API copy: "Pilih Waktu Pickup", "Keranjang: 2 porsi, subtotal …", "1. Tambah Menu 2. Lihat Keranjang 3. Lanjut Pembayaran", "Pembayaran QRIS", "Pembayaran terverifikasi", and the "0 Kembali" back command.
- **Brand.** The film uses its own vector mascot (the chat-bubble bee, revision 6); the original bee-bot PNG stays untouched for the website. The brand fonts are Plus Jakarta Sans 800 and Inter, shipped in `assets/fonts`. There are no gradients, glow or photography, and no WhatsApp chrome or logo.
- **Transitions.** There are 9 kinds:
  - zoom into the bee-bot's dark sky;
  - cover sweep up;
  - the selected row's bar grows into the next world;
  - dip cut;
  - horizontal whip;
  - iris from the numeral;
  - card flip;
  - the "Siap diambil" pill swells into the next world;
  - charcoal drop, and the zoom through the 0.
- **Storylines not built:** A "Antre Itu Kemarin" (queue wall vs. chat) and C "Satu Tarikan" (one-take transcript tower). See `STORYLINES.md`.

## Measured
- `check`: 0 errors.
- The loop seam was measured on the delivery file: the mean absolute pixel difference between frame 0 and frame 1663 is 0.037/255, which is identical in practice.
- Loudness of the delivery file: −15.2 LUFS integrated, −1.0 dBTP true peak, no clipping.
- The music loop has its own 120 ms equal-power crossfade, so the audio loops seamlessly too.
- The beat sheet, seam strips (±0.2 s at every cut) and the rendered contact sheet were all inspected visually.

## Not checked
- The sound was **measured, not heard**.
- The music is a 13-bar excerpt time-stretched by ×1.0244. The bar downbeat was taken from the beat tracker and was not confirmed by ear.
- The phone-width sheet was generated but not reviewed line by line. The smallest copy, the 30 px "Beelicious" sender labels, will be small on phones.

## Weakest shot
**klaim (21.3–23.5 s).** "Pesan duluan. Ambil pas jamnya." is still type alone on yellow. With more time I would let "jamnya." carry the 12.15 pickup pill.

An earlier `contrast_aa_failure` warning on the claim came from the off-screen charcoal drop panel (the frames show ink on yellow); that panel is now `data-layout-ignore`.

## Warnings kept on purpose
- `line_unread` on the pickup list (15.0–16.1 s): the three slots are a fast menu that collapses into the giant "12.15", which then holds for 1 s.
- `line_unread` on "LAPAR?" at the end: it is the loop seam, and it holds a further 2.1 s at the start of the next loop.
- The slot-roll items in the menu scene are marked `data-layout-ignore`: they are motion texture, and only the landing item is meant to be read.

## Credits
See `CREDITS.md`. The music ("Hustle", Kevin MacLeod, CC BY 3.0) and the pop SFX (Ch0cchi, CC BY 3.0) must be credited wherever the video is published.
