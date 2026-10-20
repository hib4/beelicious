---
version: alpha
name: Beelicious-design-analysis
description: A warm, conversation-first food-ordering interface built around Bee Yellow (#FDC43D), Dark Charcoal (#1D1B1B), and Warm Ivory (#FBEFDA). Large editorial headlines, genuine food photography, and a playful two-eyed bee-bot mascot create a recognizable brand; clean cards and restrained controls keep merchant discovery and ordering understandable. The primary customer journey happens in WhatsApp. Beelicious controls its own website, assets, and operational screens, but not the native WhatsApp chat interface.

colors:
  primary: "#FDC43D"
  primary-focus: "#8B5E1A"
  primary-on-dark: "#FFD66B"
  ink: "#1D1B1B"
  body: "#352F2A"
  body-on-dark: "#FFF9EF"
  body-muted: "#D7CABC"
  ink-muted-80: "#494038"
  ink-muted-48: "#776D62"
  divider-soft: "#F1E8DC"
  hairline: "#E6DACB"
  canvas: "#FFFFFF"
  canvas-parchment: "#FFFBF3"
  surface-pearl: "#FFF5DF"
  surface-tile-1: "#1D1B1B"
  surface-tile-2: "#2C2724"
  surface-tile-3: "#3B3029"
  surface-black: "#171616"
  surface-chip-translucent: "#F4EDE0"
  on-primary: "#1D1B1B"
  on-dark: "#FFF9EF"
  honey-orange: "#FBB332"
  cocoa-brown: "#402F26"
  soft-peach: "#FDC2A1"
  mascot-ivory: "#FBEFDA"
  whatsapp-green: "#25D366"
  status-success: "#166B45"
  status-error: "#B42318"

typography:
  hero-display:
    fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif'
    fontSize: 56px
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: -1.68px
  marketing-hero:
    fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif'
    fontSize: "clamp(64px, 11.1vw, 192px)"
    fontWeight: 800
    lineHeight: 0.91
    letterSpacing: -0.045em
  marketing-heading:
    fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif'
    fontSize: "clamp(48px, 7.8vw, 128px)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: -0.045em
  display-lg:
    fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif'
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -1px
  display-md:
    fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif'
    fontSize: 34px
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: -0.68px
  lead:
    fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif'
    fontSize: 28px
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: -0.42px
  lead-airy:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 24px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: -0.24px
  tagline:
    fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif'
    fontSize: 21px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.21px
  body-strong:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: -0.16px
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: -0.16px
  dense-link:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 2
    letterSpacing: 0
  caption:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: 0
  caption-strong:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.43
    letterSpacing: 0
  button-large:
    fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif'
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.18px
  button-utility:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.29
    letterSpacing: 0
  fine-print:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  micro-legal:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 10px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  nav-link:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0

rounded:
  none: 0px
  xs: 6px
  sm: 10px
  md: 14px
  lg: 20px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 80px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
    padding: 12px 24px
  button-primary-focus:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
    outline: "2px solid {colors.primary-focus}"
  button-primary-active:
    backgroundColor: "{colors.honey-orange}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
  button-secondary-pill:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
    border: "1px solid {colors.hairline}"
    padding: 12px 24px
  button-dark-utility:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-dark}"
    typography: "{typography.button-utility}"
    rounded: "{rounded.sm}"
    padding: 10px 16px
  button-pearl-capsule:
    backgroundColor: "{colors.surface-pearl}"
    textColor: "{colors.ink-muted-80}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: 8px 14px
  button-order-hero:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-large}"
    rounded: "{rounded.pill}"
    padding: 15px 30px
  button-icon-circular:
    backgroundColor: "{colors.surface-chip-translucent}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    size: 44px
  text-link:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    underlineColor: "{colors.primary-focus}"
  text-link-on-dark:
    backgroundColor: transparent
    textColor: "{colors.primary-on-dark}"
    typography: "{typography.body}"
  global-nav:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.nav-link}"
    height: 64px
  sub-nav-frosted:
    backgroundColor: "{colors.canvas-parchment}"
    textColor: "{colors.ink}"
    typography: "{typography.caption-strong}"
    height: 52px
  hero-tile-light:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display-lg}"
    rounded: "{rounded.none}"
    padding: 80px
  hero-tile-parchment:
    backgroundColor: "{colors.canvas-parchment}"
    textColor: "{colors.ink}"
    typography: "{typography.display-lg}"
    rounded: "{rounded.none}"
    padding: 80px
  hero-tile-dark:
    backgroundColor: "{colors.surface-tile-1}"
    textColor: "{colors.on-dark}"
    typography: "{typography.display-lg}"
    rounded: "{rounded.none}"
    padding: 80px
  hero-tile-dark-2:
    backgroundColor: "{colors.surface-tile-2}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.none}"
  hero-tile-dark-3:
    backgroundColor: "{colors.surface-tile-3}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.none}"
  merchant-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.lg}"
    padding: 24px
  menu-item-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 16px
  merchant-option-chip:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 12px 16px
  merchant-option-chip-selected:
    backgroundColor: "{colors.surface-pearl}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    border: "2px solid {colors.primary-focus}"
  conversation-preview-card:
    backgroundColor: "{colors.canvas-parchment}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 24px
  order-summary-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 24px
  search-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: 12px 20px
    height: 48px
  floating-order-bar:
    backgroundColor: "{colors.canvas-parchment}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    height: 72px
    padding: 12px 24px
  status-chip:
    backgroundColor: "{colors.surface-pearl}"
    textColor: "{colors.ink}"
    typography: "{typography.caption-strong}"
    rounded: "{rounded.pill}"
    padding: 6px 12px
  footer:
    backgroundColor: "{colors.canvas-parchment}"
    textColor: "{colors.ink-muted-80}"
    typography: "{typography.fine-print}"
    padding: 64px
