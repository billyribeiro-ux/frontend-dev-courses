# i18n Fundamentals

Your app works. It looks great. Users love it. Then the CEO says "we are launching in Brazil next quarter." You stare at your codebase and realize every single user-facing string is hardcoded in English, your date formatting assumes `MM/DD/YYYY`, your layout breaks when text gets 40% longer in German, and your number formatting uses periods for decimals. You have just discovered the most expensive technical debt in frontend development: retrofitting internationalization into an app that was never designed for it.

Internationalization is not a feature you add later. It is an architectural decision that must be made at the start of a project, because it affects how you structure strings, how you format data, how you design layouts, and how your routing works. Adding i18n to an existing app with 500 hardcoded strings, concatenated sentences, and fixed-width layouts is a multi-week refactor that touches nearly every file. Designing for i18n from day one costs almost nothing extra.

This lesson covers the fundamentals of internationalization -- the concepts, formats, patterns, and pitfalls that apply regardless of which framework or library you use. You will learn how locale codes work, how message catalogs are structured, how the ICU MessageFormat standard handles the complexity of human language, and how to detect and negotiate locales. In the next lesson, we will apply all of this to SvelteKit specifically.

## i18n vs l10n: Two Different Jobs

These two terms get used interchangeably, but they mean very different things:

**Internationalization (i18n)** is the engineering work. It is the architecture, infrastructure, and code patterns that make your application capable of supporting multiple languages and locales. This includes externalizing strings, formatting numbers and dates with locale-aware APIs, designing flexible layouts, and building a locale detection and routing system. i18n is done by developers.

**Localization (l10n)** is the content work. It is the actual translation of strings, adaptation of images, adjustment of date and currency formats, and cultural adaptation of content for a specific market. l10n is done by translators, often with the help of translation management platforms.

The relationship is sequential: you must internationalize your app before you can localize it. You cannot hand a translator your codebase and say "translate this" if all the strings are buried in component files mixed with markup and logic. i18n creates the infrastructure; l10n fills it with content.

```
i18n (developers)                    l10n (translators)
─────────────────                    ──────────────────
Extract strings to catalogs     →    Translate message catalogs
Build locale-aware formatting   →    Verify formats per locale
Design flexible layouts         →    Test layouts in each language
Implement locale routing        →    Verify SEO per locale
Set up plural/gender rules      →    Apply language-specific rules
```

### Why Retrofitting Is So Painful

Consider a typical component that was not designed for i18n:

```svelte
<!-- This component has 9 i18n problems. Can you spot them all? -->
<script lang="ts">
  let { user, itemCount, lastLogin } = $props();
</script>

<div class="dashboard">
  <h1>Welcome back, {user.name}!</h1>
  <p>You have {itemCount} items in your cart.</p>
  <p>Last login: {lastLogin.toLocaleDateString()}</p>
  <p>Total: ${user.cartTotal.toFixed(2)}</p>
  <button style="width: 120px">Checkout Now</button>
  <img src="/images/sale-banner-en.png" alt="Summer Sale - 50% Off!" />
  <p>
    {"You have " + user.notifications + " new notification" + (user.notifications !== 1 ? "s" : "")}
  </p>
</div>
```

The problems:

1. **Hardcoded strings** -- "Welcome back", "items in your cart", "Checkout Now" are all embedded directly
2. **String concatenation** for pluralization -- the notification sentence assumes English plural rules
3. **English-only pluralization** -- only handles singular/plural, but Russian has 4 forms, Arabic has 6
4. **Hardcoded currency symbol** -- `$` is not used in Brazil (R$), Japan (¥), or most of the world
5. **Fixed button width** -- `120px` will overflow in German ("Zur Kasse gehen") or French ("Passer la commande")
6. **Image with baked-in English text** -- you need a separate image for every locale
7. **Date formatting without locale** -- `toLocaleDateString()` without a locale argument uses the browser's default, which may not match the user's chosen app locale
8. **Number formatting assumptions** -- `.toFixed(2)` gives `1234.56` but Brazilian users expect `1.234,56`
9. **Concatenated greeting** -- "Welcome back, {name}!" assumes the name comes after the greeting, but in Japanese the name comes first

Every one of these is a separate fix, and this is just one component. Multiply by every page in your app.

## Locale Codes: BCP 47

A **locale** identifies a specific combination of language, region, and other cultural preferences. The standard format is **BCP 47** (IETF Best Current Practice 47), which uses a structured tag system.

### Tag Structure

```
language[-script][-region][-variant]

Examples:
en          → English (no region specified)
en-US       → English as used in the United States
en-GB       → English as used in Great Britain
pt-BR       → Portuguese as used in Brazil
pt-PT       → Portuguese as used in Portugal
zh-Hans     → Chinese written in Simplified script
zh-Hant     → Chinese written in Traditional script
zh-Hans-CN  → Simplified Chinese as used in mainland China
zh-Hant-TW  → Traditional Chinese as used in Taiwan
sr-Latn     → Serbian written in Latin script
sr-Cyrl     → Serbian written in Cyrillic script
```

**Language subtag** (required): A 2- or 3-letter ISO 639 code. `en`, `pt`, `zh`, `ar`, `de`, `ja`, `ru`.

**Script subtag** (optional): A 4-letter ISO 15924 code specifying the writing system. `Hans` (Simplified Chinese), `Hant` (Traditional Chinese), `Latn` (Latin), `Cyrl` (Cyrillic), `Arab` (Arabic). Only needed when a language uses multiple scripts.

**Region subtag** (optional): A 2-letter ISO 3166-1 code or 3-digit UN M.49 code. `US`, `BR`, `GB`, `CN`, `TW`. Specifies regional variations in vocabulary, spelling, and formatting.

### Why Region Matters Beyond Translation

The difference between `en-US` and `en-GB` is not just "color" vs "colour." The locale affects data formatting throughout your entire application:

```ts
// Number formatting
const num = 1234567.89;

new Intl.NumberFormat('en-US').format(num);    // "1,234,567.89"
new Intl.NumberFormat('de-DE').format(num);    // "1.234.567,89"
new Intl.NumberFormat('fr-FR').format(num);    // "1 234 567,89"
new Intl.NumberFormat('hi-IN').format(num);    // "12,34,567.89"  (lakhs grouping!)

// Currency formatting
const price = 1234.5;

new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price);
// "$1,234.50"

new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(price);
// "1.234,50 €"

new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(price);
// "¥1,235"  (JPY has no decimal places!)

new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);
// "R$ 1.234,50"

// Date formatting
const date = new Date('2025-03-15');

new Intl.DateTimeFormat('en-US').format(date);    // "3/15/2025"
new Intl.DateTimeFormat('en-GB').format(date);    // "15/03/2025"
new Intl.DateTimeFormat('de-DE').format(date);    // "15.3.2025"
new Intl.DateTimeFormat('ja-JP').format(date);    // "2025/3/15"
new Intl.DateTimeFormat('fa-IR').format(date);    // "۱۴۰۳/۱۲/۲۵" (Persian calendar!)

// Sort order (collation)
const words = ['ä', 'z', 'a'];

words.sort(new Intl.Collator('de').compare);   // ['a', 'ä', 'z']  (ä sorts with a)
words.sort(new Intl.Collator('sv').compare);   // ['a', 'z', 'ä']  (ä sorts after z in Swedish!)
```

Notice the Hindi example: India uses a **lakh** grouping system (12,34,567) instead of the Western pattern (1,234,567). The Persian example uses an entirely different calendar. Swedish sorts `ä` after `z`, while German sorts it with `a`. These are not edge cases -- they are the daily reality for billions of users.

### Text Direction

Locale also determines text direction. Most languages are **LTR** (left-to-right), but Arabic, Hebrew, Persian, and Urdu are **RTL** (right-to-left). This affects your entire layout:

```
LTR languages: English, Portuguese, German, French, Chinese, Japanese, Russian
RTL languages: Arabic (ar), Hebrew (he), Persian/Farsi (fa), Urdu (ur)
```

RTL is not just "flip the text." It means your entire layout mirrors: sidebars swap sides, icons that imply direction flip, progress bars fill from right to left, and padding/margin on "start" and "end" sides reverse. We will cover RTL implementation in detail in lesson 3.

## Message Catalogs

A **message catalog** is a file that maps keys to translated strings for a specific locale. Instead of hardcoding `"Welcome back"` in your component, you use a key like `dashboard.greeting`, and the i18n system looks up the correct translation at runtime.

### JSON Format

The most common format for web applications is JSON:

```json
// messages/en.json
{
  "dashboard": {
    "greeting": "Welcome back, {name}!",
    "cart": {
      "itemCount": "{count, plural, =0 {Your cart is empty} one {1 item in your cart} other {{count} items in your cart}}",
      "checkout": "Checkout"
    },
    "lastLogin": "Last login: {date}"
  },
  "auth": {
    "login": {
      "title": "Sign In",
      "email": "Email address",
      "password": "Password",
      "submit": "Sign In",
      "forgotPassword": "Forgot your password?"
    },
    "register": {
      "title": "Create Account",
      "submit": "Create Account"
    }
  }
}
```

```json
// messages/pt-BR.json
{
  "dashboard": {
    "greeting": "Bem-vindo de volta, {name}!",
    "cart": {
      "itemCount": "{count, plural, =0 {Seu carrinho está vazio} one {1 item no seu carrinho} other {{count} itens no seu carrinho}}",
      "checkout": "Finalizar compra"
    },
    "lastLogin": "Último acesso: {date}"
  },
  "auth": {
    "login": {
      "title": "Entrar",
      "email": "Endereço de e-mail",
      "password": "Senha",
      "submit": "Entrar",
      "forgotPassword": "Esqueceu sua senha?"
    },
    "register": {
      "title": "Criar conta",
      "submit": "Criar conta"
    }
  }
}
```

### Nested vs Flat Keys

There are two conventions for organizing message keys:

**Nested keys** (shown above) use JSON nesting to create hierarchy. The key `dashboard.cart.checkout` maps to `{ dashboard: { cart: { checkout: "..." } } }`.

**Flat keys** use dot-separated strings as literal keys:

```json
{
  "dashboard.greeting": "Welcome back, {name}!",
  "dashboard.cart.itemCount": "{count, plural, =0 {Your cart is empty} one {1 item} other {{count} items}}",
  "dashboard.cart.checkout": "Checkout",
  "auth.login.title": "Sign In",
  "auth.login.submit": "Sign In"
}
```

Both work. Nested is more readable for humans; flat is simpler to process programmatically and avoids ambiguity when a key exists at both a leaf and a branch. Most modern i18n libraries support both.

### Semantic Keys vs Positional Keys

This matters more than you think:

```json
// WRONG: Positional keys -- meaningless without context
{
  "button_1": "Submit",
  "button_2": "Cancel",
  "text_1": "Welcome",
  "header_3": "Settings",
  "msg_42": "Are you sure?"
}

// CORRECT: Semantic keys -- self-documenting, organized by feature
{
  "auth.login.submit": "Submit",
  "common.cancel": "Cancel",
  "dashboard.greeting": "Welcome",
  "settings.title": "Settings",
  "dialog.confirmDelete": "Are you sure?"
}
```

Semantic keys tell the translator where the string appears and what it means. When a translator sees `auth.login.submit`, they know this is a button label on the login page. When they see `button_1`, they have no context. Lack of context leads to wrong translations -- the German word for "Submit" depends entirely on whether it is a form submission ("Absenden"), a proposal ("Einreichen"), or a surrender ("Unterwerfen").

## ICU MessageFormat

The **International Components for Unicode (ICU) MessageFormat** is the industry standard for handling message formatting across languages. It solves the hard problems: interpolation, pluralization, gender selection, and nested combinations of all of these.

### Simple Interpolation

The simplest case: insert a value into a message.

