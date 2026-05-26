# SvelteKit i18n with Paraglide

In the previous lesson you learned the foundations of internationalization: Unicode, locale identifiers, ICU MessageFormat, and how locale detection works. Those are the universal concepts. Now you need to turn them into working code inside a SvelteKit application.

This lesson covers the full implementation: choosing a library, setting it up, writing messages, routing by locale, building a language switcher, handling server-side rendering, and wiring up SEO tags. By the end, you will have every piece you need to ship a multilingual SvelteKit app to production.

## Why Paraglide

The SvelteKit ecosystem has several i18n libraries. Before committing to one, you need to understand the tradeoffs.

**svelte-i18n** was the first widely adopted option. It uses a runtime store to hold translations and resolves message keys at runtime with a `$t('key')` function. It works, but it ships the entire translation dictionary to the client (even messages used only on one page), offers no compile-time validation of message keys (a typo like `$t('welcom')` silently renders nothing), and adds runtime overhead on every render.

**typesafe-i18n** improved on this by generating TypeScript types from your message files, so typos become compile errors. But it still resolves messages at runtime, requires a watcher process during development, and has a non-trivial setup.

**Paraglide** (by Inlang) takes a fundamentally different approach: it is a **compiler**. Your message files are the source of truth, and Paraglide compiles them into plain TypeScript functions at build time. Each message becomes a function. If you call `m.hello({ name: "World" })`, the compiler has already generated a function that returns the correct string for the current locale. This design has three major consequences:

1. **Tree-shaking**: If a message is not imported anywhere, it is not in your bundle. A page that uses 5 messages ships only those 5 messages, not the entire dictionary. On large apps with hundreds of messages, this can cut kilobytes from each route's bundle.

2. **Type safety**: Every message key and every parameter is a TypeScript type. Call `m.hello()` without the required `name` parameter and the compiler rejects it. Misspell `m.helo()` and you get a red squiggle immediately. No runtime surprises.

3. **Zero runtime overhead**: There is no runtime lookup table, no reactive store resolving keys, no formatting engine running in the browser. The generated function directly returns the string. It is as fast as a hardcoded string concatenation.

Paraglide also has a first-class SvelteKit adapter (`paraglide-sveltekit`) that handles locale routing, link rewriting, server-side locale detection, and SEO tags. This tight integration is why the Svelte team recommends Paraglide for SvelteKit projects.

For the rest of this lesson, we use Paraglide exclusively.

## Installation and Setup

### Step 1: Initialize Paraglide

In an existing SvelteKit project, run the initialization command:

```bash
npx @inlang/paraglide-js init
```

This creates a `project.inlang/settings.json` file and a `messages/` directory in your project root. It also installs `@inlang/paraglide-js` as a dev dependency.

### Step 2: Install the SvelteKit Adapter

The adapter wires Paraglide into SvelteKit's routing, hooks, and link handling:

```bash
npm install @inlang/paraglide-sveltekit
```

### Step 3: Configure the Inlang Project

Open `project.inlang/settings.json` and configure your source language and target languages. For our example, English is the source and Brazilian Portuguese is the target:

```json
{
  "$schema": "https://inlang.com/schema/project-settings",
  "sourceLanguageTag": "en",
  "languageTags": ["en", "pt-BR"],
  "modules": [
    "https://cdn.jsdelivr.net/npm/@inlang/message-lint-rule-empty-pattern@latest/dist/index.js",
    "https://cdn.jsdelivr.net/npm/@inlang/message-lint-rule-missing-translation@latest/dist/index.js",
    "https://cdn.jsdelivr.net/npm/@inlang/message-lint-rule-without-source@latest/dist/index.js",
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@latest/dist/index.js",
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-m-function-matcher@latest/dist/index.js"
  ],
  "plugin.inlang.messageFormat": {
    "pathPattern": "./messages/{languageTag}.json"
  }
}
```

The `modules` array includes lint rules that catch common mistakes: empty translations, missing translations for a language, and orphan messages that exist in a target language but not in the source. The `pathPattern` tells Paraglide where to find message files.

### Step 4: Configure Vite

Add the Paraglide plugin to your Vite configuration so messages are compiled on every build and during development:

```typescript
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { paraglide } from '@inlang/paraglide-sveltekit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    paraglide({
      project: './project.inlang',
      outdir: './src/lib/paraglide'
    }),
    sveltekit()
  ]
});
```

The `outdir` is where Paraglide writes the generated TypeScript files. You should add this directory to `.gitignore` because it is a build artifact (though some teams prefer to commit it for CI simplicity).

### Step 5: Wire Up the SvelteKit Hooks

Create or update `src/hooks.js` (or `src/hooks.ts`) to set up the reroute hook, and update `src/hooks.server.ts` for server-side locale handling:

```typescript
// src/hooks.ts
import { reroute } from '@inlang/paraglide-sveltekit';
import type { Reroute } from '@sveltejs/kit';

export const handleReroute: Reroute = reroute();
```

```typescript
// src/hooks.server.ts
import { handle } from '@inlang/paraglide-sveltekit';
import type { Handle } from '@sveltejs/kit';

export const handleI18n: Handle = handle();

// If you have other handle functions, sequence them:
import { sequence } from '@sveltejs/kit/hooks';
import { handleAuth } from './auth';

export const handle: Handle = sequence(handleI18n, handleAuth);
```

### Step 6: Wrap Your App with ParaglideJS

