# Phase 7 editorial redesign report

## Result and audit

The existing Next.js marketing application now follows Big Type. Bold Food. Playful Bee. The idea is that one Halo opens a guided food-selection story. Fastify remains the business API; no dashboard, ordering, payment, or messaging feature was added.

The original page used a conventional split hero, relatively small display type, repeated benefit treatments, a small merchant card, and a detached conversation preview. The new presentation replaces that sequence with a poster hero, photographic editorial, and six-stage conversation narrative.

| Measured viewport | Previous hero type | New hero type | Horizontal overflow |
| ----------------- | ------------------ | ------------- | ------------------- |
| 1440px desktop    | 56px               | 159.8px       | None measured       |
| 768px tablet      | 48px               | 92.2px        | None measured       |
| 390px phone       | 32px               | 68.3px        | None measured       |

The direction draw selected Loud and Flat, seed 1438792661, while keeping the brand palette and typefaces. Randomized slots incompatible with the explicit brief were rejected: a square hero, team grid, editable headline, two-action close, and unrelated landscape photographs. SURFACE.md records those decisions.

## Sections and visual system

- Navigation retains accessible mobile controls, real anchors, and the configured WhatsApp action.
- Approximately fullscreen charcoal hero combines LAPAR? / CHAT AJA. with the oversized original Bee-bot.
- A brief yellow CHAT. PILIH. PICK UP. strip changes the pacing.
- An asymmetric food editorial uses three licensed photographs, with explicit editorial labeling and visible credits.
- Six conversation chapters show greeting, tenant selection, menu/quantity, cart, pickup, and payment instructions using numeric text interactions.
- Warung Babe receives a large typographic pilot spotlight without fabricated photos or operating claims.
- The Bukan restoran. manifesto distinguishes the platform from merchants.
- The closing mascot scene leads into a yellow wordmark footer with navigation and photographic credits.

Plus Jakarta Sans supplies display typography; Inter supplies body and controls. Existing semantic colors remain, with separate fluid marketing display scales documented in DESIGN.md. Operational tokens remain available. Outer gutters are 24px on desktop, 20px on phones, and 16px on small phones. Mobile has deliberate line breaks, a stacked mascot scene, and vertical transcripts. The original mascot file is unchanged byte-for-byte; composition may crop its surrounding image, but never stretches or redraws it.

## Architecture and motion

The page and content remain statically rendered with no backend request or database connection. Client islands are navigation and ExperienceMotion. GSAP 3.15.0 and ScrollTrigger replace the unused Motion runtime; GSAP is loaded after rendering. CSS handles lightweight control feedback.

One conversation visual pins only with width at least 1024px, height at least 720px, a fine pointer, and no reduced-motion preference. Six normal-flow chapters control the sequence; ordinary anchors also select chapters. There is no wheel/touch interception. The pinned duplicate is aria-hidden; complete server-rendered transcripts remain the accessible content. Mobile, short desktop, reduced-motion, and JavaScript-disabled views show those transcripts directly. Media contexts revert pinning, attributes, and owned animations when conditions change or the component unmounts.

The configured CTA contract is unchanged: explicit public ordering enablement plus a valid international number opens a wa.me link prefilled with Halo. Otherwise controls show disabled Segera Hadir. No phone number is fabricated. The final default production build has ordering disabled. Pilot noindex/robots behavior remains intact.

## Files created and modified

Created:

- `src/components/marketing/experience-motion.tsx`, `journey.tsx`, and `merchant-spotlight.tsx`.
- `src/lib/journey.ts` and `editorial.ts`.
- Three locally served files in `public/editorial/` and provenance in ASSETS.md.

Reworked:

- `src/app/(marketing)/page.tsx`, `src/app/globals.css`, marketing `header.tsx`/`mascot.tsx`, and `src/lib/content.ts`.
- `test/landing.test.tsx` and `e2e/landing.spec.ts`.
- Web package dependencies and root lockfile: added pinned GSAP, removed unused Motion packages; existing backend dependency versions were preserved.
- README.md, AGENTS.md, DESIGN.md, SURFACE.md, and this report.
- Root ignore/lint configuration excludes local design-tool artifacts and vendored skill scripts.

Removed superseded `conversation-preview.tsx` and `merchant-card.tsx`. Public CTA configuration, WhatsApp CTA implementation, metadata, robots, sitemap, API/database/shared source, and local environment/authentication files were preserved.

## Assets

All photographs are local, responsive, optimized through Next Image, and lazy-loaded below the fold. None is represented as Warung Babe's actual menu photography.

| Photograph                               | Creator         | License        |
| ---------------------------------------- | --------------- | -------------- |
| Delicious Indonesian Fried Rice with Egg | Dicky Agustian  | Pexels License |
| Sate Ayam Panggang                       | Meandkancil2020 | CC BY-SA 4.0   |
| Iced lychee tea and Es teh manis, Bali   | Andy Li         | CC0            |

ASSETS.md contains source and license links, dimensions, and modifications. The original Bee-bot checksum matches the supplied root asset. No generated mascot, merchant logo, rating, location, or commercial proof was invented. Authentic merchant photography and verified public availability remain unavailable. No unrelated video was added.

## Commands and actual results