```
"Hello, {name}!"
```

With `{ name: "Maria" }` this produces `"Hello, Maria!"`. Straightforward. But even here, consider that the position of the name varies by language:

```json
// English: greeting first, then name
"greeting": "Hello, {name}!"

// Japanese: name first, then greeting (name-san, konnichiwa)
"greeting": "{name}さん、こんにちは！"
```

This is why interpolation with placeholders works and string concatenation does not. With placeholders, each translation controls where the variable appears. With concatenation, the position is hardcoded in your source code.

### Why Concatenation Is Always Wrong

```ts
// WRONG: String concatenation -- locks word order to English
const message = "Welcome, " + user.name + "! You have " + count + " new messages.";

// WRONG: Template literals -- same problem, just prettier syntax
const message = `Welcome, ${user.name}! You have ${count} new messages.`;

// CORRECT: ICU MessageFormat -- each language controls the full sentence
// en: "Welcome, {name}! You have {count} new messages."
// ja: "{name}さん、ようこそ！新しいメッセージが{count}件あります。"
// ar: "مرحبًا {name}! لديك {count} رسائل جديدة."
const message = t('dashboard.welcome', { name: user.name, count });
```

In Arabic, the sentence structure is completely different. In Japanese, the count comes near the end and uses a counter word. No amount of concatenation can handle this -- only a full-sentence translation with placeholders works.

### Pluralization

This is where most naive i18n implementations fail catastrophically. English has two plural forms: singular and plural. So developers write this:

```ts
// WRONG: English-only pluralization
function formatItems(count: number): string {
  return count === 1 ? '1 item' : `${count} items`;
}
```

This works for English. It is completely broken for almost every other language.

**Plural rules vary wildly across languages:**

```
English:   2 forms  →  one (1), other (0, 2, 3, 4, 5, ...)
French:    2 forms  →  one (0, 1), other (2, 3, 4, ...)       ← 0 is singular!
Russian:   4 forms  →  one (1, 21, 31, ...), few (2-4, 22-24, ...), 
                       many (5-20, 25-30, ...), other (1.5, 2.3, ...)
Arabic:    6 forms  →  zero (0), one (1), two (2), few (3-10), 
                       many (11-99), other (100+)
Japanese:  1 form   →  other (everything -- Japanese has no plural forms)
Polish:    4 forms  →  one (1), few (2-4, 22-24, ...), 
                       many (5-21, 25-31, ...), other (1.5, 2.7, ...)
```

Notice that French treats 0 as singular ("0 item"), while English treats it as plural ("0 items"). Russian uses the "few" form for 2, 3, and 4, but the "many" form for 5 through 20, then cycles back. Arabic has a dedicated dual form for exactly 2.

ICU MessageFormat handles all of this:

```
"{count, plural, 
  =0 {No items in your cart}
  one {1 item in your cart}
  other {{count} items in your cart}
}"
```

The `plural` keyword triggers locale-aware plural rule selection. The categories (`zero`, `one`, `two`, `few`, `many`, `other`) are defined by the Unicode CLDR (Common Locale Data Repository) for every language. You only need to provide the categories that your target language uses.

Russian translation:

```
"{count, plural,
  one {{count} товар в корзине}
  few {{count} товара в корзине}
  many {{count} товаров в корзине}
  other {{count} товара в корзине}
}"
```

Arabic translation:

```
"{count, plural,
  zero {لا توجد عناصر في سلتك}
  one {عنصر واحد في سلتك}
  two {عنصران في سلتك}
  few {{count} عناصر في سلتك}
  many {{count} عنصرًا في سلتك}
  other {{count} عنصر في سلتك}
}"
```

### Select (Gender and Other Choices)

The `select` keyword lets you branch on any string value, most commonly for grammatical gender:

```
"{gender, select,
  male {He liked your post}
  female {She liked your post}
  other {They liked your post}
}"
```

Portuguese translation (where the adjective also changes form):

```
"{gender, select,
  male {Ele curtiu sua publicação}
  female {Ela curtiu sua publicação}
  other {Curtiu sua publicação}
}"
```

German (where articles and adjective endings change):

```
"{gender, select,
  male {Er hat deinen Beitrag geliked}
  female {Sie hat deinen Beitrag geliked}
  other {Die Person hat deinen Beitrag geliked}
}"
```

`select` is not limited to gender. You can use it for any enumerated choice:

```
"{role, select,
  admin {You have full access to all settings}
  editor {You can edit and publish content}
  viewer {You can view content only}
  other {Your access level is unknown}
}"
```

### Nested: Combining Plural and Select

Real-world messages often need both pluralization and selection:

```
"{gender, select,
  male {{count, plural,
    =0 {He has not posted any photos}
    one {He has posted 1 photo}
    other {He has posted {count} photos}
  }}
  female {{count, plural,
    =0 {She has not posted any photos}
    one {She has posted 1 photo}
    other {She has posted {count} photos}
  }}
  other {{count, plural,
    =0 {They have not posted any photos}
    one {They have posted 1 photo}
    other {They have posted {count} photos}
  }}
}"
```

This is verbose, but it is correct. Every language can express the full matrix of gender and plurality. The alternative -- building this with string concatenation -- is impossible to translate correctly.

### Number and Date Formatting in ICU

ICU MessageFormat also supports inline formatting:

```
"Your balance is {amount, number, currency}"
"Last updated on {date, date, medium}"
"Event starts at {time, time, short}"
"Sale: {discount, number, percent} off!"
```

However, in practice, most web i18n libraries delegate number and date formatting to the `Intl` APIs we covered earlier, rather than implementing the full ICU number/date skeleton system. You will typically format dates and numbers separately and pass the formatted values (or raw values with a format specifier) to your messages.

## Locale Detection: The Cascade

When a user arrives at your application, how do you know which locale to serve? There are multiple signals, and they should be checked in a specific priority order:

### The Detection Cascade