In your root layout, wrap the content with the `<ParaglideJS>` component. This component provides the locale context and enables automatic link rewriting:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { ParaglideJS } from '@inlang/paraglide-sveltekit';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<ParaglideJS>
  {@render children()}
</ParaglideJS>
```

After these steps, run `npm run dev`. Paraglide compiles your messages (even if there are none yet) and generates the TypeScript files in `src/lib/paraglide/`.

### Project Structure After Setup

```
my-sveltekit-app/
  project.inlang/
    settings.json          # Inlang project configuration
  messages/
    en.json                # English messages (source language)
    pt-BR.json             # Portuguese messages (target language)
  src/
    hooks.ts               # Reroute hook for locale prefix
    hooks.server.ts        # Server handle hook for locale detection
    lib/
      paraglide/           # Generated by Paraglide (add to .gitignore)
        messages.ts         # Compiled message functions
        runtime.ts          # Runtime helpers (languageTag, etc.)
    routes/
      +layout.svelte       # Root layout with <ParaglideJS>
```

## Message Files

Messages live in JSON files under the `messages/` directory. Each language gets its own file.

### Basic Messages

```json
// messages/en.json
{
  "app_title": "TeamBoard",
  "nav_home": "Home",
  "nav_dashboard": "Dashboard",
  "nav_settings": "Settings",
  "welcome_heading": "Welcome to TeamBoard",
  "welcome_description": "Manage your projects and collaborate with your team."
}
```

```json
// messages/pt-BR.json
{
  "app_title": "TeamBoard",
  "nav_home": "Inicio",
  "nav_dashboard": "Painel",
  "nav_settings": "Configuracoes",
  "welcome_heading": "Bem-vindo ao TeamBoard",
  "welcome_description": "Gerencie seus projetos e colabore com sua equipe."
}
```

### Key Naming Conventions

Use flat keys with underscores or dots to namespace by feature or page. Paraglide uses flat JSON by default (not nested objects):

```json
{
  "auth_login_title": "Sign In",
  "auth_login_email_label": "Email Address",
  "auth_login_password_label": "Password",
  "auth_login_submit": "Sign In",
  "auth_login_forgot_password": "Forgot your password?",
  "auth_signup_title": "Create Account",
  "auth_signup_submit": "Create Account",

  "dashboard_heading": "Your Dashboard",
  "dashboard_no_projects": "You have no projects yet.",
  "dashboard_create_first": "Create your first project"
}
```

The prefix convention (`auth_login_`, `dashboard_`) makes it easy to find messages related to a feature and keeps the flat namespace organized. Some teams prefer dot-separated keys (`auth.login.title`). Either works as long as the team is consistent.

### Parametric Messages

Messages that include dynamic values use curly brace placeholders:

```json
// messages/en.json
{
  "greeting": "Hello, {name}!",
  "items_in_cart": "You have {count} items in your cart.",
  "last_login": "Last login: {date}",
  "created_by": "Created by {author} on {date}"
}
```

```json
// messages/pt-BR.json
{
  "greeting": "Ola, {name}!",
  "items_in_cart": "Voce tem {count} itens no carrinho.",
  "last_login": "Ultimo acesso: {date}",
  "created_by": "Criado por {author} em {date}"
}
```

Parameters become required function arguments in the compiled output. If `greeting` has a `{name}` placeholder, calling `m.greeting()` without the `name` parameter is a TypeScript error.

### What Paraglide Compiles

When you write a message like `"greeting": "Hello, {name}!"`, Paraglide generates a TypeScript function:

```typescript
// Generated in src/lib/paraglide/messages.ts (simplified)
export function greeting(params: { name: string }): string {
  // Implementation depends on current locale
  // For "en": returns `Hello, ${params.name}!`
  // For "pt-BR": returns `Ola, ${params.name}!`
}
```

This is a regular function call. There is no runtime dictionary lookup, no reactive store subscription, no formatting engine parsing a pattern. The compiler has already done the work. The function returns a string. That is it.

## Using Messages in Components

Import all messages as a namespace and call them as functions:

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  import * as m from '$lib/paraglide/messages';
</script>

<h1>{m.welcome_heading()}</h1>
<p>{m.welcome_description()}</p>
<p>{m.greeting({ name: "Maria" })}</p>
```

### WRONG: Hardcoded Strings

This is the pattern you are replacing. Every hardcoded string is a translation debt:

```svelte
<!-- WRONG: Hardcoded strings scattered across components -->
<script lang="ts">
  let { data } = $props();
</script>

<nav>
  <a href="/">Home</a>
  <a href="/dashboard">Dashboard</a>
  <a href="/settings">Settings</a>
</nav>

<h1>Welcome to TeamBoard</h1>
<p>Manage your projects and collaborate with your team.</p>

{#if data.user}
  <p>Hello, {data.user.name}!</p>
{:else}
  <p>Please sign in to continue.</p>
{/if}
```

### CORRECT: Message Functions Everywhere

Every user-facing string comes from a message function. The component reads like a template with clear semantic labels:

```svelte
<!-- CORRECT: All user-facing text from message functions -->
<script lang="ts">
  import * as m from '$lib/paraglide/messages';

  let { data } = $props();
</script>

<nav>
  <a href="/">{m.nav_home()}</a>
  <a href="/dashboard">{m.nav_dashboard()}</a>
  <a href="/settings">{m.nav_settings()}</a>
</nav>

<h1>{m.welcome_heading()}</h1>
<p>{m.welcome_description()}</p>

{#if data.user}
  <p>{m.greeting({ name: data.user.name })}</p>
{:else}
  <p>{m.auth_please_sign_in()}</p>
{/if}
```

