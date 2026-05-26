# Formatting, RTL & Translation Workflows

Your SvelteKit app detects the user's locale, routes them to the right language, and renders translated UI strings through Paraglide. That covers the first 30% of production i18n. The remaining 70% is where most teams stumble: formatting numbers and dates correctly for every locale, supporting right-to-left scripts, handling translations that contain HTML without opening XSS holes, integrating with professional translators, and making sure your i18n layer does not tank performance.

## The Intl API

JavaScript ships with a powerful internationalization namespace called `Intl`. It has been in every browser since 2016 and in Node.js since v12. Despite this, most developers reach for libraries like `date-fns` or `numeral.js` for tasks that `Intl` handles natively with zero bundle cost. You pass it a locale string and it formats output according to that locale's conventions — no lookup tables, no locale data bundles shipped to the client.

### Intl.NumberFormat

```ts
// Currency — symbol position, separator, and decimal all differ by locale
new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(1234.56);
// "$1,234.56"
new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(1234.56);
// "R$ 1.234,56"
new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(1234);
// "￥1,234" — yen has no decimal places

// Percentages — German uses comma for decimal
new Intl.NumberFormat('de-DE', { style: 'percent' }).format(0.1825);
// "18,25 %"

// Compact notation — great for dashboards
new Intl.NumberFormat('en', { notation: 'compact' }).format(3500000); // "3.5M"

// Unit formatting
new Intl.NumberFormat('en', { style: 'unit', unit: 'kilometer', unitDisplay: 'short' }).format(5);
// "5 km"
```

The wrong way is depressingly common:

```ts
// WRONG — manual currency formatting
function formatPrice(amount: number): string {
  return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
// Only works for USD in en-US. Breaks for BRL, JPY (0 decimals), BHD (3 decimals).
```

```ts
// CORRECT — locale-aware currency formatting
function formatPrice(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}
```

### Intl.DateTimeFormat

Date formatting is where locale differences are most visible. US uses `12/31/2025`, Europe uses `31/12/2025`, Japan uses `2025/12/31`.

```ts
// WRONG — manual date formatting
function formatDate(date: Date): string {
  return (date.getMonth() + 1) + '/' + date.getDate() + '/' + date.getFullYear();
}
```

```ts
// CORRECT — Intl.DateTimeFormat with named styles
const date = new Date('2025-12-31T15:30:00Z');

new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);  // "Dec 31, 2025"
new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' }).format(date);    // "31. Dezember 2025"
new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long' }).format(date);    // "2025年12月31日"
new Intl.DateTimeFormat('ar-EG', { dateStyle: 'long' }).format(date);    // "٣١ ديسمبر ٢٠٢٥"

// Date and time together
new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
// "Dec 31, 2025, 3:30 PM"

// Time zone handling
new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium', timeStyle: 'long', timeZone: 'Asia/Tokyo'
}).format(date);
// "Jan 1, 2026, 12:30:00 AM GMT+9"
```

### Intl.RelativeTimeFormat

```ts
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
rtf.format(-1, 'day');   // "yesterday"
rtf.format(-3, 'day');   // "3 days ago"
rtf.format(1, 'hour');   // "in 1 hour"

const rtfPt = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
rtfPt.format(-1, 'day'); // "ontem"

const rtfAr = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
rtfAr.format(-2, 'day'); // "قبل يومين" — Arabic has a dual form
```

The `numeric: 'auto'` option is key — without it you get "1 day ago" instead of "yesterday".

### Intl.ListFormat

```ts
const names = ['Alice', 'Bob', 'Charlie'];
new Intl.ListFormat('en', { type: 'conjunction' }).format(names);    // "Alice, Bob, and Charlie"
new Intl.ListFormat('pt-BR', { type: 'conjunction' }).format(names); // "Alice, Bob e Charlie"
new Intl.ListFormat('ja', { type: 'conjunction' }).format(names);    // "Alice、Bob、Charlie"
new Intl.ListFormat('ar', { type: 'conjunction' }).format(names);    // "Alice وBob وCharlie"
```

### Intl.Collator

Sorting strings locale-aware matters for any sortable table, dropdown, or search result:

```ts
const words = ['äpfel', 'apfel', 'Banana', 'banana'];

// WRONG — default sort uses Unicode code point order
words.sort(); // ["Banana", "apfel", "banana", "äpfel"]

// CORRECT — locale-aware sort
words.sort(new Intl.Collator('de').compare); // ä sorts WITH a in German
words.sort(new Intl.Collator('sv').compare); // ä sorts AFTER z in Swedish
```