```
1. URL path or subdomain     →  /pt-BR/about  or  pt-br.example.com
2. User preference (DB)      →  Logged-in user's saved locale setting
3. Cookie                    →  Previously selected locale stored in a cookie
4. Accept-Language header    →  Browser's language preferences sent with every request
5. navigator.language        →  Browser's UI language (client-side only)
6. GeoIP                     →  Server-side guess based on IP address (least reliable)
7. Default fallback          →  Your app's default locale (usually 'en')
```

Each method has trade-offs:

### 1. URL-Based Detection (Best for SEO)

```
Path-based:       example.com/en/about     example.com/pt-BR/about
Subdomain-based:  en.example.com/about     pt-br.example.com/about
Domain-based:     example.com/about        example.com.br/about
```

URL-based locale is the gold standard because:
- Each locale has a unique, shareable URL
- Search engines can crawl and index each locale separately
- Users can bookmark a specific locale
- The locale is visible and predictable

```ts
// Extracting locale from URL path
function getLocaleFromPath(pathname: string): string | null {
  const supportedLocales = ['en', 'pt-BR', 'de', 'ja', 'ar'];
  const segments = pathname.split('/');
  const firstSegment = segments[1]; // "/en/about" → "en"

  return supportedLocales.find(
    (locale) => locale.toLowerCase() === firstSegment?.toLowerCase()
  ) ?? null;
}
```

### 2. Cookie-Based Detection

```ts
// Reading locale from a cookie
function getLocaleFromCookie(cookieHeader: string): string | null {
  const match = cookieHeader.match(/(?:^|;\s*)locale=([^;]+)/);
  return match ? match[1] : null;
}

// Setting locale cookie when user switches language
function setLocaleCookie(locale: string): void {
  document.cookie = `locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}
```

Cookies are useful for remembering a user's explicit language choice. When a user clicks "Portugues" in your language switcher, you store that preference in a cookie so their next visit starts in the right language.

### 3. Accept-Language Header

Every HTTP request includes an `Accept-Language` header with the browser's language preferences, ranked by quality value:

```
Accept-Language: pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7
```

This says: "I prefer Brazilian Portuguese, then any Portuguese, then US English, then any English."

```ts
// Parsing the Accept-Language header
function getLocaleFromHeader(acceptLanguage: string, supported: string[]): string {
  const preferences = acceptLanguage
    .split(',')
    .map((part) => {
      const [locale, quality] = part.trim().split(';q=');
      return {
        locale: locale.trim(),
        quality: quality ? parseFloat(quality) : 1.0
      };
    })
    .sort((a, b) => b.quality - a.quality);

  for (const pref of preferences) {
    // Exact match
    const exact = supported.find(
      (s) => s.toLowerCase() === pref.locale.toLowerCase()
    );
    if (exact) return exact;

    // Language-only match (pt-BR request matches pt)
    const language = pref.locale.split('-')[0];
    const partial = supported.find(
      (s) => s.toLowerCase().startsWith(language.toLowerCase())
    );
    if (partial) return partial;
  }

  return supported[0]; // Fallback to default
}
```

### 4. Browser navigator.language

```ts
// Client-side only -- not available during SSR
const browserLocale = navigator.language;        // "pt-BR"
const allPreferences = navigator.languages;      // ["pt-BR", "pt", "en-US", "en"]
```

This is only available in the browser, so it cannot be used for server-side rendering. Use `Accept-Language` on the server -- it contains the same information.

### Putting the Cascade Together

```ts
function detectLocale(
  url: URL,
  cookies: Record<string, string>,
  acceptLanguage: string
): string {
  const supported = ['en', 'pt-BR', 'de', 'ja', 'ar'];
  const fallback = 'en';

  // 1. Check URL path
  const fromPath = getLocaleFromPath(url.pathname);
  if (fromPath) return fromPath;

  // 2. Check cookie (user's explicit preference)
  const fromCookie = cookies['locale'];
  if (fromCookie && supported.includes(fromCookie)) return fromCookie;

  // 3. Check Accept-Language header
  const fromHeader = getLocaleFromHeader(acceptLanguage, supported);
  if (fromHeader) return fromHeader;

  // 4. Fallback
  return fallback;
}
```

### Why URL-Based Is Best

Consider what happens when a Brazilian user shares a link with a German colleague:

```
URL-based:  example.com/pt-BR/products/42
→ German colleague opens it → sees Portuguese page → can switch to /de/products/42
→ Google can index both /pt-BR/products/42 and /de/products/42 independently

Cookie-based:  example.com/products/42
→ German colleague opens it → sees German (from their own cookie/header)
→ The shared link shows different content to different people
→ Google sees only one version -- whichever the crawler's Accept-Language gets
```

URL-based locale is the only approach that gives you proper SEO, sharable links, and predictable behavior. Cookie-based detection is a supplement for the initial visit, not a replacement for URL-based routing.

## The Translation Function Pattern

Every i18n library, regardless of framework, implements some variant of the same core pattern: a function (commonly called `t`, `$t`, or `m`) that takes a message key and optional parameters, looks up the translated string in the current locale's message catalog, interpolates the parameters, and returns the final string.

Let us build a minimal version from scratch to understand what is happening under the hood:

```ts
// i18n-minimal.ts -- A teaching implementation. Do NOT use this in production.

type MessageCatalog = Record<string, string>;
type Catalogs = Record<string, MessageCatalog>;

// Flat message catalogs for two locales
const catalogs: Catalogs = {
  en: {
    'greeting': 'Hello, {name}!',
    'cart.items': 'You have {count} items in your cart.',
    'cart.empty': 'Your cart is empty.',
  },
  'pt-BR': {
    'greeting': 'Olá, {name}!',
    'cart.items': 'Você tem {count} itens no seu carrinho.',
    'cart.empty': 'Seu carrinho está vazio.',
  },
};

let currentLocale = 'en';