### WRONG: String Concatenation for Dynamic Content

Do not build translated strings by concatenating pieces. Word order differs between languages:

```svelte
<!-- WRONG: Concatenation breaks in other languages -->
<p>{"Created by " + data.author + " on " + data.date}</p>
<!-- English: "Created by Maria on Jan 5" -->
<!-- Portuguese needs: "Criado por Maria em 5 de jan" — different word order -->
```

### CORRECT: Parametric Messages

Let the message define the structure. Each language controls word order:

```svelte
<!-- CORRECT: Parameters let each language control word order -->
<p>{m.created_by({ author: data.author, date: data.date })}</p>
<!-- English message: "Created by {author} on {date}" -->
<!-- Portuguese message: "Criado por {author} em {date}" -->
```

### Messages in Reactive Contexts

Message functions work naturally with Svelte 5 reactivity. When the locale changes, components re-render and call the message functions again, which return the new locale's strings:

```svelte
<script lang="ts">
  import * as m from '$lib/paraglide/messages';

  let count = $state(0);
  let cartMessage = $derived(m.items_in_cart({ count: String(count) }));
</script>

<p>{cartMessage}</p>
<button onclick={() => count++}>Add item</button>
```

## Locale Routing

Users need a way to access your app in different languages, and search engines need distinct URLs for each language. Paraglide-SvelteKit handles this with locale-prefixed URLs.

### How It Works

By default, Paraglide-SvelteKit prefixes all routes with the locale:

```
/en/about          -> English about page
/pt-BR/about       -> Portuguese about page
/en/dashboard      -> English dashboard
/pt-BR/dashboard   -> Portuguese dashboard
```

The source language (English in our case) can optionally omit the prefix, so `/about` serves the English version while `/pt-BR/about` serves Portuguese. This is the default behavior and is typically what you want -- your existing URLs continue to work for the default language.

### The Reroute Hook

The reroute hook (configured in Step 5 above) strips the locale prefix before SvelteKit's router sees the URL. From SvelteKit's perspective, `/pt-BR/about` and `/about` both route to `src/routes/about/+page.svelte`. Paraglide sets the locale internally so message functions return the correct language.

This means you do not need `[locale]` route parameters in your file structure:

```
src/routes/
  about/
    +page.svelte         # Serves both /en/about and /pt-BR/about
  dashboard/
    +page.svelte         # Serves both /en/dashboard and /pt-BR/dashboard
  +layout.svelte
  +page.svelte
```

### WRONG: Manual [locale] Route Parameters

Some older i18n approaches require wrapping your entire route tree in a `[locale]` parameter. This pollutes every `load` function with locale handling, forces you to validate the locale parameter everywhere, and breaks if you forget to include it in a link:

```
<!-- WRONG: Manual locale parameter in route structure -->
src/routes/
  [locale]/
    about/
      +page.svelte
    dashboard/
      +page.svelte
    +layout.svelte
    +page.svelte
```

```typescript
// WRONG: Every load function must handle the locale parameter
// src/routes/[locale]/about/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const locale = params.locale;

  // Must validate the locale manually
  if (!['en', 'pt-BR'].includes(locale)) {
    throw error(404, 'Invalid locale');
  }

  // Must pass locale to every function that needs it
  const content = await getAboutContent(locale);
  return { content };
};
```

### CORRECT: Paraglide-SvelteKit Built-in Routing

Paraglide-SvelteKit handles everything through its hooks. Your route structure stays clean, and the current locale is available anywhere via the `languageTag()` function:

```typescript
// CORRECT: Clean load function, locale available via Paraglide
// src/routes/about/+page.server.ts
import type { PageServerLoad } from './$types';
import { languageTag } from '$lib/paraglide/runtime';

export const load: PageServerLoad = async () => {
  const content = await getAboutContent(languageTag());
  return { content };
};
```

### Automatic Link Rewriting

The `<ParaglideJS>` wrapper component automatically rewrites all `<a>` tags to include the current locale prefix. You write plain links, and Paraglide adds the locale:

```svelte
<!-- You write: -->
<a href="/about">About</a>

<!-- When the locale is "pt-BR", Paraglide renders: -->
<a href="/pt-BR/about">About</a>

<!-- When the locale is "en" (source language), no prefix is added: -->
<a href="/about">About</a>
```

This means you never hardcode locale prefixes in your links. Write all `href` values without a locale, and Paraglide handles the rest.

### WRONG: Manually Prefixing Locale in Links

```svelte
<!-- WRONG: Hardcoded locale prefix -->
<a href="/pt-BR/about">{m.nav_about()}</a>

<!-- WRONG: Manually constructing locale prefix -->
<script lang="ts">
  import { languageTag } from '$lib/paraglide/runtime';
</script>
<a href="/{languageTag()}/about">{m.nav_about()}</a>
```

### CORRECT: Plain Links Inside ParaglideJS

```svelte
<!-- CORRECT: Plain href, ParaglideJS handles the prefix -->
<a href="/about">{m.nav_about()}</a>
```

### Programmatic Navigation

When navigating programmatically with `goto()`, you also write plain paths. Paraglide intercepts the navigation and adds the locale prefix:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';

  function handleSubmit() {
    // Paraglide adds the locale prefix automatically
    goto('/dashboard');
  }