### Intl.PluralRules

Different languages have different plural categories. English has two ("one", "other"). Russian has four. Arabic has six.

```ts
const prRu = new Intl.PluralRules('ru');
prRu.select(1);  // "one"  — 1 товар
prRu.select(2);  // "few"  — 2 товара
prRu.select(5);  // "many" — 5 товаров
prRu.select(21); // "one"  — 21 товар (!)

const prAr = new Intl.PluralRules('ar');
prAr.select(0);  // "zero"
prAr.select(2);  // "two"  — Arabic has a dual form
prAr.select(11); // "many"
```

Understanding this helps debug why a plural form looks wrong in a locale — the answer is almost always more plural categories than you accounted for.

## Building Formatting Helpers

The `Intl` APIs are powerful but verbose. Build a formatting module that encapsulates locale detection:

```ts
// src/lib/i18n/format.ts
import { languageTag } from '$lib/paraglide/runtime';

type DateStyle = 'short' | 'medium' | 'long' | 'full';

export function formatCurrency(amount: number, currency = 'USD', locale?: string): string {
  return new Intl.NumberFormat(locale ?? languageTag(), { style: 'currency', currency }).format(amount);
}

export function formatCompact(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale ?? languageTag(), { notation: 'compact' }).format(value);
}

export function formatPercent(value: number, decimals = 0, locale?: string): string {
  const tag = locale ?? languageTag();
  return new Intl.NumberFormat(tag, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

export function formatDate(date: Date | string | number, style: DateStyle = 'medium', locale?: string): string {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat(locale ?? languageTag(), { dateStyle: style }).format(d);
}

export function formatRelativeTime(date: Date | string | number, locale?: string): string {
  const tag = locale ?? languageTag();
  const d = date instanceof Date ? date : new Date(date);
  const diffMs = d.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);
  const rtf = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' });

  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, 'second');
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, 'hour');
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, 'day');
  return formatDate(d, 'medium', tag);
}

export function formatList(items: string[], type: 'conjunction' | 'disjunction' = 'conjunction', locale?: string): string {
  return new Intl.ListFormat(locale ?? languageTag(), { type }).format(items);
}

export function localeCompare(locale?: string): (a: string, b: string) => number {
  return new Intl.Collator(locale ?? languageTag()).compare;
}
```

Usage in a component:

```svelte
<script lang="ts">
  import { formatCurrency, formatRelativeTime, formatCompact } from '$lib/i18n/format';
  let { data } = $props();
</script>

<div class="stats-grid">
  <span>{formatCurrency(data.revenue, 'USD')}</span>
  <span>{formatCompact(data.totalUsers)}</span>
  <span>{formatRelativeTime(data.updatedAt)}</span>
</div>
```

When the user switches locale, `languageTag()` returns the new value and all formatted output updates automatically.

## Right-to-Left (RTL) Support

Arabic, Hebrew, Persian, and Urdu read right-to-left, and the entire UI layout must mirror. CSS has evolved to make this manageable — if you use the right primitives from the start.

### Setting the Direction

Set `dir` on the `<html>` element dynamically. Handle it in your server hook so it is set before rendering:

```ts
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';

const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

export const handle: Handle = async ({ event, resolve }) => {
  const locale = event.locals.locale;
  const dir = RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%paraglide.dir%', dir)
  });
};
```

### CSS Logical Properties

This is the single most impactful change for RTL. Logical properties replace physical directions with flow-relative ones. When `dir` changes, the layout mirrors automatically.

```css
/* WRONG — physical properties that break in RTL */
.sidebar {
  margin-left: 1rem;
  padding-right: 2rem;
  border-left: 3px solid blue;
  text-align: left;
}
.notification {
  position: fixed;
  top: 1rem;
  right: 1rem;
}
```

```css
/* CORRECT — logical properties that work in both LTR and RTL */
.sidebar {
  margin-inline-start: 1rem;
  padding-inline-end: 2rem;
  border-inline-start: 3px solid blue;
  text-align: start;
}
.notification {
  position: fixed;
  inset-block-start: 1rem;
  inset-inline-end: 1rem;
}
```

Key mappings:

| Physical               | Logical                        |
|-------------------------|--------------------------------|
| `margin-left`           | `margin-inline-start`          |
| `margin-right`          | `margin-inline-end`            |
| `padding-left`          | `padding-inline-start`         |
| `padding-right`         | `padding-inline-end`           |
| `left` / `right`        | `inset-inline-start` / `end`   |
| `text-align: left`      | `text-align: start`            |
| `border-left`           | `border-inline-start`          |
| `width` / `height`      | `inline-size` / `block-size`   |

### Flexbox, Grid, and Icons

Good news: `flex-direction: row` and CSS Grid already respect `dir`. In RTL, `row` flows right-to-left automatically.

Not all icons should flip. **Flip in RTL:** back/forward arrows, navigation chevrons, breadcrumb separators, reply/forward icons. **Never flip:** checkmarks, media controls (play/pause), search icon, hearts, stars.

```css
[dir='rtl'] .icon-directional {
  transform: scaleX(-1);
}
```

### RTL with Tailwind CSS

Tailwind v3.3+ ships logical property utilities: `ms-*` (margin-start), `me-*` (margin-end), `ps-*` (padding-start), `pe-*` (padding-end), `start-*`, `end-*`:

```svelte
<!-- WRONG — physical directions, breaks in RTL -->
<div class="ml-4 pr-6 text-left border-l-2">Content</div>

<!-- CORRECT — logical properties, works in both directions -->
<div class="ms-4 pe-6 text-start border-s-2">Content</div>
```

For icons that need directional flipping, use `ltr:` and `rtl:` variants:

```svelte
<svg class="h-5 w-5 ltr:rotate-0 rtl:rotate-180"><!-- arrow --></svg>
```

### Bidirectional Text

When a paragraph contains both LTR and RTL text (an Arabic sentence with an English brand name), use `<bdi>` to isolate user-generated content and `<bdo>` to force direction for codes and phone numbers:

```svelte
<p>User <bdi>{user.name}</bdi> posted a comment.</p>
<p>Product code: <bdo dir="ltr">ABC-12345-XYZ</bdo></p>
<a href="tel:+1234567890" dir="ltr">+1 (234) 567-890</a>
```

### Testing RTL

You do not need Arabic translations. Open DevTools, add `dir="rtl"` to `<html>`, and the entire page mirrors. Every physical property you forgot to convert becomes visible. For a development toggle:

```svelte
{#if dev}
  <button onclick={() => document.documentElement.toggleAttribute('data-debug-rtl')}>
    Toggle RTL Debug
  </button>
{/if}
```

```css
html[data-debug-rtl] { direction: rtl; }
```

## Content with HTML in Translations

Sometimes a translation needs bold text or a link. The naive approach opens an XSS vulnerability.

```svelte
<!-- WRONG — XSS vulnerability -->
{@html t('welcome_message')}
```

If a compromised translation file contains `<img src=x onerror='...steal cookies...'>`, every user gets attacked. `{@html}` renders raw HTML without sanitization.

### Safe Pattern: Component-Based Interpolation

Keep HTML out of translation strings. Split the message and wrap in components:

```ts
// messages/en.json
{
  "welcome_before_link": "Welcome to TeamBoard! Read our ",
  "welcome_link_text": "terms of service",
  "welcome_after_link": "."
}
```

```svelte
<p>
  {m.welcome_before_link()}
  <a href="/terms">{m.welcome_link_text()}</a>
  {m.welcome_after_link()}
</p>
```

Verbose but completely safe — no HTML in translation files, no XSS risk.

### Safe Pattern: Sanitized Rich Text

When splitting is impractical, sanitize with DOMPurify:

```ts
// src/lib/i18n/sanitize.ts
import DOMPurify from 'dompurify';

const ALLOWED_TAGS = ['strong', 'em', 'br', 'a', 'span'];
const ALLOWED_ATTRS = ['href', 'class', 'dir'];

export function sanitizeTranslation(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS, ALLOWED_ATTR: ALLOWED_ATTRS, ALLOW_DATA_ATTR: false
  });
}
```

```svelte
{@html sanitizeTranslation(m.welcome_rich())}
```

Paraglide's own approach — plain text with type-safe parameters — is the safest and most maintainable. Keep HTML in components, text in translations.

## Dynamic Content Translation

UI strings live in message catalogs. But user-generated content (blog posts, product descriptions, comments) cannot. You need a different strategy.

### Database-Level i18n