// The core translation function
function t(key: string, params?: Record<string, string | number>): string {
  const catalog = catalogs[currentLocale];
  if (!catalog) {
    console.warn(`Missing catalog for locale: ${currentLocale}`);
    return key;
  }

  let message = catalog[key];
  if (!message) {
    console.warn(`Missing translation: ${currentLocale}:${key}`);
    return key; // Return the key as fallback -- makes missing translations visible
  }

  // Simple parameter interpolation: replace {name} with the value of params.name
  if (params) {
    for (const [param, value] of Object.entries(params)) {
      message = message.replaceAll(`{${param}}`, String(value));
    }
  }

  return message;
}

// Usage
currentLocale = 'en';
t('greeting', { name: 'Maria' });          // "Hello, Maria!"
t('cart.items', { count: 3 });             // "You have 3 items in your cart."

currentLocale = 'pt-BR';
t('greeting', { name: 'Maria' });          // "Olá, Maria!"
t('cart.items', { count: 3 });             // "Você tem 3 itens no seu carrinho."

// Missing key -- returns the key itself as a visible indicator
t('nonexistent.key');                       // "nonexistent.key"
```

This minimal implementation demonstrates the core concept, but it is missing everything that makes i18n actually work in production:

- No pluralization rules (the hard part)
- No ICU MessageFormat parsing
- No nested key resolution
- No fallback locale chain (`pt-BR` → `pt` → `en`)
- No lazy loading of catalogs
- No type safety for keys or parameters
- No SSR support
- No reactive locale switching

This is exactly why you should use a real library. The translation function looks simple, but the full implementation involves parsing ICU syntax, loading Unicode CLDR plural rules for 200+ locales, handling nested select/plural combinations, managing catalog loading and caching, and integrating with your framework's reactivity system. Libraries like Paraglide (which we will use in the next lesson), FormatJS, i18next, and Lingui have spent years getting this right.

### The Fallback Chain

A critical feature of production i18n systems is the **fallback chain**. If a translation is missing in `pt-BR`, the system should try `pt`, then fall back to the default locale (usually `en`) rather than showing a raw key to the user:

```ts
// Fallback chain: pt-BR → pt → en
function resolveLocaleChain(locale: string, defaultLocale: string): string[] {
  const chain: string[] = [locale];

  // Add language-only variant if locale has a region
  if (locale.includes('-')) {
    chain.push(locale.split('-')[0]); // "pt-BR" → "pt"
  }

  // Add default locale if not already in chain
  if (!chain.includes(defaultLocale)) {
    chain.push(defaultLocale);
  }

  return chain;
}

resolveLocaleChain('pt-BR', 'en');  // ["pt-BR", "pt", "en"]
resolveLocaleChain('en-US', 'en');  // ["en-US", "en"]
resolveLocaleChain('de', 'en');     // ["de", "en"]
```

This ensures users never see raw message keys. A partially translated locale gracefully falls back to the base language or the default.

## String Extraction and Management

In a real project, the workflow for managing translations follows a specific pipeline:

### The Translation Pipeline

```
1. Developer writes code with message keys          t('cart.checkout')
              ↓
2. Extraction tool scans code for keys              → cart.checkout
              ↓
3. Keys are added to the source catalog             en.json gets new entry
              ↓
4. Catalogs are uploaded to a TMS                   → Crowdin, Lokalise, etc.
              ↓
5. Translators translate (or MT + human review)     → pt-BR.json, de.json, ...
              ↓
6. Translated catalogs are pulled back into code    → messages/pt-BR.json
              ↓
7. CI validates: no missing keys, no unused keys    → build passes or fails
```

**TMS (Translation Management System)** platforms handle the middle of this pipeline:

- **Crowdin** -- Popular open-source-friendly platform. Free for open source projects. Supports ICU, ARB, JSON, XLIFF. Has GitHub integration that auto-creates PRs with new translations.
- **Lokalise** -- Developer-focused with a good API. Supports over-the-air translation updates (change a translation without redeploying).
- **Transifex** -- Strong in the open source world. Good support for plural forms and context.
- **Phrase (formerly Memsource)** -- Enterprise-focused with translation memory and machine translation integration.

### Machine Translation + Human Review

Modern workflows often use a hybrid approach:

1. New strings are automatically translated by a machine translation engine (DeepL, Google Translate)
2. Machine translations are flagged for human review
3. Professional translators review, correct, and approve
4. Approved translations are merged back

This speeds up the process dramatically. Machine translation handles the bulk, and human translators focus on the strings that need cultural nuance -- marketing copy, error messages, legal text.

### What Gets Extracted

Not everything goes through the translation pipeline:

```ts
// YES -- extract these (user-facing strings)
t('auth.login.title')              // Page titles
t('form.email.label')              // Form labels
t('error.networkFailure')          // Error messages
t('nav.dashboard')                 // Navigation
t('product.addToCart')             // Button text
t('notification.newMessage')       // Notifications

// NO -- do NOT extract these (developer-facing strings)
console.log('Auth failed')         // Log messages
throw new Error('Invalid input')   // Internal errors
// TODO: refactor this              // Comments
const API_ENDPOINT = '/api/v1'     // Configuration
```

Developer-facing strings (logs, errors, comments) stay in English. They are for debugging, not for end users. Translating `console.log` messages wastes translator time and makes debugging harder.

## Common Pitfalls That Break Translations

These are the mistakes that seem minor in English but cause catastrophic failures in other languages. Every one of these has cost real teams real money to fix in production.

### Pitfall 1: String Concatenation

```ts
// WRONG: Locks word order to English
const msg = "Welcome to " + appName + ", " + userName + "!";
// English: "Welcome to MyApp, Maria!"
// But German needs: "Willkommen bei MyApp, Maria!"
// And Japanese needs: "Maria様、MyAppへようこそ！"  (completely different order)

// CORRECT: Full sentence as a single translatable unit
// en: "Welcome to {app}, {name}!"
// de: "Willkommen bei {app}, {name}!"
// ja: "{name}様、{app}へようこそ！"
t('welcome', { app: appName, name: userName });
```

**Rule: Every translatable string must be a complete sentence or phrase.** Never split a sentence across multiple keys or build it with concatenation.

### Pitfall 2: Naive Pluralization

```ts
// WRONG: Only handles English singular/plural
const msg = `${count} file${count !== 1 ? 's' : ''} selected`;

