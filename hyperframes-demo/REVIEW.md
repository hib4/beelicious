# REVIEW — Beelicious · "Satu Pesanan" (product demo)

Delivery: `renders/beelicious-satu-pesanan-1080p60.mp4`, 1920×1080, 60 fps, 57.67 s. That is 124 beats of "Digital Clouds" at 129 BPM, where 1 beat = 0.4651 s.

## Revision 4
- **Ambil:** "Tandai sudah diambil" used to appear twice in a row (the panel button, then the confirm dialog with the same title). It now shows once: the panel, one click, and the status becomes "Selesai". The confirm dialog is still shown three times in dapur. This beat compresses it, which is a deliberate simplification.
- **Wording:** at the user's request, the film says "Status pesanan" where the real dashboard says "Pemenuhan":
  - the field label → "Status pesanan";
  - the filter "Status pemenuhan" → "Status pesanan";
  - the column "Pembayaran / pemenuhan" → "Pembayaran / status";
  - "proses pemenuhannya" → "prosesnya";
  - "Tidak ada tindakan pemenuhan…" → "Tidak ada tindakan yang tersedia pada status ini.".

  The real dashboard (`apps/web/src/components/dashboard`) still uses "Pemenuhan".

## Revision 3
- **Bayar → Dapur:** the white slab that fell across empty yellow is gone. The transition is now one sideways pan. The phone slides out left as parchment sweeps in from the right (bayar's last 0.6 s); dapur continues the move with the dashboard sliding in from the right, and the paid order lands as a new row with a brief yellow highlight. The whoosh and tick moved to match.
- **Dapur Konfirmasi:** the cursor aimed about 90 px below the dialog's Konfirmasi button. Its target now uses the button's measured centre (973, 596). All three clicks were checked in frames.

## Revision 2 — WhatsApp-style chat
The user found Chat, Pickup and Bayar unclear. Those scenes, plus the dashboard's chat strip and the notif scene, now show the student's phone as a WhatsApp-familiar chat.
- **The phone:** the bot typing, then its bubble arriving. The student types the number in "Ketik pesan" and presses send; the green bubble rises and its ticks turn blue. The chosen option line in the bot's message gets a marker.
- **Callouts:** to the left, they name the step and the reply.
- **Branding:** there is no WhatsApp logo or name. The UI is a simplified look-alike: no wallpaper doodles, no status bar, a generic send icon.
- **Payment:** Rp60.000 still slams on the drop, now beside the phone. The QRIS arrives as an image message with its caption, and the verified message's line "Persiapan oleh tenant belum dikonfirmasi. Pesanan belum dinyatakan siap diambil." is marked.
- **Dashboard and notif:** in dapur, the phone sits at the right edge and receives the three notifications. Dapur ends by sliding the phone into its standard position for the notif scene.
- **Layout:** the thread is laid out from line counts, not DOM measurement, so renders stay deterministic.
- **Check:** 0 errors. New warnings are kept on purpose: 20 px timestamps and the 24 px "online" status (secondary chat detail), and a contrast reading on a message scrolled behind the chat area's clip.

## Structure

| Scene | Time (s) | Beats | World |
|---|---|---|---|
| hook | 0–3.72 | 0–8 | yellow, LAPAR?, the bee types "Halo" |
| chat | 3.72–17.67 | 8–38 | charcoal: five real exchanges, each reply a numeral |
| pickup | 17.67–24.19 | 38–52 | parchment: slots, 12.30, Konfirmasi Pesanan |
| bayar | 24.19–37.21 | 52–80 | yellow: order created, Rp60.000 on the drop, QRIS, verified |
| dapur | 37.21–46.51 | 80–100 | the parchment dashboard: the row lands, and three confirmed steps each notify the chat |
| notif | 46.51–49.30 | 100–106 | charcoal: "sudah siap diambil!", then a match cut on 12.30 |
| ambil | 49.30–53.95 | 106–116 | yellow: Tandai sudah diambil → Selesai, then the claim |
| akhir | 53.95–57.67 | 116–124 | charcoal end card, on the track's final hit |

**Transitions** (6 kinds, each caused by something on screen):
- the Halo message becomes the world;
- an iris from the "3";
- the selected bar floods yellow;
- carry across (the verified card becomes the slab, which becomes the table row);
- zoom through the order link, then split screen to one (the chat strip widens);
- a match cut on 12.30, and a charcoal drop.

## Product accuracy
Every chat string is a verbatim template from `apps/api/src/modules/conversation/{flow,cart-flow,checkout-flow,engine}.ts`, `checkout/messages.ts` and `dashboard/service.ts`. This includes the line breaks, the `0. Kembali` and `*Menu*/*Keranjang*/*Bantuan*/*Batal*` footers, the `Rp` formatting, `pickupLabel` ("25 Nov, 12.30 WIB") and the fulfilment-notification date format ("25 Nov 2026, 12.30 WIB").

Every dashboard label comes from `apps/web/src/components/dashboard/{workspace,orders}.tsx` and `dashboard.css`:
- the sidebar, table columns, filters, status chips and "Rp 60.000" (`Intl` IDR);
- "Midtrans Sandbox";
- the "Tindakan" panel, "Langkah berikutnya: …" and the action labels;
- the confirm dialog, the success notice and "Tidak ada tindakan pemenuhan yang tersedia pada status ini.".

Deliberate substitutions and simplifications:
- **Tenant, menu, prices, date, times and order number:** Bakmi Effata (illustrative, at the user's request); 2 × Bakmi Ayam Pangsit at Rp30.000; 25 Nov 2026; ordered 11.05; QRIS deadline 11.20 (+15 min); pickup 12.30. The slots follow the 30-min grid with a ≥ 60 min lead. The order number follows the `BEE-YYYYMMDD-XXXXXXXX` format.
- **Rendering:** WhatsApp `*bold*` renders as bold; the emoji are Twemoji. There is no WhatsApp chrome.
- **QRIS:** the Midtrans image + caption is shown as a caption bubble beside a drawn, non-scannable QR. The developer-only simulator link is omitted.
- **Dashboard:**
  - Sidebar icons and the account email are omitted.
  - The detail page is shown as its "Pemenuhan" field and "Tindakan" panel lifted out at 2.4×.
  - "Rincian pesanan", "Riwayat pemenuhan" and "Notifikasi pelanggan" are not shown.
  - The orders table holds only this order.
- **Notifications:** each customer notification appears after its confirmed click. The real system processes them separately ("Notifikasi pelanggan diproses terpisah"), which the film shows.
- **Nothing claims** real money, instant readiness or that the tenant confirmed preparation. The verified message keeps "Persiapan oleh tenant belum dikonfirmasi. Pesanan belum dinyatakan siap diambil." on screen for about 3.7 s, underlined.

## Measured
- `hyperframes check`: 0 errors. Warnings kept on purpose:
  - `text_below_floor`: the wide dashboard establishing shot (about 0.9 s at 1×), which is context only. Every readable UI beat is at 2.2–2.4×, with chips ≥ 28 px.
  - `contrast_aa_failure` on "Pemenuhan" while the real dialog backdrop dims the page.
  - `line_unread` on the fast dialog and option lines. The dialogs are confirmations of the action already named on the button.
  - `duplicate_media_discovery_risk`: the same emoji image is used twice.
- Snapshots of every scene, transition midpoints and the end card were inspected (contact sheets in `.hyperframes/artifacts/snapshots`).
- Fixes made during review:
  - the hook growth origin (it left yellow at the bottom);
  - the numeral and caption overlap;
  - the clipped 12.30;
  - empty stage gaps;
  - the dead 4 s stretch before the drop (the order number is now typed out and the total is marked);
  - the cursor's aim at the order link;
  - the "Selesai" chip was too small.

## Not checked
- The sound was **measured, not heard**.
- The dashboard is rebuilt from source and CSS, not captured from a live login, because a reference capture needs the guarded `_test` database harness.
- Live WhatsApp/Baileys delivery and Midtrans Sandbox payment are not demonstrated by this film.

## Weakest shot
**notif (46.5–49.3 s).** The enlarged "siap diambil" bubble sits top-left with empty space below. With more time, I would let the other two statuses stack under it as a timeline.