**JSON column** — flexible, no migration needed for new locales:

```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name JSONB NOT NULL DEFAULT '{}',  -- {"en": "Blue Widget", "pt": "Widget Azul", "ar": "أداة زرقاء"}
  description JSONB NOT NULL DEFAULT '{}',
  price_cents INTEGER NOT NULL
);
```

```ts
// src/lib/server/products.ts
import { languageTag } from '$lib/paraglide/runtime';

export function getLocalizedField(field: Record<string, string>, fallback = 'en'): string {
  return field[languageTag()] ?? field[fallback] ?? Object.values(field)[0] ?? '';
}
```

**Separate translations table** — most normalized, scales to any number of locales:

```sql
CREATE TABLE products (id SERIAL PRIMARY KEY, slug TEXT UNIQUE NOT NULL, price_cents INTEGER NOT NULL);
CREATE TABLE product_translations (
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  PRIMARY KEY (product_id, locale)
);
```

### Translation API Pattern

For content you do not control (user comments), machine translation can supplement — never replace — professional translation:

```ts
// src/lib/server/translate.ts
import { DEEPL_API_KEY } from '$env/static/private';

export async function translateText(text: string, targetLang: string): Promise<string> {
  const res = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: { 'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: [text], target_lang: targetLang.toUpperCase() })
  });
  const data = await res.json();
  return data.translations[0].text;
}
```

Always label machine-translated content so users know it is not human-verified.

## Pseudo-Localization

Pseudo-localization transforms English strings to simulate translated text, catching four bug categories before real translations exist: **text overflow** (many languages are 30-50% longer), **untranslated strings** (appear without pseudo-markers), **encoding bugs** (accented characters), and **concatenation bugs** (hardcoded `+` joins).

```ts
// src/lib/i18n/pseudo.ts
const CHAR_MAP: Record<string, string> = {
  a: 'á', b: 'b̆', c: 'ç', d: 'ḍ', e: 'è', f: 'f̤', g: 'ǧ',
  h: 'ẖ', i: 'î', j: 'ǰ', k: 'ķ', l: 'ḷ', m: 'm̃', n: 'ñ',
  o: 'ô', p: 'p̣', q: 'q̇', r: 'ŗ', s: 'ŝ', t: 'ţ', u: 'ü',
  v: 'v̌', w: 'ŵ', x: 'ẋ', y: 'ÿ', z: 'z̧'
};

export function pseudoLocalize(text: string): string {
  let result = '';
  let inPlaceholder = false;
  for (const char of text) {
    if (char === '{') { inPlaceholder = true; result += char; }
    else if (char === '}') { inPlaceholder = false; result += char; }
    else if (inPlaceholder) { result += char; }
    else { result += CHAR_MAP[char.toLowerCase()] ?? char; }
  }
  // Pad ~40% for length simulation, wrap in brackets for detection
  return `[${result}${'~'.repeat(Math.ceil(text.length * 0.4))}]`;
}
```

Generate a pseudo-locale from your English messages:

```ts
// scripts/generate-pseudo-locale.ts
import fs from 'node:fs';
import { pseudoLocalize } from '../src/lib/i18n/pseudo';

const en = JSON.parse(fs.readFileSync('messages/en.json', 'utf-8'));
const pseudo: Record<string, string> = {};
for (const [key, value] of Object.entries(en)) {
  pseudo[key] = pseudoLocalize(value as string);
}
fs.writeFileSync('messages/pseudo.json', JSON.stringify(pseudo, null, 2));
```

Output: `"Save changes"` becomes `"[Ŝáv̌è çẖáñǧèŝ~~~~~~]"`. Any string in your app WITHOUT brackets was not routed through the translation system — hardcoded text, third-party labels, or template literal joins.

## Translation Workflow & CI

### The Professional Pipeline

```
Developer writes English strings → Push to main → CI extracts keys →
Keys sent to TMS (Crowdin/Lokalise) → Translators work → Translations pulled via CI →
PR with updated files → Lint verifies completeness → Merged
```

### TMS Integration

```yaml
# crowdin.yml
project_id_env: CROWDIN_PROJECT_ID
api_token_env: CROWDIN_API_TOKEN
files:
  - source: /messages/en.json
    translation: /messages/%two_letters_code%.json
```

### CI: Check for Missing Translations