// WRONG: Even a ternary is too simplistic
const msg = count === 1 ? '1 file selected' : `${count} files selected`;

// CORRECT: Use ICU plural syntax with all forms the target language needs
// en: "{count, plural, one {1 file selected} other {{count} files selected}}"
// ru: "{count, plural, one {{count} файл выбран} few {{count} файла выбрано} many {{count} файлов выбрано} other {{count} файла выбрано}}"
// ar: "{count, plural, zero {لم يتم تحديد ملفات} one {ملف واحد محدد} two {ملفان محددان} few {{count} ملفات محددة} many {{count} ملفًا محددًا} other {{count} ملف محدد}}"
t('files.selected', { count });
```

### Pitfall 3: Hardcoded Date and Number Formats

```ts
// WRONG: Hardcoded format that only makes sense in the US
const dateStr = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
// 3/15/2025 -- American. Confusing to everyone else. Is this March 15 or the 3rd of the 15th month?

// WRONG: Hardcoded decimal format
const price = `$${amount.toFixed(2)}`;
// $1234.56 -- wrong currency, wrong decimal separator, wrong grouping for most of the world

// CORRECT: Use Intl APIs with the user's locale
const dateStr = new Intl.DateTimeFormat(locale, {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
}).format(date);
// en-US: "March 15, 2025"
// pt-BR: "15 de março de 2025"
// de-DE: "15. März 2025"
// ja-JP: "2025年3月15日"

const priceStr = new Intl.NumberFormat(locale, {
  style: 'currency',
  currency: userCurrency
}).format(amount);
// en-US, USD: "$1,234.56"
// pt-BR, BRL: "R$ 1.234,56"
// de-DE, EUR: "1.234,56 €"
// ja-JP, JPY: "¥1,235"
```

### Pitfall 4: Embedded HTML in Translations

```json
// DANGEROUS: HTML in translations is an XSS vector
{
  "welcome": "Click <a href='/settings'>here</a> to update your <b>settings</b>."
}
```

If translations come from an external source (a TMS, a translator, or user-contributed translations), any HTML in the translation could include malicious scripts. A compromised translator or a TMS breach could inject `<script>` tags into your app.

```json
// SAFER: Use placeholders for markup, interpolate safely in code
{
  "welcome": "Click {settingsLink} to update your {bold_start}settings{bold_end}."
}
```

```svelte
<!-- In your component, you control the HTML -->
<p>
  {@html t('welcome', {
    settingsLink: '<a href="/settings">' + t('common.here') + '</a>',
    bold_start: '<b>',
    bold_end: '</b>'
  })}
</p>
```

Even better, many i18n libraries support rich text components that avoid `@html` entirely. We will cover this in the SvelteKit lesson.

### Pitfall 5: Assuming Text Length

English is one of the more compact languages. When you translate to other languages, text length changes dramatically:

```
English:    "Settings"           (8 chars)
German:     "Einstellungen"      (14 chars, +75%)
Finnish:    "Asetukset"          (9 chars, +12%)
Russian:    "Настройки"          (9 chars, +12%)
Arabic:     "الإعدادات"           (9 chars, +12%)
Japanese:   "設定"                (2 chars, -75%)

English:    "Log out"            (7 chars)
German:     "Abmelden"           (8 chars, +14%)
Portuguese: "Sair"               (4 chars, -43%)
French:     "Se déconnecter"     (14 chars, +100%)

English:    "Submit"             (6 chars)
German:     "Absenden"           (8 chars, +33%)
Portuguese: "Enviar"             (6 chars, same)
Finnish:    "Lähetä"             (6 chars, same)
Russian:    "Отправить"          (9 chars, +50%)
```

**General rule of thumb:**

```
German, Finnish:        30-40% longer than English
French, Portuguese:     15-25% longer
Russian:                20-30% longer
CJK (Chinese, Japanese, Korean):  20-40% shorter in characters,
                                  but may be wider due to character width
Arabic, Hebrew:         Similar length, but RTL layout changes everything
```

### Pitfall 6: Images with Baked-In Text

```svelte
<!-- WRONG: Text is part of the image -- cannot be translated -->
<img src="/images/hero-banner.png" alt="Summer Sale - 50% Off!" />

<!-- CORRECT: Overlay text on the image using CSS -->
<div class="hero-banner">
  <img src="/images/hero-background.jpg" alt="" role="presentation" />
  <div class="hero-text">
    <h1>{t('home.hero.title')}</h1>
    <p>{t('home.hero.subtitle')}</p>
  </div>
</div>
```

If you absolutely must use images with text (logo, infographic), maintain separate images per locale:

```ts
const bannerSrc = `/images/hero-banner-${locale}.png`;
```

But this is expensive to maintain. Prefer CSS text overlays whenever possible.

### Pitfall 7: Hardcoded Sorting Assumptions

```ts
// WRONG: Assumes ASCII/English sort order
const sorted = names.sort();

// CORRECT: Use locale-aware collation
const sorted = names.sort(new Intl.Collator(locale).compare);
```

### Pitfall 8: Right-to-Left Assumptions

```css
/* WRONG: Hardcoded directional properties */
.sidebar {
  margin-left: 20px;
  padding-right: 16px;
  text-align: left;
  float: left;
}

/* CORRECT: Use logical properties that respect text direction */
.sidebar {
  margin-inline-start: 20px;
  padding-inline-end: 16px;
  text-align: start;
  float: inline-start;
}
```

CSS logical properties (`inline-start`, `inline-end`, `block-start`, `block-end`) automatically adapt to the text direction. `margin-inline-start` means "left margin in LTR, right margin in RTL." This is the correct approach for any app that might support RTL languages.

## Text Expansion and Layout Strategies

When translations make text longer or shorter, your layout must handle it gracefully. This is one of the hardest practical challenges of i18n.

### CSS Strategies for Flexible Text

```css
/* WRONG: Fixed width that will overflow in German */
.nav-button {
  width: 120px;
}