</script>
```

## Language Switcher Component

Users need a way to change languages. A language switcher navigates to the same page in a different locale.

### Building the Switcher

Paraglide provides `availableLanguageTags` (the list of all configured languages) and `languageTag()` (the current language). To switch languages, you navigate to the current path with a different locale prefix. Paraglide-SvelteKit provides the `i18n` helper for building alternate-language URLs:

```svelte
<!-- src/lib/components/LanguageSwitcher.svelte -->
<script lang="ts">
  import { availableLanguageTags, languageTag } from '$lib/paraglide/runtime';
  import { page } from '$app/state';

  const languageNames: Record<string, string> = {
    en: 'English',
    'pt-BR': 'Portugues (Brasil)'
  };

  // Build the alternate URL for a given locale.
  // Paraglide-SvelteKit provides a route() helper,
  // but you can also construct it manually:
  function getLocaleUrl(locale: string): string {
    const currentPath = page.url.pathname;

    // Remove existing locale prefix if present
    let cleanPath = currentPath;
    for (const tag of availableLanguageTags) {
      if (currentPath.startsWith(`/${tag}/`) || currentPath === `/${tag}`) {
        cleanPath = currentPath.slice(`/${tag}`.length) || '/';
        break;
      }
    }

    // Add the new locale prefix (skip for source language)
    const prefix = locale === 'en' ? '' : `/${locale}`;
    const newPath = prefix + cleanPath;

    // Preserve search params and hash
    const search = page.url.search;
    const hash = page.url.hash;
    return newPath + search + hash;
  }
</script>