```yaml
# .github/workflows/i18n-check.yml
name: i18n Completeness Check
on:
  pull_request:
    paths: ['messages/**', 'src/**']

jobs:
  check-translations:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check for missing translation keys
        run: |
          #!/bin/bash
          set -euo pipefail
          SOURCE="messages/en.json"
          ERRORS=0
          SOURCE_KEYS=$(jq -r 'keys[]' "$SOURCE" | sort)

          for file in messages/*.json; do
            [[ "$file" == "$SOURCE" ]] && continue
            LOCALE=$(basename "$file" .json)
            LOCALE_KEYS=$(jq -r 'keys[]' "$file" | sort)
            MISSING=$(comm -23 <(echo "$SOURCE_KEYS") <(echo "$LOCALE_KEYS"))
            if [[ -n "$MISSING" ]]; then
              echo "::error::Missing keys in $LOCALE:"
              echo "$MISSING" | while read -r key; do echo "  - $key"; done
              ERRORS=$((ERRORS + 1))
            fi
            STALE=$(comm -13 <(echo "$SOURCE_KEYS") <(echo "$LOCALE_KEYS"))
            if [[ -n "$STALE" ]]; then
              echo "::warning::Stale keys in $LOCALE (not in en): $STALE"
            fi
          done

          [[ $ERRORS -gt 0 ]] && echo "::error::$ERRORS locale(s) have missing translations." && exit 1
          echo "All translations complete."
```

### CI: Auto-Sync Translations

```yaml
# .github/workflows/i18n-sync.yml
name: Sync Translations
on:
  push:
    branches: [main]
    paths: ['messages/en.json']
  schedule:
    - cron: '0 6 * * *'

jobs:
  upload-sources:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: crowdin/github-action@v2
        with: { upload_sources: true, upload_translations: false }
        env:
          CROWDIN_PROJECT_ID: ${{ secrets.CROWDIN_PROJECT_ID }}
          CROWDIN_PERSONAL_TOKEN: ${{ secrets.CROWDIN_API_TOKEN }}

  download-translations:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: crowdin/github-action@v2
        with:
          upload_sources: false
          download_translations: true
          create_pull_request: true
          pull_request_title: 'chore(i18n): update translations from Crowdin'
        env:
          CROWDIN_PROJECT_ID: ${{ secrets.CROWDIN_PROJECT_ID }}
          CROWDIN_PERSONAL_TOKEN: ${{ secrets.CROWDIN_API_TOKEN }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Performance

### Lazy Loading Locale Data

Paraglide compiles translations into tree-shakeable modules — only the active language ships to the client. This is a major advantage over libraries like `i18next` that often load all locales upfront. For non-Paraglide libraries, use dynamic imports:

```ts
async function loadLocaleData(locale: string) {
  switch (locale) {
    case 'en': return import('./locales/en.js');
    case 'pt': return import('./locales/pt.js');
    case 'ar': return import('./locales/ar.js');
    default:   return import('./locales/en.js');
  }
}
```

### Font Loading for Non-Latin Scripts

Latin fonts are 20-50KB. CJK fonts (Chinese, Japanese, Korean) can be **2-8MB**. Arabic fonts are 100-500KB. Use `unicode-range` subsetting:

```css
@font-face {
  font-family: 'Noto Sans';
  src: url('/fonts/NotoSans-Latin.woff2') format('woff2');
  unicode-range: U+0000-024F;
  font-display: swap;
}
@font-face {
  font-family: 'Noto Sans Arabic';
  src: url('/fonts/NotoSansArabic.woff2') format('woff2');
  unicode-range: U+0600-06FF, U+0750-077F;
  font-display: swap;
}
```

For CJK, use Google Fonts' automatic subsetting or `fontsource`. Never self-host a full CJK font without subsetting. Conditionally preload fonts based on locale:

```svelte
<svelte:head>
  {#if languageTag() === 'ar'}
    <link rel="preload" href="/fonts/NotoSansArabic.woff2" as="font" type="font/woff2" crossorigin />
  {/if}
</svelte:head>
```

### SSR and Locale Detection

The locale must be determined before rendering begins. If you detect it mid-render, you get a hydration mismatch. The correct order: server hook detects locale from URL/cookie/header, sets locale before `resolve()`, then rendering occurs with the correct locale context. Never detect locale inside a component's `<script>` on the server side.

## Locale-Specific SEO

### Hreflang and x-default

```svelte
<svelte:head>
  <link rel="alternate" hreflang="en" href="https://example.com/en{pathWithoutLocale}" />
  <link rel="alternate" hreflang="pt" href="https://example.com/pt{pathWithoutLocale}" />
  <link rel="alternate" hreflang="ar" href="https://example.com/ar{pathWithoutLocale}" />
  <link rel="alternate" hreflang="x-default" href="https://example.com/en{pathWithoutLocale}" />
</svelte:head>
```

### Locale-Specific Sitemaps

Generate per-locale sitemaps with a sitemap index. Each URL entry should include `xhtml:link` alternates for all locales:

```ts
// src/routes/sitemap-[locale].xml/+server.ts
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const locale = params.locale;
  const urls = [`https://example.com/${locale}`, `https://example.com/${locale}/about`];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  ${urls.map(url => `<url>
    <loc>${url}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${url.replace(`/${locale}/`, '/en/')}" />
    <xhtml:link rel="alternate" hreflang="pt" href="${url.replace(`/${locale}/`, '/pt/')}" />
    <xhtml:link rel="alternate" hreflang="ar" href="${url.replace(`/${locale}/`, '/ar/')}" />
  </url>`).join('\n  ')}
</urlset>`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};
```

### Translated Meta Descriptions and Structured Data

Use Paraglide messages for meta tags and JSON-LD:

```svelte
<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { languageTag } from '$lib/paraglide/runtime';

  const structuredData = $derived(JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'TeamBoard',
    description: m.meta_home_description(),
    url: `https://example.com/${languageTag()}`,
    inLanguage: languageTag()
  }));