/* CORRECT: Minimum width with flexibility */
.nav-button {
  min-width: 80px;
  width: auto;
  padding-inline: 16px;
}

/* Handle overflow gracefully */
.card-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Or allow wrapping */
.card-title {
  overflow-wrap: break-word;
  hyphens: auto;
}

/* Flexible grid that adapts to content */
.button-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Use min-content and max-content for intrinsic sizing */
.label {
  width: max-content;
  max-width: 200px;
}
```

### Pseudo-Localization: Testing Without Translations

**Pseudo-localization** is a testing technique where you transform your English strings to simulate the effects of translation without actually translating anything. It is the fastest way to find i18n layout bugs.

A pseudo-localized string typically:
1. Replaces ASCII characters with accented equivalents (`a` → `á`, `e` → `é`)
2. Adds padding characters to simulate text expansion (~40%)
3. Wraps the string in brackets to make untranslated strings obvious

```ts
// Pseudo-localization function
function pseudoLocalize(str: string): string {
  const charMap: Record<string, string> = {
    a: 'á', b: 'β', c: 'ç', d: 'δ', e: 'é', f: 'ƒ',
    g: 'ğ', h: 'ĥ', i: 'í', j: 'ĵ', k: 'ĸ', l: 'ĺ',
    m: 'ɱ', n: 'ñ', o: 'ó', p: 'ρ', q: 'ǫ', r: 'ŕ',
    s: 'š', t: 'ţ', u: 'ú', v: 'ṽ', w: 'ŵ', x: 'χ',
    y: 'ý', z: 'ž',
    A: 'Á', B: 'Β', C: 'Ç', D: 'Δ', E: 'É', F: 'Ƒ',
    G: 'Ğ', H: 'Ĥ', I: 'Í', J: 'Ĵ', K: 'ĸ', L: 'Ĺ',
    M: 'Ṁ', N: 'Ñ', O: 'Ó', P: 'Ρ', Q: 'Ǫ', R: 'Ŕ',
    S: 'Š', T: 'Ţ', U: 'Ú', V: 'Ṽ', W: 'Ŵ', X: 'Χ',
    Y: 'Ý', Z: 'Ž',
  };

  let result = '';
  let insidePlaceholder = false;

  for (const char of str) {
    if (char === '{') insidePlaceholder = true;
    if (char === '}') insidePlaceholder = false;

    if (!insidePlaceholder && charMap[char]) {
      result += charMap[char];
    } else {
      result += char;
    }
  }

  // Add ~40% padding to simulate text expansion
  const padding = '~'.repeat(Math.ceil(str.length * 0.4));
  return `[${result} ${padding}]`;
}

pseudoLocalize("Hello, {name}!");
// "[Ĥéĺĺó, {name}! ~~~~~~~]"

pseudoLocalize("Submit");
// "[Šúβɱíţ ~~~]"

pseudoLocalize("Your cart has {count} items");
// "[Ýóúŕ çáŕţ ĥáš {count} íţéɱš ~~~~~~~~~~~~]"
```

The brackets make it immediately obvious which strings are not going through the i18n system. The accented characters verify that your fonts and rendering handle non-ASCII characters. The padding simulates German-length text expansion. If your layout breaks with pseudo-localization, it will break with real translations.

### CJK Line Breaking

Chinese, Japanese, and Korean have different line-breaking rules than European languages. There are no spaces between words, and breaks can occur between most characters -- but not all. Certain characters cannot start or end a line (punctuation rules called *kinsoku shori* in Japanese).

```css
/* Ensure proper CJK line breaking */
.content {
  word-break: normal;        /* Default -- respects CJK rules */
  overflow-wrap: break-word; /* Break long URLs and strings */
  line-break: auto;          /* Use locale-appropriate line-break rules */
}

/* For mixed CJK and Latin content */
.mixed-content {
  word-break: normal;
  overflow-wrap: anywhere;   /* Allows breaks in long Latin words within CJK text */
}
```

### Setting the Document Language

Always set the `lang` attribute on your HTML element. This affects screen reader pronunciation, hyphenation, spell checking, and browser font selection:

```html
<!-- WRONG: No lang attribute -- assistive tech has to guess -->
<html>

<!-- CORRECT: Language declared -->
<html lang="en">

<!-- CORRECT: Language with region -->
<html lang="pt-BR">

<!-- CORRECT: RTL language with direction -->
<html lang="ar" dir="rtl">
```

The `lang` attribute should update dynamically when the user switches locale. In SvelteKit, you set this in your root layout -- we will cover the exact implementation in lesson 2.

### The `dir` Attribute

For RTL languages, you must set the `dir` attribute:

```html
<!-- LTR languages (default) -->
<html lang="en" dir="ltr">

<!-- RTL languages -->
<html lang="ar" dir="rtl">
<html lang="he" dir="rtl">
<html lang="fa" dir="rtl">
```

When `dir="rtl"` is set, CSS logical properties automatically flip. `margin-inline-start` becomes the right margin, `text-align: start` becomes right-aligned, and flexbox/grid layouts reverse their main axis direction. This is why using logical properties from the start saves enormous refactoring later.

## Designing for i18n From Day One

If you are starting a new project and know (or suspect) it will need multiple languages, here is what to build into your architecture from the beginning:

### The i18n Checklist

```
Architecture:
  ☐ All user-facing strings go through a translation function -- no exceptions
  ☐ Message keys are semantic, not positional (auth.login.submit, not button_1)
  ☐ Message catalogs use ICU MessageFormat for plurals and interpolation
  ☐ Locale is in the URL path (/en/about, /pt-BR/about)
  ☐ Fallback locale chain is configured (pt-BR → pt → en)