| Command / check                               | Result                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| `npm ci`                                      | Clean installation passed, 689 packages                                 |
| `npm run typecheck`                           | Passed packages, API, and web                                           |
| `npm run lint`                                | Passed without warnings                                                 |
| `npm run format:check`                        | Passed                                                                  |
| `npm test`                                    | 221 backend + 24 frontend unit tests passed                             |
| `npm run db:migrate`                          | Nine existing migrations; none pending                                  |
| `npm run db:migrate:test`                     | Nine existing migrations; none pending                                  |
| `npm run test:integration`                    | 110 PostgreSQL integration tests passed across seven files              |
| `npm run build`                               | Packages/API and static Next production build passed                    |
| `npm run test:e2e`                            | 11 Chromium browser tests passed on the final default build             |
| Temporary enabled-CTA build and browser suite | 11 tests passed with a test-only number; no WhatsApp navigation or send |
| `npm audit --omit=dev --json`                 | Zero production vulnerabilities                                         |
| `git diff --check`                            | Passed                                                                  |

The default disabled-ordering build was restored after the enabled-CTA test. No database schema change, reset, or seed occurred; migration commands found nothing pending. No live WhatsApp or Midtrans interaction was performed.

Browser checks cover widths 320, 375, 390, 768, 1280, and 1440px; loaded assets; metadata/noindex; anchors; mobile keyboard navigation/focus; enabled/disabled CTA behavior; and no significant horizontal overflow. Tested views had zero axe WCAG A/AA violations. Journey tests cover forward/backward chapter progression, anchor selection, exactly one pin, resize cleanup, reduced-motion toggling, short-viewport fallback, and JavaScript-disabled content.

## Rendered review and evidence

Actual production-rendered screenshots were inspected at desktop, tablet, and mobile sizes, including complete page contact sheets. Three review rounds corrected headline/mascot collisions, inconsistent header framing, narrow-phone food heading wrapping, excessive closing mascot cropping, and kinetic-strip edge spacing. A focused final mobile confirmation checked the last edge-spacing correction.

Local evidence:

- Before: `/tmp/beelicious-redesign-before`.
- Iterations: `/tmp/beelicious-redesign-round1` and `/tmp/beelicious-redesign-round2`.
- Final desktop/tablet: `/tmp/beelicious-redesign-final`.
- Final mobile: `/tmp/beelicious-redesign-mobile-confirmed`.
- Journey progress, phone fallback, and reduced motion: `/tmp/beelicious-redesign-final-scenes`.

Final desktop/tablet inspection and focused mobile confirmation have no inspector FAIL results. Remaining heuristic warnings concern multiple fluid display roles, absence of video footage, and an asymmetric closing composition occupied by the mascot. The required warm brand palette was explicitly allowed. Source design lint reports no FAIL and one punctuation warning for existing command/accessibility wording. These tool results are not a visual-quality certification.

The scene checker reported no problems. A headless timing sample measured 114 frames, median 16.7ms, none over 34ms; this is not a production Core Web Vitals measurement.

### Final self-critique

This is a subjective assessment using the design skill's rubric, not an award or independent jury result.

ROUND 3, with focused mobile confirmation

Seen in one second: LAPAR? CHAT AJA. and the original Bee-bot.

Idea (one sentence): One Halo becomes a guided selection story from appetite to pickup instructions.

Live thing: Native chapter navigation and a scroll-synchronized numeric conversation.

Layout words by section: hero=poster / transition=kinetic band / food=editorial gallery / journey=pinned narrative / merchant=typographic spotlight / about=manifesto / close=mascot scene / footer=wordmark.

Scores: design 6.5 · usability 8.2 · creativity 7.0 · content 7.5 → overall 7.3.

Caps applied: The skill caps design at 6.5 for fewer than four distinct photographs. This implementation uses three deliberately selected editorial photos; two mascot appearances are not additional photographs. The ordering action is intentionally disabled by the approved pilot configuration. The result is a substantial presentation improvement, but this self-assessment remains below the skill's 7.5 target.

Top three remaining limitations, most visible first:

1. The editorial photographs have different light and source quality, especially the satay crop in `desktop-page-01.jpg`. A cohesive commissioned merchant shoot would improve the page more than additional animation.
2. The Warung Babe spotlight in `desktop-page-02.jpg` has typography rather than verified merchant photography. Replace only when authentic approved assets exist; no fabricated image was substituted.
3. The conversation remains a relatively long sequence in the final scene sheets. Anchor navigation and static fallbacks keep it usable, but public-launch usability testing should validate pacing with real visitors.

## Limits and preservation

Five high-severity development-tool advisories remain in the existing lint dependency chain; production dependencies audit clean. No breaking toolchain downgrade was applied. PostgreSQL tests emit the pre-existing pg concurrent-query deprecation warning and pass.

Chromium checks do not establish Safari/Firefox parity, manual screen-reader certification, production Core Web Vitals, or public-service readiness. Real pilot content, policies/contact details, merchant photography, and public launch approval remain separate work.

API, database, shared-package, Baileys, Cloud API, Mock, payment, cart, and conversation source files are unchanged. Backend unit/integration regressions passed; that does not establish live transport delivery. No tenant dashboard or further business phase was implemented.