<div class="language-switcher">
  <label for="language-select">
    {languageNames[languageTag()] ?? languageTag()}
  </label>

  <ul role="listbox" id="language-select">
    {#each availableLanguageTags as locale}
      <li>
        <a
          href={getLocaleUrl(locale)}
          hreflang={locale}
          aria-current={locale === languageTag() ? 'true' : undefined}
          data-sveltekit-preload-data="tap"
        >
          {languageNames[locale] ?? locale}
        </a>
      </li>
    {/each}
  </ul>
</div>
```

### Key Details in the Switcher

**Preserving search params and hash**: If a user is on `/pt-BR/search?q=svelte#results` and switches to English, they should land on `/search?q=svelte#results`, not just `/search`. The switcher must carry over `page.url.search` and `page.url.hash`.

**Using `<a>` tags, not `goto()`**: The language switch is a navigation to a different URL. Using an `<a>` tag means it works without JavaScript (progressive enhancement), it can be preloaded on hover, and search engine crawlers can follow the links.

**`hreflang` on switcher links**: Adding `hreflang` to each link tells browsers and assistive technologies what language the target page is in.

**`aria-current` on the active language**: Screen readers announce "current" when a user focuses the active language, helping users understand which language is already selected.

### Dropdown Variant with Svelte 5

For a compact dropdown instead of a list:

```svelte
<!-- src/lib/components/LanguageDropdown.svelte -->
<script lang="ts">
  import { availableLanguageTags, languageTag } from '$lib/paraglide/runtime';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  const languageNames: Record<string, string> = {
    en: 'English',
    'pt-BR': 'Portugues (Brasil)'
  };

  let open = $state(false);

  function switchLocale(locale: string) {
    const currentPath = page.url.pathname;
    let cleanPath = currentPath;
    for (const tag of availableLanguageTags) {
      if (currentPath.startsWith(`/${tag}/`) || currentPath === `/${tag}`) {
        cleanPath = currentPath.slice(`/${tag}`.length) || '/';
        break;
      }
    }
    const prefix = locale === 'en' ? '' : `/${locale}`;
    goto(prefix + cleanPath + page.url.search + page.url.hash);
    open = false;
  }
</script>

<div class="locale-dropdown" class:open>
  <button
    onclick={() => open = !open}
    aria-expanded={open}
    aria-haspopup="listbox"
  >
    {languageNames[languageTag()]}
  </button>

  {#if open}
    <ul role="listbox">
      {#each availableLanguageTags as locale}
        <li role="option" aria-selected={locale === languageTag()}>
          <button onclick={() => switchLocale(locale)}>
            {languageNames[locale]}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
```

## SEO and hreflang

Search engines need to know that `/about` and `/pt-BR/about` are the same page in different languages. Without this signal, Google may treat them as duplicate content and penalize your rankings, or it may serve the wrong language to users.

### hreflang Link Tags

Add `<link rel="alternate">` tags for every locale in the `<head>` of every page. This tells search engines: "this page exists in these languages, and here are the URLs."

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { ParaglideJS } from '@inlang/paraglide-sveltekit';
  import { availableLanguageTags, languageTag } from '$lib/paraglide/runtime';
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  function getAlternateUrl(locale: string): string {
    const origin = page.url.origin;
    const pathname = page.url.pathname;

    // Strip existing locale prefix
    let cleanPath = pathname;
    for (const tag of availableLanguageTags) {
      if (pathname.startsWith(`/${tag}/`) || pathname === `/${tag}`) {
        cleanPath = pathname.slice(`/${tag}`.length) || '/';
        break;
      }
    }

    // Build the localized URL
    const prefix = locale === 'en' ? '' : `/${locale}`;
    return origin + prefix + cleanPath;
  }

  let alternates = $derived(
    availableLanguageTags.map((locale) => ({
      locale,
      url: getAlternateUrl(locale)
    }))
  );

  let canonicalUrl = $derived(getAlternateUrl(languageTag()));
</script>

<svelte:head>
  <!-- Canonical URL for this locale's version of the page -->
  <link rel="canonical" href={canonicalUrl} />

  <!-- Alternate language versions -->
  {#each alternates as { locale, url }}
    <link rel="alternate" hreflang={locale} href={url} />
  {/each}

  <!-- x-default for language negotiation fallback -->
  <link rel="alternate" hreflang="x-default" href={getAlternateUrl('en')} />

  <!-- HTML lang attribute -->
  <!-- Note: ParaglideJS sets this automatically, but shown here for clarity -->

  <!-- Open Graph locale tags -->
  <meta property="og:locale" content={languageTag().replace('-', '_')} />
  {#each availableLanguageTags.filter(l => l !== languageTag()) as altLocale}
    <meta property="og:locale:alternate" content={altLocale.replace('-', '_')} />
  {/each}
</svelte:head>

<ParaglideJS>
  {@render children()}
</ParaglideJS>
```

### What Each Tag Does

**`<link rel="canonical">`** tells search engines which URL is the "official" version of this content for this language. Without it, Google might index `/about`, `/en/about`, and `/about?ref=nav` as three separate pages.

**`<link rel="alternate" hreflang="pt-BR">`** tells Google: "a Portuguese version of this page exists at this URL." Google uses these to serve the right language in search results based on the user's locale and language preferences.

**`<link rel="alternate" hreflang="x-default">`** is the fallback. When no hreflang matches the user's language, Google serves this URL. Typically it points to your source language or a language-selection page.

**`<meta property="og:locale">`** tells social platforms (Facebook, LinkedIn) what language the shared page is in, so the preview card renders correctly. Note the format difference: hreflang uses `pt-BR` but Open Graph uses `pt_BR` (underscore).

### The html lang Attribute

The `<ParaglideJS>` component automatically sets the `lang` attribute on the `<html>` element. This is critical for accessibility: screen readers use it to select the correct pronunciation engine. A Portuguese page with `lang="en"` will be read with English phonetics, making it incomprehensible.

You can verify this is working by inspecting the `<html>` element in your browser's dev tools. When you switch to Portuguese, it should show `<html lang="pt-BR">`.

## Server-Side Messages

Paraglide messages are not limited to Svelte components. You can use them in any server-side code: `load` functions, form actions, API routes, and even email templates.

### In Load Functions

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';
import * as m from '$lib/paraglide/messages';
import { languageTag } from '$lib/paraglide/runtime';

export const load: PageServerLoad = async ({ locals }) => {
  const projects = await db.getProjectsByUser(locals.user.id);

  return {
    projects,
    // The page title is locale-aware
    title: m.dashboard_heading(),
    // You can also use languageTag() to format dates server-side
    formattedDate: new Intl.DateTimeFormat(languageTag(), {
      dateStyle: 'long'
    }).format(new Date())
  };
};
```

### In Form Actions

Validation error messages should be in the user's language:

```typescript
// src/routes/settings/+page.server.ts
import type { Actions } from './$types';
import { fail } from '@sveltejs/kit';
import * as m from '$lib/paraglide/messages';

export const actions: Actions = {
  updateProfile: async ({ request }) => {
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const bio = formData.get('bio') as string;

    const errors: Record<string, string> = {};

    if (!name?.trim()) {
      errors.name = m.validation_required_field({ field: m.field_name() });
    } else if (name.length > 100) {
      errors.name = m.validation_max_length({ field: m.field_name(), max: '100' });
    }

    if (bio && bio.length > 500) {
      errors.bio = m.validation_max_length({ field: m.field_bio(), max: '500' });
    }

    if (Object.keys(errors).length > 0) {
      return fail(400, { errors, values: { name, bio } });
    }

    await db.updateUser(name, bio);
    return { success: true, message: m.settings_profile_updated() };
  }
};
```

The corresponding messages:

```json
// messages/en.json
{
  "validation_required_field": "{field} is required.",
  "validation_max_length": "{field} must be at most {max} characters.",
  "field_name": "Name",
  "field_bio": "Bio",
  "settings_profile_updated": "Profile updated successfully."
}
```

```json
// messages/pt-BR.json
{
  "validation_required_field": "{field} e obrigatorio.",
  "validation_max_length": "{field} deve ter no maximo {max} caracteres.",
  "field_name": "Nome",
  "field_bio": "Biografia",
  "settings_profile_updated": "Perfil atualizado com sucesso."
}
```

### In API Routes

```typescript
// src/routes/api/export/+server.ts
import type { RequestHandler } from './$types';
import * as m from '$lib/paraglide/messages';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return new Response(
      JSON.stringify({ error: m.auth_unauthorized() }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const data = await generateExport(locals.user.id);
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' }
  });
};
```

### WRONG: Hardcoded English Error Messages on the Server

```typescript
// WRONG: English-only error messages
export const actions: Actions = {
  updateProfile: async ({ request }) => {
    const formData = await request.formData();
    const name = formData.get('name') as string;

    if (!name?.trim()) {
      // This is always English, even for Portuguese users
      return fail(400, { errors: { name: 'Name is required.' } });
    }
  }
};
```

### CORRECT: Locale-Aware Server Messages

```typescript
// CORRECT: Messages respect the current locale
import * as m from '$lib/paraglide/messages';

export const actions: Actions = {
  updateProfile: async ({ request }) => {
    const formData = await request.formData();
    const name = formData.get('name') as string;

    if (!name?.trim()) {
      // Returns "Name is required." in English, "Nome e obrigatorio." in Portuguese
      return fail(400, {
        errors: { name: m.validation_required_field({ field: m.field_name() }) }
      });
    }
  }
};
```

## Pluralization in Practice

In lesson 1 you learned that different languages have different plural rules. English has two forms (one, other). Portuguese also has two but treats zero differently in some dialects. Russian has three (one, few, many). Arabic has six (zero, one, two, few, many, other). Paraglide handles pluralization through ICU MessageFormat syntax in message files.

### English and Portuguese (one/other)

```json
// messages/en.json
{
  "task_count": "{count, plural, one {# task} other {# tasks}}",
  "member_count": "{count, plural, one {# member} other {# members}}",
  "days_remaining": "{count, plural, one {# day remaining} other {# days remaining}}"
}
```

```json
// messages/pt-BR.json
{
  "task_count": "{count, plural, one {# tarefa} other {# tarefas}}",
  "member_count": "{count, plural, one {# membro} other {# membros}}",
  "days_remaining": "{count, plural, one {# dia restante} other {# dias restantes}}"
}
```

Usage in a component:

```svelte
<script lang="ts">
  import * as m from '$lib/paraglide/messages';

  let { data } = $props();
</script>

<p>{m.task_count({ count: data.tasks.length })}</p>
<!-- English: "1 task" / "5 tasks" -->
<!-- Portuguese: "1 tarefa" / "5 tarefas" -->

<p>{m.member_count({ count: data.team.members.length })}</p>
<!-- English: "1 member" / "3 members" -->
<!-- Portuguese: "1 membro" / "3 membros" -->
```

### Russian (one/few/many/other)

Russian plurals depend on the last two digits of the number. "1 task" uses the `one` form. "2 tasks", "3 tasks", "4 tasks" use `few`. "5 tasks" through "20 tasks" use `many`. "21 tasks" goes back to `one`. This is not something you can fake with simple `count === 1` checks.

```json
// messages/ru.json
{
  "task_count": "{count, plural, one {# задача} few {# задачи} many {# задач} other {# задач}}",
  "member_count": "{count, plural, one {# участник} few {# участника} many {# участников} other {# участников}}"
}
```

Results:

| count | Russian output |
|-------|---------------|
| 1 | 1 задача |
| 2 | 2 задачи |
| 5 | 5 задач |
| 21 | 21 задача |
| 22 | 22 задачи |
| 100 | 100 задач |

### Arabic (zero/one/two/few/many/other)

Arabic has the most plural categories of any commonly supported language. Each form has distinct grammar:

```json
// messages/ar.json
{
  "task_count": "{count, plural, zero {لا مهام} one {مهمة واحدة} two {مهمتان} few {# مهام} many {# مهمة} other {# مهمة}}"
}
```

### WRONG: Manual Pluralization Logic

Do not try to handle pluralization with JavaScript conditionals. It works for English and breaks for every other language:

```svelte
<!-- WRONG: Manual pluralization — breaks in Russian, Arabic, etc. -->
<script lang="ts">
  let { count } = $props();
</script>

<p>
  {count} {count === 1 ? 'task' : 'tasks'}
</p>
```

### CORRECT: ICU Plural Rules in Messages

```svelte
<!-- CORRECT: ICU plural rules handle every language correctly -->
<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  let { count } = $props();
</script>

<p>{m.task_count({ count })}</p>
```

The ICU plural rules are defined by the Unicode CLDR (Common Locale Data Repository). You do not need to know the rules for each language. You write the plural forms, and the ICU implementation selects the correct form based on the number and the locale. Paraglide includes the CLDR plural rules for all supported locales.

### Select Messages (Gender and Categories)

ICU MessageFormat also supports `select` for gender and other categorical choices:

```json
// messages/en.json
{
  "user_invited": "{gender, select, male {{name} joined. He is ready.} female {{name} joined. She is ready.} other {{name} joined. They are ready.}}"
}
```

```json
// messages/pt-BR.json
{
  "user_invited": "{gender, select, male {{name} entrou. Ele esta pronto.} female {{name} entrou. Ela esta pronta.} other {{name} entrou.}}"
}
```

```svelte
<p>{m.user_invited({ name: user.name, gender: user.gender })}</p>
```

## Type Safety

Paraglide's compiler-based approach means TypeScript knows about every message key and every parameter at compile time. This section shows what that looks like in practice and why it matters.

### Compile-Time Key Validation

When Paraglide compiles your messages, it generates a TypeScript module where every message key becomes a named export. If you try to use a key that does not exist, TypeScript catches it immediately:

```typescript
import * as m from '$lib/paraglide/messages';

// These work — the keys exist in your message files:
m.welcome_heading();     // OK
m.greeting({ name: "Maria" }); // OK

// These fail at compile time:
m.welcom_heading();      // Error: Property 'welcom_heading' does not exist
m.greting({ name: "Maria" }); // Error: Property 'greting' does not exist
m.nonexistent_key();     // Error: Property 'nonexistent_key' does not exist
```

With a runtime i18n library, `$t('welcom_heading')` silently returns an empty string or the key itself. You discover the bug only when a user reports a broken page. With Paraglide, your CI pipeline catches it before the code is merged.

### Parameter Type Enforcement

Parameters are also typed. If a message expects a `name` parameter, you must provide it:

```typescript
// Message: "greeting": "Hello, {name}!"
m.greeting({ name: "Maria" }); // OK
m.greeting();                  // Error: Expected 1 arguments, but got 0
m.greeting({});                // Error: Property 'name' is missing
m.greeting({ nome: "Maria" }); // Error: 'nome' does not exist, did you mean 'name'?
```

This catches not only missing parameters but also misspelled parameter names. TypeScript's suggestion engine even offers corrections.

### Autocomplete in Your Editor

Because messages are typed exports, your editor's autocomplete lists every available message when you type `m.`:

```
m.                    // Autocomplete shows:
  app_title           // "TeamBoard"
  nav_home            // "Home"
  nav_dashboard       // "Dashboard"
  greeting            // (params: { name: string }) => string
  task_count          // (params: { count: number }) => string
  ...
```

This eliminates the need to keep a separate spreadsheet of message keys or to search through JSON files. Your editor is the source of truth.

### WRONG: Stringly-Typed Message Keys

Runtime i18n libraries use string keys with no compile-time validation:

```svelte
<!-- WRONG: String keys — typos are silent failures -->
<script>
  import { t } from 'svelte-i18n';
</script>

<h1>{$t('welcome_headng')}</h1>
<!-- No error. Renders empty string or "welcome_headng". -->
<!-- You won't know until a user reports it. -->
```

### CORRECT: Typed Function Calls

```svelte
<!-- CORRECT: Function calls — typos are compile errors -->
<script lang="ts">
  import * as m from '$lib/paraglide/messages';
</script>

<h1>{m.welcome_headng()}</h1>
<!-- ^^^^^^^^^^^^^^^^ Error: Property 'welcome_headng' does not exist.
     Did you mean 'welcome_heading'? -->
```

### Refactoring Safety

When you rename a message key (say, from `nav_home` to `navigation_home`), you rename it in the JSON files and Paraglide regenerates the TypeScript. Every component that imports the old key immediately shows a compile error. You find and fix every reference in seconds, with confidence that you did not miss one.

With a string-based library, renaming `nav_home` to `navigation_home` leaves every `$t('nav_home')` call silently broken. You must grep the entire codebase and hope you caught them all.

## Handling Number, Date, and Currency Formatting

Paraglide focuses on message translation. For formatting numbers, dates, and currencies, use the browser's built-in `Intl` APIs with the current locale:

```svelte
<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { languageTag } from '$lib/paraglide/runtime';

  let { data } = $props();

  let formattedPrice = $derived(
    new Intl.NumberFormat(languageTag(), {
      style: 'currency',
      currency: 'USD'
    }).format(data.price)
  );

  let formattedDate = $derived(
    new Intl.DateTimeFormat(languageTag(), {
      dateStyle: 'long',
      timeStyle: 'short'
    }).format(new Date(data.createdAt))
  );

  let formattedNumber = $derived(
    new Intl.NumberFormat(languageTag()).format(data.memberCount)
  );
</script>

<p>{m.price_label()}: {formattedPrice}</p>
<!-- English: "Price: $29.99" -->
<!-- Portuguese: "Price: US$ 29,99" (note comma as decimal separator) -->

<p>{m.created_on()}: {formattedDate}</p>
<!-- English: "Created on: January 5, 2025 at 3:30 PM" -->
<!-- Portuguese: "Created on: 5 de janeiro de 2025 15:30" -->

<p>{m.member_count_label()}: {formattedNumber}</p>
<!-- English: "Members: 1,234" -->
<!-- Portuguese: "Members: 1.234" (note dot as thousands separator) -->
```

The `Intl` APIs use the same CLDR data that ICU plural rules use. They know that Portuguese uses commas for decimals and dots for thousands (opposite of English), that dates are day-month-year in Portuguese, and that currency symbols are positioned differently. You get all of this for free by passing `languageTag()`.

### Creating Reusable Formatters

For performance, avoid creating new `Intl` objects on every render. Create formatters once and reuse them:

```typescript
// src/lib/i18n/formatters.ts
import { languageTag } from '$lib/paraglide/runtime';

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat(languageTag(), {
    style: 'currency',
    currency
  }).format(amount);
}

export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(languageTag(), options ?? { dateStyle: 'long' }).format(d);
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const rtf = new Intl.RelativeTimeFormat(languageTag(), { numeric: 'auto' });

  if (Math.abs(diffDays) < 1) {
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    if (Math.abs(diffHours) < 1) {
      const diffMinutes = Math.round(diffMs / (1000 * 60));
      return rtf.format(diffMinutes, 'minute');
    }
    return rtf.format(diffHours, 'hour');
  }
  return rtf.format(diffDays, 'day');
}
```

Usage:

```svelte
<script lang="ts">
  import { formatCurrency, formatDate, formatRelativeTime } from '$lib/i18n/formatters';

  let { data } = $props();
</script>

<p>{formatCurrency(data.price)}</p>
<p>{formatDate(data.createdAt)}</p>
<p>{formatRelativeTime(data.updatedAt)}</p>
<!-- English: "$29.99", "January 5, 2025", "3 hours ago" -->
<!-- Portuguese: "US$ 29,99", "5 de janeiro de 2025", "ha 3 horas" -->
```

## Common Pitfalls

### Pitfall 1: Forgetting to Extract Strings from Attributes

Text in HTML attributes is just as user-facing as text in element content. Do not forget `alt`, `title`, `placeholder`, and `aria-label`:

```svelte
<!-- WRONG: Attribute text is not translated -->
<input placeholder="Search projects..." />
<img src="/hero.jpg" alt="Team collaboration" />
<button aria-label="Close dialog">X</button>

<!-- CORRECT: Attribute text from message functions -->
<input placeholder={m.search_placeholder()} />
<img src="/hero.jpg" alt={m.hero_image_alt()} />
<button aria-label={m.close_dialog_label()}>X</button>
```

### Pitfall 2: Splitting Sentences Across Elements

Do not break a sentence into multiple message keys. Word order changes between languages, so the pieces will not reassemble correctly:

```svelte
<!-- WRONG: Split sentence — breaks in many languages -->
<p>{m.welcome_part1()} <strong>{m.welcome_part2()}</strong> {m.welcome_part3()}</p>
<!-- en: "Welcome to " + "TeamBoard" + " — let's get started" -->
<!-- But Portuguese word order might be completely different -->

<!-- CORRECT: One message with the full sentence, use HTML if needed -->
<p>{@html m.welcome_full({ appName: '<strong>TeamBoard</strong>' })}</p>
<!-- en: "Welcome to <strong>TeamBoard</strong> — let's get started" -->
<!-- pt-BR: "Bem-vindo ao <strong>TeamBoard</strong> — vamos comecar" -->
```

Note: When using `{@html}`, make sure the interpolated values are safe (not user input). In this case, `appName` is a hardcoded string, so it is safe.

### Pitfall 3: Using Messages as Object Keys

Message functions return different strings depending on the locale. Do not use them as object keys, map lookups, or identifiers:

```typescript
// WRONG: Message return value as a key — breaks when locale changes
const statusLabels = {
  [m.status_active()]: 'green',
  [m.status_inactive()]: 'gray'
};

// CORRECT: Use stable identifiers, display messages separately
const statusColors: Record<string, string> = {
  active: 'green',
  inactive: 'gray'
};

function getStatusLabel(status: string): string {
  switch (status) {
    case 'active': return m.status_active();
    case 'inactive': return m.status_inactive();
    default: return status;
  }
}
```

## Try It

### Exercise 1: Product Listing Page

Create a SvelteKit page at `/products` that displays a list of products. Set up Paraglide with English and Portuguese (pt-BR). Create messages for:
- The page title ("Our Products" / "Nossos Produtos")
- A product count using ICU plural rules ("Showing 1 product" / "Showing 5 products")
- A product card with name, price (formatted with `Intl.NumberFormat`), and an "Add to Cart" button
- An empty state message ("No products found." / "Nenhum produto encontrado.")

The page should receive products from a `load` function. Use `languageTag()` to format prices correctly for each locale.

### Exercise 2: Contact Form with Translated Validation

Build a contact form at `/contact` with fields for name, email, and message. Implement a form action that validates all fields. All validation error messages must come from Paraglide message functions so they appear in the user's language:
- "Name is required." / "Nome e obrigatorio."
- "Please enter a valid email." / "Por favor, insira um email valido."
- "Message must be at least 20 characters." / "A mensagem deve ter pelo menos 20 caracteres."

Return errors using `fail(400, { errors })` and display them next to each field. Include a success message after submission: "Thank you for your message!" / "Obrigado pela sua mensagem!"

### Exercise 3: Language Switcher with SEO

Build a complete root layout (`+layout.svelte`) that includes:
1. A `<ParaglideJS>` wrapper
2. A language switcher component in the header (using `availableLanguageTags`)
3. Full SEO tags: `<link rel="alternate" hreflang>` for each locale, `<link rel="canonical">`, `<meta property="og:locale">`, and `<meta property="og:locale:alternate">`
4. Verify that switching languages preserves the current path, query parameters, and hash fragment

Test by navigating to `/dashboard?view=grid#projects` and switching between English and Portuguese. The URL should become `/pt-BR/dashboard?view=grid#projects`.

## Key Takeaways

- Paraglide is a compiler-based i18n solution: messages are compiled to TypeScript functions at build time, enabling tree-shaking, type safety, and zero runtime overhead
- Install with `@inlang/paraglide-js` for the compiler and `@inlang/paraglide-sveltekit` for SvelteKit integration (hooks, routing, link rewriting)
- Message files are flat JSON with `{param}` placeholders for dynamic values; Paraglide compiles them into typed functions where missing parameters are compile errors
- Import messages as `import * as m from '$lib/paraglide/messages'` and call them as functions: `m.greeting({ name: "World" })` -- these are direct function calls, not runtime lookups
- Paraglide-SvelteKit handles locale routing automatically through hooks -- you do not need `[locale]` route parameters or manual locale prefixes in links
- The `<ParaglideJS>` wrapper component rewrites all `<a>` tags to include the correct locale prefix and sets the `<html lang>` attribute
- Build language switchers using `availableLanguageTags` and `languageTag()` from the Paraglide runtime; always preserve search params and hash when switching
- Add `<link rel="alternate" hreflang>` tags for every locale and a `hreflang="x-default"` fallback to prevent duplicate content penalties and help Google serve the correct language
- Paraglide messages work on the server in `load` functions, form actions, and API routes -- use them for validation errors, success messages, and any server-rendered text
- Use ICU MessageFormat plural rules (`{count, plural, one {...} other {...}}`) in message files -- never use JavaScript conditionals for pluralization, as they break for non-English languages
- Pair Paraglide messages with `Intl.NumberFormat`, `Intl.DateTimeFormat`, and `Intl.RelativeTimeFormat` using `languageTag()` for locale-aware number, date, and currency formatting
- Every user-facing string belongs in a message file -- including `placeholder`, `alt`, `title`, and `aria-label` attributes, not just element text content