Formatting:
  ☐ Dates use Intl.DateTimeFormat, never manual formatting
  ☐ Numbers use Intl.NumberFormat, never toFixed() for display
  ☐ Currency symbols come from Intl, never hardcoded
  ☐ Sort order uses Intl.Collator

Layout:
  ☐ CSS uses logical properties (inline-start, not left)
  ☐ No fixed widths on elements that contain text
  ☐ Flex/grid layouts accommodate text expansion
  ☐ No images with baked-in text
  ☐ The html element has lang and dir attributes

Testing:
  ☐ Pseudo-localization is available as a test locale
  ☐ CI checks for missing translation keys
  ☐ CI checks for unused translation keys
  ☐ Layout is tested at 150% text expansion
```

This checklist may look long, but most items are trivially easy to do from the start and extremely expensive to retrofit later. Using `Intl.DateTimeFormat` instead of manual date formatting is the same amount of code. Using `margin-inline-start` instead of `margin-left` is the same number of characters. Using a `t()` function instead of a hardcoded string is a few extra keystrokes. The cost of i18n-ready code is near zero when you start with it.

## Try It

### Exercise 1: Locale-Aware Formatting

Create a TypeScript function that takes a locale string and displays a "receipt" with a date, a currency amount, and a large number -- all formatted for that locale. Test it with at least four locales: `en-US`, `pt-BR`, `de-DE`, and `ja-JP`.

```ts
function printReceipt(locale: string, currency: string): void {
  const date = new Date('2025-06-15T14:30:00');
  const amount = 1234567.89;
  const quantity = 42;

  // Format the date in a long, readable style
  // Format the amount as currency
  // Format the quantity as a plain number
  // Log all three with labels
}

// Expected output for en-US, USD:
//   Date: June 15, 2025
//   Total: $1,234,567.89
//   Items: 42

// Expected output for pt-BR, BRL:
//   Date: 15 de junho de 2025
//   Total: R$ 1.234.567,89
//   Items: 42

// Expected output for de-DE, EUR:
//   Date: 15. Juni 2025
//   Total: 1.234.567,89 €
//   Items: 42
```

### Exercise 2: Build a Pseudo-Localizer

Take the `pseudoLocalize` function from this lesson and extend it to also handle ICU MessageFormat placeholders correctly. It should not transform text inside `{curly braces}`, and it should not transform ICU keywords like `plural`, `select`, `one`, `other`, etc. Test it with this input:

```ts
const input = "{count, plural, =0 {No items} one {1 item} other {{count} items}}";
// The ICU structure and keywords should be preserved
// Only the translatable text inside should be pseudo-localized
```

### Exercise 3: Build a Message Catalog Validator

Write a TypeScript function that takes two message catalogs (source and target) and returns a report of:
- Keys present in the source but missing from the target (untranslated strings)
- Keys present in the target but missing from the source (orphaned translations)
- Keys where the source has `{placeholders}` that are missing from the target (broken interpolation)

```ts
type Catalog = Record<string, string>;

interface ValidationReport {
  missingKeys: string[];
  orphanedKeys: string[];
  missingPlaceholders: { key: string; missing: string[] }[];
}

function validateCatalog(source: Catalog, target: Catalog): ValidationReport {
  // Your implementation here
}

// Test with:
const en: Catalog = {
  'greeting': 'Hello, {name}!',
  'items': '{count} items',
  'checkout': 'Proceed to checkout',
};

const ptBR: Catalog = {
  'greeting': 'Olá, {name}!',
  'items': '{count} itens',
  'oldKey': 'This key no longer exists in source',
  // 'checkout' is missing
};
```

Expected output:
```json
{
  "missingKeys": ["checkout"],
  "orphanedKeys": ["oldKey"],
  "missingPlaceholders": []
}
```

## Key Takeaways

- **i18n is architecture, l10n is content** -- you must internationalize your code before translators can localize it, and retrofitting is orders of magnitude more expensive than designing it in from the start
- **BCP 47 locale codes** (`en-US`, `pt-BR`, `zh-Hans-CN`) identify not just language but script and region, and the region affects number formatting, date formatting, currency, sort order, and text direction
- **Message catalogs** map semantic keys (`auth.login.submit`) to translatable strings -- never use positional keys (`button_1`) because translators need context
- **ICU MessageFormat** is the industry standard for handling interpolation (`{name}`), pluralization (`{count, plural, ...}`), and gender selection (`{gender, select, ...}`) -- it exists because human language is far more complex than English singular/plural
- **Naive pluralization is always wrong** -- English has 2 plural forms, but Russian has 4, Arabic has 6, and Japanese has 0; only ICU plural rules with Unicode CLDR data handle this correctly
- **String concatenation destroys translatability** -- every translatable string must be a complete sentence or phrase with placeholders, because word order varies wildly across languages
- **URL-based locale detection** (`/en/about`, `/pt-BR/about`) is the gold standard because it gives each locale a unique, crawlable, sharable URL; cookie-based and header-based detection supplement it but do not replace it
- **The `t()` function pattern** (key lookup + parameter interpolation) is universal across all i18n libraries -- understanding it from scratch helps you evaluate and use any library effectively
- **Never hardcode date, number, or currency formats** -- use `Intl.DateTimeFormat`, `Intl.NumberFormat`, and `Intl.Collator` with the user's locale
- **Text expansion breaks layouts** -- German is 30-40% longer than English, and CJK may be shorter; use flexible CSS (`min-width`, `flex-wrap`, logical properties) and test with pseudo-localization
- **CSS logical properties** (`margin-inline-start`, not `margin-left`) automatically adapt to RTL languages and cost nothing extra when used from the start
- **Pseudo-localization** catches i18n bugs without real translations -- accented characters test rendering, padding tests layout expansion, and brackets reveal untranslated strings
- **HTML in translations is an XSS vector** -- use placeholders for markup and control the HTML in your components, not in your message catalogs
- **Set `lang` and `dir` on the `<html>` element** -- it affects screen reader pronunciation, browser hyphenation, spell checking, and CSS logical property behavior