---

## Overview

Beelicious is a **WhatsApp-first food-ordering platform, not a restaurant or a kitchen**. Its visual identity makes ordering feel approachable: warm yellow signals an invitation to begin, deep charcoal anchors trust, ivory softens the canvas, and a minimalist bee-bot gives the brand a distinct character. The customer should understand one action immediately: choose food and complete the order through a WhatsApp conversation.

The marketing site follows an editorial rhythm similar to a curated food gallery. Large headlines, generously spaced sections, and authentic dish photography alternate between white, warm parchment, and charcoal canvases. Buttons are bright yellow pills with dark labels; secondary interface elements are intentionally quiet. The mascot is an icon and guide, not a chef, delivery rider, or restaurant operator.

Merchant/catalog and operational surfaces keep the same token system but become more utilitarian. Merchants, menu items, prices, pickup details, order summaries, and statuses take priority over decoration. A WhatsApp conversation can be depicted in a **website illustration or prototype**, but the live WhatsApp client controls its own native bubbles, typography, layout, and available interactive elements. Beelicious controls the wording, choices, assets, and backend behavior sent through the integration, not that client chrome.

**Key Characteristics:**
- A Bee Yellow (`{colors.primary}`) action language paired with near-black text; yellow is primarily a **fill**, not small text on white.
- Alternating light, parchment, and dark full-bleed tiles that make the landing page feel spacious and recognizable.
- Genuine, appetizing food photography supported by one simplified 2D bee-bot brand character.
- Rounded primary pills and softly rounded utility cards; never turn every element into a floating badge.
- Plus Jakarta Sans for expressive display type and Inter for readable menus, prices, and operational UI.
- An explicit customer route: discover Beelicious -> open WhatsApp -> choose merchant -> choose items -> review -> choose pickup -> confirm.
- One design system for Beelicious-owned surfaces; the actual WhatsApp chat retains platform-native presentation.

## Colors

> **Basis:** Beelicious's approved-in-conversation mascot and palette, plus proposed interface tokens. Unlike the Apple reference, these values are design specifications, not colors extracted from a set of shipped Beelicious pages.

### Brand & Accent