</script>

<svelte:head>
  <title>{m.meta_home_title()}</title>
  <meta name="description" content={m.meta_home_description()} />
  {@html `<script type="application/ld+json">${structuredData}</script>`}
</svelte:head>
```

## Try It Exercises

### Exercise 1: Build a Locale-Aware Data Table

Create a component displaying products with name, price, and date columns. Requirements: format prices with `Intl.NumberFormat` per-currency, format dates with `Intl.DateTimeFormat`, sort names with `Intl.Collator`, use only CSS logical properties. Test data:

```ts
const products = [
  { name: 'Widget Pro', price: 29.99, currency: 'USD', addedAt: '2025-03-15' },
  { name: 'Gizmo Elite', price: 149.50, currency: 'EUR', addedAt: '2025-06-22' },
  { name: 'Thingamajig', price: 8500, currency: 'JPY', addedAt: '2025-01-08' }
];
```

Verify by adding `dir="rtl"` in DevTools — the table should mirror correctly with no CSS changes.

### Exercise 2: Pseudo-Localization Audit

Implement the pseudo-localization system and browse every page of your app. Document every string that appears WITHOUT brackets — these are untranslated. Expected findings: image alt text, input placeholders, validation error messages, third-party component labels, and template literal strings.

### Exercise 3: Translation CI Pipeline

Set up `.github/workflows/i18n-check.yml` with the missing-key detection script. Add three locale files, intentionally remove a key from one, push a PR, and verify CI fails with a clear error. Fix the key and verify CI passes. Bonus: add unused-key detection.

## Key Takeaways

1. **Use `Intl`, not string concatenation.** Currency, dates, relative time, lists, sorting, and plurals — all handled with zero bundle cost. Manual formatting breaks in every locale except the one you tested.

2. **CSS logical properties are non-negotiable for RTL.** Replace `margin-left` with `margin-inline-start`, `text-align: left` with `text-align: start`. Do this from day one. Flexbox and Grid already respect `dir`.

3. **Never use `{@html}` with translation strings.** It is a direct XSS vector. Use component-based interpolation or sanitize with DOMPurify.

4. **Pseudo-localization catches more i18n bugs than any lint rule.** Run it in development, browse every page, fix every unbracketed string.

5. **Automate translation completeness in CI.** A missing key should fail the build, not surprise a user with English on a Portuguese page.

6. **Locale data affects performance.** Paraglide tree-shakes unused locales. For fonts, use `unicode-range` subsetting. For CJK, never self-host unsubset fonts. For SSR, determine locale in the server hook before rendering.

7. **Database content needs a separate i18n strategy.** Use JSON columns or translation tables. Machine translation supplements but never replaces professional human translation.

8. **SEO requires per-locale work.** Hreflang tags, locale-specific sitemaps, translated meta descriptions, and localized structured data all need explicit attention.