- **Bee Yellow** (`{colors.primary}` -- #FDC43D): The primary action fill for "Pesan via WhatsApp", highlighted selection surfaces, and selective brand emphasis. Always pair with `{colors.on-primary}`.
- **Focus Brown** (`{colors.primary-focus}` -- #8B5E1A): Accessible focus outlines and underlines against light surfaces. It is not a replacement for the yellow brand color.
- **Light Honey** (`{colors.primary-on-dark}` -- #FFD66B): High-contrast yellow links and small highlights placed on the charcoal sections.
- **Honey Orange** (`{colors.honey-orange}` -- #FBB332): Pressed yellow controls, tiny editorial accents, and large forms within bee-bot artwork.
- **Cocoa Brown** (`{colors.cocoa-brown}` -- #402F26): The mascot's dark stripes and antenna details; use sparingly in web UI.
- **Soft Peach** (`{colors.soft-peach}` -- #FDC2A1): The mascot's cheek blush; decorative, never an order-success signal.
- **WhatsApp Green** (`{colors.whatsapp-green}` -- #25D366): An optional channel-identification accent where WhatsApp branding is appropriate. It must not displace Bee Yellow as the Beelicious primary.

### Surface

- **Pure White** (`{colors.canvas}` -- #FFFFFF): The base for forms, menu lists, merchant cards, and utility surfaces.
- **Warm Parchment** (`{colors.canvas-parchment}` -- #FFFBF3): Main page canvas and alternate editorial sections, warm without looking yellowed.
- **Pearl Honey** (`{colors.surface-pearl}` -- #FFF5DF): Selected filters, supporting action chips, and low-emphasis card treatments.
- **Dark Tile 1** (`{colors.surface-tile-1}` -- #1D1B1B): Primary charcoal brand sections and the default bee-bot avatar background.
- **Dark Tile 2** (`{colors.surface-tile-2}` -- #2C2724): Raised conversation-preview illustration and dark editorial sections.
- **Dark Tile 3** (`{colors.surface-tile-3}` -- #3B3029): Slightly lighter inset dark blocks or illustration staging.
- **Deep Black** (`{colors.surface-black}` -- #171616): Optional high-contrast media background, not the default website canvas.
- **Translucent Chip Base** (`{colors.surface-chip-translucent}` -- #F4EDE0): Soft utility controls placed over light images; use partial opacity only with tested contrast.
- **Mascot Ivory** (`{colors.mascot-ivory}` -- #FBEFDA): Bee-bot face fill. Kept distinct from a general white card surface.

### Text

- **Ink** (`{colors.ink}` -- #1D1B1B): Main display headings, buttons on yellow, and strong labels.
- **Body** (`{colors.body}` -- #352F2A): Default readable text on white and parchment.
- **Body On Dark** (`{colors.body-on-dark}` -- #FFF9EF): Copy on charcoal brand tiles.
- **Body Muted** (`{colors.body-muted}` -- #D7CABC): Secondary text on charcoal sections only.
- **Ink Muted 80** (`{colors.ink-muted-80}` -- #494038): Secondary copy on white cards and warm surfaces.
- **Ink Muted 48** (`{colors.ink-muted-48}` -- #776D62): Low-priority metadata and disabled-looking labels; still verify contrast for its text size.
- **On Primary** (`{colors.on-primary}` -- #1D1B1B): Dark label on every yellow primary button.

### Hairlines & Borders

- **Divider Soft** (`{colors.divider-soft}` -- #F1E8DC): 1px section separators and understated row dividers.
- **Hairline** (`{colors.hairline}` -- #E6DACB): Visible card outlines, input borders, and filter separators.
- **Success** (`{colors.status-success}` -- #166B45): Text or icon for a confirmed positive state, not an assumed payment or order completion.
- **Error** (`{colors.status-error}` -- #B42318): Validation or failed action states, always accompanied by a meaningful label.

### Brand Gradient

**No decorative interface gradients by default.** Bee-bot artwork may use a single broad, subtle color shift to distinguish yellow and ivory shapes, but backgrounds, buttons, chat preview frames, and cards should remain flat. Food photography supplies texture and depth. Do not use shiny honey gradients or gold effects as a substitute for the brand palette.

## Typography

### Font Family

- **Display:** `"Plus Jakarta Sans", Inter, system-ui, sans-serif` -- rounded, confident headlines and brand statements.
- **Body / UI:** `Inter, system-ui, sans-serif` -- high legibility for menus, order line items, currency, helper text, and operational screens.
- **Numeric treatment:** Use tabular numerals for aligned prices, quantities, totals, time slots, and order numbers. Format money in Indonesian rupiah (for example, `Rp25.000`).
- **WhatsApp exception:** Actual chat typography is determined by the user's WhatsApp client. These font tokens apply only to Beelicious-owned interfaces and illustrations.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.hero-display}` | 56px | 700 | 1.08 | -1.68px | Landing-page hero headline |
| `{typography.display-lg}` | 40px | 700 | 1.10 | -1px | Full-bleed editorial tile titles |
| `{typography.display-md}` | 34px | 700 | 1.18 | -0.68px | Merchant/product feature section heads |
| `{typography.lead}` | 28px | 500 | 1.25 | -0.42px | Hero explanation and section introduction |
| `{typography.lead-airy}` | 24px | 400 | 1.50 | -0.24px | Longer benefit statement on a spacious canvas |
| `{typography.tagline}` | 21px | 600 | 1.30 | -0.21px | Merchant category or feature tagline |
| `{typography.body-strong}` | 16px | 600 | 1.50 | -0.16px | Merchant title, price, action label |
| `{typography.body}` | 16px | 400 | 1.60 | -0.16px | Default paragraph and order details |
| `{typography.dense-link}` | 16px | 400 | 2.00 | 0 | Footer and utility link columns |
| `{typography.caption}` | 14px | 400 | 1.43 | 0 | Metadata, pickup hint, helper copy |
| `{typography.caption-strong}` | 14px | 600 | 1.43 | 0 | Status, chip label, order detail emphasis |
| `{typography.button-large}` | 18px | 600 | 1.20 | -0.18px | Main marketing-order CTA |
| `{typography.button-utility}` | 14px | 600 | 1.29 | 0 | Utility buttons and search filters |
| `{typography.fine-print}` | 12px | 400 | 1.50 | 0 | Footer footnotes and short disclaimers |
| `{typography.micro-legal}` | 10px | 400 | 1.40 | 0 | Exceptional legal detail, not core ordering text |
| `{typography.nav-link}` | 14px | 500 | 1.20 | 0 | Website global navigation |

### Principles

- **Strong but friendly display type.** Use weight 700 on the 34-56px display hierarchy; large tight tracking is intentional, but avoid cramped letters in Indonesian headings.
- **Body clarity beats decoration.** Use 16px / 400 / 1.6 for paragraph copy. Prices and important labels use 600, not tiny all-caps tracking.
- **Two-family discipline.** Plus Jakarta Sans gives Beelicious personality; Inter handles dense UI. Do not introduce a third display font for merchant cards.
- **Use hierarchy to shorten decisions.** Merchant name, dish name, price, and next action should never visually compete with low-priority supporting text.
- **Avoid relying on type styling inside WhatsApp.** Use concise writing, native-supported emphasis where appropriate, and simple numbered choices; the client controls font rendering.

### Note on Font Substitutes

Plus Jakarta Sans and Inter can be loaded as web fonts on Beelicious-owned sites. If unavailable, use `system-ui, sans-serif`. Recheck line breaks in hero headlines and chip widths when falling back; do not change font size merely to imitate an unavailable proprietary face. Neither family can be forced into the live WhatsApp chat interface.

## Layout

### Spacing System

- **Base unit:** 8px, with a 4px sub-step for badges, icons, and close typographic groupings.
- **Tokens:** `{spacing.xxs}` 4px; `{spacing.xs}` 8px; `{spacing.sm}` 12px; `{spacing.md}` 16px; `{spacing.lg}` 24px; `{spacing.xl}` 32px; `{spacing.xxl}` 48px; `{spacing.section}` 80px.
- **Section padding:** 80px vertically on desktop editorial tiles; compress to 48-64px for narrower screens.
- **Card padding:** 24px for merchant and order-summary cards, 16px for compact menu rows.
- **Button padding:** 12-15px vertical and 24-30px horizontal for primary CTAs.
- **Vertical rhythm:** Dish names, descriptions, option prices, and confirmations are grouped more tightly than independent sections.

### Grid & Container

- **Content width:** Approximately 1120-1200px for the main landing page, 960px for text-heavy sections, 1400px maximum for operational dashboards if introduced.
- **Column patterns:** Large editorial hero in two columns; merchant cards in three columns on desktop; compact menus in one or two columns depending on content density.
- **Gutters:** 20-24px across cards; 24-32px for the main desktop content edges.
- **Conversation preview:** A single phone-like illustration may sit beside hero copy. It is a visual mockup, not a replacement for opening the real WhatsApp chat.

### Whitespace Philosophy

Whitespace should make the food and next action obvious. The landing page can use generous negative space above the main headline and around large dish imagery. Ordering and operational cards use a tighter, repeatable rhythm: show price and availability at a glance; do not add large empty gaps between product details and quantity/action controls. When a layout feels busy, remove decorative elements before reducing label size.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| Flat | No shadow, no border | Full-bleed editorial sections, ordinary page background, footer |
| Soft hairline | 1px `{colors.hairline}` border | Merchant cards, form fields, menu item boundaries |
| Backdrop blur | Light parchment at ~90% opacity with gentle blur | Optional sticky website header or order bar |
| Food image shadow | `rgba(29, 27, 27, 0.16) 0 12px 32px` | Isolated food photography or a hero dish cutout; not standard text containers |

**Shadow philosophy.** Beelicious's warmth comes from color, food, and generous geometry, not inflated shadows. Most interface cards remain flat with a thin border. Reserve a single restrained shadow treatment for a real food image that needs separation from the surface. The bee-bot stays mainly flat and vector-like.

### Decorative Depth

- **Food photography** provides natural texture. Use real merchant-provided images wherever possible, rather than representing generated food as an actual menu item.
- **Light/dark tile alternation** provides editorial rhythm without extra borders or graphic separators.
- **Subtle motion** may introduce the bee-bot or scroll between feature sections, but must respect reduced-motion preferences and never delay ordering.
- **No simulated WhatsApp client chrome in production ordering.** Website demos are illustrations; the actual conversation uses native client UI.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | Edge-to-edge page sections and full-bleed image backgrounds |
| `{rounded.xs}` | 6px | Tiny utility labels and image-detail corners |
| `{rounded.sm}` | 10px | Compact icon controls and menu thumbnails |
| `{rounded.md}` | 14px | Secondary capsule panels and compact input groups |
| `{rounded.lg}` | 20px | Merchant cards, food cards, order summaries, chat illustrations |
| `{rounded.pill}` | 9999px | Yellow primary CTA, secondary pill, merchant filters |
| `{rounded.full}` | 9999px / 50% | Circular 44px icon buttons and avatar crops |

### Photography Geometry

- **Hero food photography:** 4:3 or 3:2 image compositions with clear subject space for adjacent copy; use wide imagery only when the meal remains recognizable on mobile.
- **Menu item images:** 1:1 or 4:3 crops with rounded inner corners; the actual dish stays visible and is not distorted to fill the frame.
- **Merchant identity:** 1:1 marks for merchant logos; use a neutral placeholder if a logo is unavailable instead of inventing one.
- **Bee-bot avatar:** 1:1 dark-charcoal background, yellow hood/head with antennae, large rounded ivory face, and **exactly two solid vertical black capsule eyes**. No nose, mouth, chef hat, phone, speech bubble, text, badge ring, or shiny 3D material. The head tilts about 15-20 degrees clockwise and enters from the lower-left, with the top-right remaining open and dark; cheek blush is subtle.
- **Composition preservation:** The bot's eyes and golden silhouette must remain legible at WhatsApp profile-photo sizes. Keep original asset proportions and do not squeeze or center it into a tiny badge.
- **Performance:** Supply responsive `srcset`/`sizes` on the site and favor compressed modern images. Do not add photography or animated assets to WhatsApp messages unless they help the transaction.

## Components

### Top Navigation

**`global-nav`** -- The primary Beelicious website header. White background `{colors.canvas}`, height 64px, body-colored links in `{typography.nav-link}`. Left: Beelicious wordmark or approved logo; right: a short group of useful links and one `{component.button-primary}` labeled "Pesan via WhatsApp". On mobile, keep the ordering action visible when the secondary links collapse.

**`sub-nav-frosted`** -- Optional sticky category/navigation strip on a Beelicious-owned catalog or landing-page subsection. Warm parchment at about 90% opacity, a modest blur, and height 52px. It can carry merchant categories or a compact order CTA; it is not a component inserted into native WhatsApp conversations.

### Buttons

**`button-primary`** -- Core yellow action. `{colors.primary}` fill, `{colors.on-primary}` text, `{typography.body-strong}`, `{rounded.pill}`, 12px by 24px padding. Main use: "Pesan via WhatsApp", "Lihat Menu", or a clearly defined next step on owned interfaces. The yellow fill, not yellow body text, is the action signal.
- Focus: `{component.button-primary-focus}` -- visible 2px `{colors.primary-focus}` outline with adequate offset.
- Pressed: `{component.button-primary-active}` -- Honey Orange fill, optional `transform: scale(0.98)`. A press animation does not mean the transaction succeeded.

**`button-secondary-pill`** -- Low-emphasis alternative. White/transparent fill, charcoal text, subtle `{colors.hairline}` border, full pill radius; use for "Pelajari Cara Kerja" or a non-competing secondary action.

**`button-dark-utility`** -- Dark rectangular utility control for admin/navigation operations. The 10px radius deliberately distinguishes it from the bright consumer CTA.

**`button-pearl-capsule`** -- Warm pearl chip for non-primary options, category filters, and descriptive tags; a selected chip must also have a distinct outline or selected semantics.

**`button-order-hero`** -- Enlarged marketing CTA for the top fold. Same yellow + dark label as the primary button, 18px/600 type, 15px by 30px padding; opens the configured WhatsApp entry point.

**`button-icon-circular`** -- Exactly 44 by 44px, soft translucent ivory surface, charcoal icon. Used for carousel controls, close actions, and quantity adjustments when labels are provided accessibly.

**`text-link`** -- Charcoal text with a dark-amber underline or other visible decoration on white surfaces. Pure yellow text on white is not used for small interactive labels because contrast is inadequate.

**`text-link-on-dark`** -- Light Honey links on charcoal surfaces. Keep underlines or equivalent non-color affordance when the surrounding copy is similarly light.

### Cards & Containers

**`hero-tile-light`** -- Full-bleed white editorial section with a 40px / 700 heading, one concise supporting statement, a primary order CTA, and a genuine meal or bee-bot illustration. The photo/mascot carries visual interest while interface chrome stays minimal.

**`hero-tile-parchment`** -- Same structure on `{colors.canvas-parchment}`. Useful for "Cara Kerja" and benefit-led sections between white and dark tiles.

**`hero-tile-dark`** -- Charcoal editorial section with `{colors.on-dark}` text and a yellow CTA. This is the most suitable large-scale home for the golden bee-bot and its dark-background avatar treatment.

**`hero-tile-dark-2`** and **`hero-tile-dark-3`** -- Two near-charcoal tonal variants for adjacent brand surfaces. Use only when a genuine section boundary needs separating without a hard border.

**`merchant-card`** -- White `{rounded.lg}` card with a hairline border, 24px padding, merchant image/logo, name, supported opening/availability information, and one clear next step. Do not invent ratings, operating hours, or availability.

**`menu-item-card`** -- Compact dish row with thumbnail, name, short description, current price, optional variants, and a single choice/quantity action. Sold-out and unavailable states must use explicit text, not only faded imagery.

**`merchant-option-chip`** -- A pill for merchant/category selection in a **Beelicious-owned UI or preview**; can show a short label and icon. The selected variant is `{component.merchant-option-chip-selected}` with a 2px `{colors.primary-focus}` border and a pale honey fill.

**`conversation-preview-card`** -- A static or animated preview showing the flow of picking a merchant, choosing food, and confirming an order. It may visually resemble a messenger, but must be labeled or presented as an illustration, not a promise of unsupported native WhatsApp controls.

**`order-summary-card`** -- Clear line items, quantities, per-item and total prices, merchant, intended pickup time, and current status. The confirmation action belongs to the actual available ordering channel; do not imply payment has completed unless backend state confirms it.

**`floating-order-bar`** -- Optional sticky bar on a Beelicious-owned web menu. Left: current item count or total; right: one primary action. Keep it above safe-area insets and do not cover error messages.

**`status-chip`** -- Small semantic label for states such as "Menunggu Konfirmasi" or "Siap Diambil". Use verified backend order states and readable copy; status color alone is insufficient.

### Inputs & Forms

**`search-input`** -- 48px-high white pill with subtle border, muted search icon, and 16px Inter text. Use a concise prompt such as "Cari makanan atau tenant". Clearly distinguish search results from active filters and empty states.

On owned websites, form controls require visible focus, error/help text, and disabled states. On WhatsApp, do not invent custom HTML fields, checkboxes, or chat buttons that the current integration cannot render. Send short native-supported choices when available and a numbered text fallback when not. The illustrated customer sequence is merchant -> menu -> quantity/options -> order summary -> pickup -> confirmation.

### Footer

**`footer`** -- Warm parchment base, `{typography.fine-print}` body copy, and short columns for information, merchant contact, support, and policy links as applicable. Avoid presenting features, partner merchants, or legal claims that have not been confirmed. Vertical padding 64px; the product CTA may appear once above the legal row.

## Do's and Don'ts

### Do

- Use `{colors.primary}` as the primary **button fill** with `{colors.on-primary}` text; use `{colors.primary-on-dark}` for legible links on charcoal.
- Set marketing headlines in `{typography.hero-display}` and `{typography.display-lg}` with Plus Jakarta Sans 700 and controlled negative tracking.
- Use `{typography.body}` (16px / 400 / 1.6) for descriptions; keep real prices and pickup times at a readable hierarchy.
- Alternate `{component.hero-tile-light}`, `{component.hero-tile-parchment}`, and `{component.hero-tile-dark}` to create a generous marketing rhythm.
- Reserve `{rounded.pill}` for high-signal actions and selection chips; use `{rounded.lg}` for merchant/menu cards.
- Treat the bee-bot as a friendly **platform identity**, preserving its two black capsule eyes, yellow head, ivory face, and dark background.
- Use genuine merchant food imagery and verified merchant/menu/order data where transaction accuracy matters.
- Keep the main order journey in the WhatsApp chat, with choices tailored to the capabilities actually implemented.
- Provide numbered text responses as a fallback if rich reply/list messages are unavailable or not reliably supported.

### Don't

- Don't portray Beelicious as a chef, restaurant chain, meal producer, or delivery rider; it is the ordering **platform**.
- Don't turn the bee-bot into a detailed 3D face, add pupils, eye glints, a mouth, or a chef hat.
- Don't use WhatsApp Green as the dominant Beelicious brand color, or treat WhatsApp's native UI as customizable website CSS.
- Don't use yellow text on a white card for essential labels, links, prices, or order actions.
- Don't add multiple equally strong primary CTAs to the same decision point.
- Don't apply heavy shadows, shiny gradients, or large ornamental effects to every card and control.
- Don't fabricate merchant ratings, product photos, real-time availability, pickup estimates, payment confirmation, or order statuses.
- Don't require a browser checkout, WhatsApp Flows, or unsupported interactive buttons as the only customer path.
- Don't reduce touch targets or suppress accessible error labels for visual minimalism.

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Small phone | <= 419px | Single column; hero type around 30px; 16px gutters; full-width order CTA |
| Phone | 420-640px | One-column menu/cards; mascot or food image follows main copy; 20px gutters |
| Large phone | 641-735px | More flexible image crop; sections tighten to 48px vertical padding |
| Tablet portrait | 736-833px | Nav links collapse; merchant cards use two columns if content fits |
| Tablet landscape | 834-1023px | Two-column editorial modules; search/filter rows may wrap |
| Small desktop | 1024-1199px | Expanded top nav; restrained 2-3 column merchant grid |
| Desktop | 1200-1440px | Full two-column hero and up to three-column merchant grids |
| Wide desktop | >= 1441px | Main marketing content locks around 1200px; balanced outer margins |

The structural breakpoints that matter most are 420px, 640px, 834px, 1024px, 1200px, and 1440px. These govern **Beelicious-owned surfaces**, not the responsiveness of the WhatsApp app.

### Touch Targets

- Keep primary and icon controls at least 44 by 44px; large order CTAs and fields target 48px height or more.
- Provide 8px or greater spacing between dense selection targets unless the full combined row is the target.
- Quantity, menu selection, and confirmation must work by touch, keyboard, and assistive technology where Beelicious controls the interface.
- In WhatsApp, prefer concise options and clear text rather than lengthy messages with hard-to-locate answer codes.

### Collapsing Strategy

- **Global nav:** desktop wordmark + links + order CTA -> mobile wordmark + menu control + persistent order CTA.
- **Hero:** two-column copy and image -> stacked copy/CTA followed by a cropped bee-bot or meal image.
- **Merchant and menu grids:** three columns -> two -> one, without hiding prices or availability.
- **Order summary:** desktop detail panel -> mobile stacked rows with the total and next action visible.
- **Sticky order bar:** becomes a safe-area-aware full-width mobile control only where a web cart is actually implemented.

### Image Behavior

- Supply crop-aware `srcset` and `sizes`; prioritize above-the-fold brand and food imagery while lazy-loading lower sections.
- Keep dish names and descriptions outside images so they remain readable when crops change.
- Preserve the mascot's two visible capsule eyes when using tight avatar crops; do not scale the icon down until it looks like a tiny circular badge.
- Favor lightweight static artwork on weak connections. Motion/3D embellishments are optional marketing enhancements, not prerequisites for starting an order.

## Iteration Guide

1. Focus on **one component** at a time and reference its YAML key (`{component.merchant-card}`, `{component.button-primary}`, `{component.conversation-preview-card}`).
2. Add component variants as separate YAML entries (`-active`, `-focus`, `-selected`), matching the reference document's grammar.
3. Reference `{token.paths}` wherever possible; do not scatter literal hex values through screens.
4. Preserve Beelicious's non-negotiables: yellow primary controls with dark text, Plus Jakarta Sans display, Inter body, and a two-eye mouthless bee-bot.
5. Keep shadow and gradient treatments restrained; first create hierarchy through type, imagery, and alternating surfaces.
6. Validate customer comprehension in order: merchant -> item -> options/quantity -> recap -> pickup -> confirmation.
7. Treat WhatsApp content and WhatsApp **client chrome** separately; test native message types on the currently deployed integration before depicting them as functional.
8. Prefer simple Indonesian customer wording and consistent rupiah/time formatting to overly clever branded copy.
9. When in doubt about a dense screen, make the next action clearer before adding decoration.

## Known Gaps

- The palette and components are **proposed Beelicious design specifications**, not an audit of existing production UI. Actual production assets and code may need reconciliation.
- The minimalist bee-bot is the current icon direction; a finalized wordmark, exact clear-space values, and a formal asset export kit have not been established here.
- Food photographs, merchant logos, menus, opening hours, prices, and availability must be sourced from real merchant data; this document cannot certify them.
- The live WhatsApp interface is managed by WhatsApp. Message types, native controls, templates, conversation restrictions, and rich-interaction support depend on the integration and platform policies.
- Baileys is the current development integration described in the project; its capabilities and reliability should not be assumed identical to the preserved official API integration.
- Pickup times and order statuses are design examples until backed by actual scheduling rules and state transitions. Payment methods, delivery availability, and cancellation/refund handling are not defined here.
- Merchant or admin dashboard components describe possible Beelicious-owned UI patterns, not evidence that each screen already exists.
- Font rendering, reduced-motion behavior, and accessibility must be validated in implemented interfaces, especially at small screen widths.

## Phase 7 editorial marketing application

The approved redesign uses **Big Type. Bold Food. Playful Bee.** The shared brand palette, body/display font families, focus semantics, and operational component tokens remain intact. The marketing-specific `marketing-hero` and `marketing-heading` scale supersedes the original 56px landing-page suggestion only for expressive marketing scenes. On small phones the hero uses approximately 56–72px type with two authored lines. Body copy remains 16–18px and captions 14px; operational surfaces do not inherit a new typography requirement.

The marketing page uses equal 24px outer gutters (20px phones, 16px small phones), a 1600px maximum frame, and distinct full-bleed charcoal, yellow, and parchment compositions. The original Bee-bot is enlarged and translated/rotated without facial changes or geometric deformation. No glossy effects, illustrative placeholder cards, decorative rules, or generic icon benefit rows are used. Pill actions retain the original action language; future operational cards retain their original radius tokens.

Editorial food photographs are separate from the Warung Babe pilot spotlight. Local assets and licenses are documented in apps/web/ASSETS.md and credited in the footer. They are not merchant menu imagery or evidence of availability. The spotlight remains typographic until verified merchant assets exist.

GSAP owns marketing transforms; CSS owns control feedback. One preview is pinned only on fine-pointer desktops at least 1024px wide and 720px tall with no reduced-motion preference. Six normal-flow narrative chapters determine progress. Phones, short screens, reduced motion, and missing JavaScript retain the complete readable inline story. No smooth-scroll interception or artificial payment controls are introduced.
