# Requirements, Schema & Environment Setup

Welcome to Phase 7. Over the next nine modules you will build **TeamBoard**, a real-time team project manager with Kanban boards, live collaboration, and a full suite of advanced features. Think of it as a simplified Linear or Trello -- the kind of application that demonstrates real engineering skill in a portfolio.

Phase 6 taught every advanced Svelte 5 and SvelteKit feature in isolation. Now you will apply them all together in a single production-grade application. By the end, every rune variant, every special element, every SvelteKit module, and every remote function will have earned its place in your code.

Before writing any code, you need a plan. This lesson defines the complete feature set, writes the user stories, designs the database schema, configures environment variables, sets up the SvelteKit project, and establishes the folder structure. Every decision here shapes the architecture of every module that follows.

## Why Planning Matters at This Level

Junior developers start by writing code. Senior developers start by writing requirements. Principal engineers start by designing the system boundaries, data flow, and failure modes -- then verify the plan before writing a single line of implementation.

TeamBoard has at least four major feature areas, eight database tables, three user roles, real-time data streaming, optimistic UI patterns, and offline support. Without a plan, you will find yourself:

1. **Redesigning the schema mid-project** -- "oh, I need a `position` column for drag-and-drop ordering, but I didn't add it, now I need a migration"
2. **Rebuilding components** -- "this task card needs data that only the board page loads, so I need to refactor the data flow"
3. **Duplicating state management** -- "I have the same user data in three different places, and they're out of sync"
4. **Fighting the folder structure** -- "I can't figure out where this file should go, so I'll just put it in `utils/misc.ts`"

The plan you build in this lesson prevents all of these problems.

## Feature Overview

TeamBoard has four user-facing areas, each designed to exercise specific Svelte 5 and SvelteKit capabilities:

```
1. Boards & Tasks
   - Kanban boards with draggable columns and cards
   - Task creation, editing, status changes
   - Inline editing and rich descriptions
   - Task detail modal with comments and activity

   Skills exercised: Actions (drag-and-drop), $state/$derived (board state),
   $effect (auto-save), pushState (modal without navigation),
   Snippets (reusable card layouts)

2. Real-Time Collaboration
   - Live board updates via Server-Sent Events
   - Optimistic UI for instant feedback
   - Notification toasts for team activity
   - Online/offline status indicators

   Skills exercised: SSE streaming, $effect (connection management),
   optimistic updates with rollback, service workers

3. Team Management
   - Team creation and member invitations
   - Role-based permissions (owner, admin, member, viewer)
   - Team settings and profile management
   - Activity feed and audit log

   Skills exercised: Form actions (CRUD), load functions (authorization),
   derived state (permission checks), layout groups

4. Dashboard & Analytics
   - Project overview with streaming analytics
   - Sprint velocity and burndown data
   - Task completion trends
   - Prerendered marketing and help pages

   Skills exercised: Streaming load functions, $derived.by (stats),
   prerendering, server-only modules
```

### Why These Features Were Chosen

Each feature maps to a specific set of SvelteKit capabilities. Drag-and-drop exercises custom actions. Real-time updates exercise SSE and reactive state. Role-based permissions exercise load function authorization. Streaming analytics exercise SvelteKit's streaming responses. The feature set is not arbitrary -- it is designed to give you production experience with every major feature covered in Phases 1 through 6.

## User Stories

User stories define what the application does from the user's perspective. They are organized by role:

```
Board User:
- As a user, I want to drag tasks between columns so I can update their status visually
- As a user, I want to open a task detail modal (Cmd+click or card click)
  so I can edit without leaving the board
- As a user, I want to see live updates when teammates move tasks so we stay in sync
- As a user, I want a command palette (Cmd+K) so I can navigate quickly
- As a user, I want inline task editing so I can update titles without opening a modal
- As a user, I want to filter tasks by assignee and priority so I can focus my work

Team Admin:
- As an admin, I want to invite members by email so my team can collaborate
- As an admin, I want to assign roles (admin, member, viewer) so I can control permissions
- As an admin, I want an activity feed so I can audit what changed and who changed it
- As an admin, I want to manage team settings (name, description) so I can keep the workspace organized

System:
- As the app, I should work offline so users are not blocked by connectivity
- As the app, I should prerender static pages (marketing, help) so they load instantly
- As the app, I should stream slow data (analytics) so fast content appears immediately
- As the app, I should validate all form input on both client and server
- As the app, I should provide meaningful error pages with error tracking IDs
```

### Translating Stories to Architecture

Each user story implies specific architectural decisions:

| Story | Architecture Decision |
|---|---|
| "drag tasks between columns" | Custom `use:draggable` and `use:dropzone` actions |
| "open a task detail modal" | `pushState` with `App.PageState` typing |
| "see live updates" | SSE endpoint + reactive `$effect` listener |
| "command palette (Cmd+K)" | `<svelte:window>` with `onkeydown`, `<dialog>` element |
| "work offline" | Service worker with offline cache strategy |
| "prerender static pages" | `export const prerender = true` on marketing routes |
| "stream slow data" | Streaming load functions with promises in returned data |
| "validate form input" | Zod schemas shared between client and server |

## Database Schema

TeamBoard uses Drizzle ORM with SQLite. The schema has eight tables with carefully designed relationships:

```typescript
// src/lib/server/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const teams = sqliteTable('teams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  ownerId: integer('owner_id')
    .notNull()
    .references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const teamMembers = sqliteTable('team_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  role: text('role', {
    enum: ['owner', 'admin', 'member', 'viewer']
  }).notNull(),
  joinedAt: integer('joined_at', { mode: 'timestamp' }).notNull()
});

export const boards = sqliteTable('boards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  name: text('name').notNull(),
  description: text('description'),
  createdBy: integer('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const columns = sqliteTable('columns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  boardId: integer('board_id')
    .notNull()
    .references(() => boards.id),
  name: text('name').notNull(),
  position: integer('position').notNull(),
  color: text('color').default('#6366f1')
});

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  columnId: integer('column_id')
    .notNull()
    .references(() => columns.id),
  boardId: integer('board_id')
    .notNull()
    .references(() => boards.id),
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority', {
    enum: ['low', 'medium', 'high', 'urgent']
  }).default('medium'),
  assigneeId: integer('assignee_id').references(() => users.id),
  position: integer('position').notNull(),
  dueDate: integer('due_date', { mode: 'timestamp' }),
  createdBy: integer('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const comments = sqliteTable('comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id')
    .notNull()
    .references(() => tasks.id),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  body: text('body').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const activityLog = sqliteTable('activity_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: integer('entity_id').notNull(),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});
```

### Schema Design Decisions Explained

**Why `position` columns on `columns` and `tasks`?** Kanban boards require ordered items. Without a `position` column, you would have to rely on `id` order (which breaks when items are reordered) or `createdAt` (which does not support manual ordering). The `position` integer lets you reorder items by updating a single number.

**Why `boardId` on tasks in addition to `columnId`?** A task belongs to a column, and a column belongs to a board, so you could derive the board from `columnId`. But many queries need "all tasks on this board" without joining through columns. The denormalized `boardId` avoids an extra join on the most common query.

**Why `metadata` as JSON in `activityLog`?** Different actions have different metadata: "task_moved" has `{ fromColumn, toColumn }`, "member_invited" has `{ email, role }`, "task_created" has `{ title, columnName }`. A JSON column is the right choice for this kind of polymorphic data -- it avoids creating separate tables for each action type.

**Why `slug` on teams instead of using `id` in URLs?** URLs like `/teams/3/boards/7` expose database internals and are not memorable. URLs like `/acme-corp/boards/sprint-1` are readable, shareable, and do not leak your user count. The `slug` column must be unique and is used as the URL parameter.

### WRONG: Using VARCHAR Lengths in SQLite

```typescript
// WRONG -- SQLite ignores VARCHAR length constraints
export const users = sqliteTable('users', {
  email: text('email', { length: 255 }).notNull().unique(),
  name: text('name', { length: 100 }).notNull()
});
```

SQLite treats all `TEXT` values as dynamic-length strings. A `length` constraint is parsed but not enforced -- you can insert a 10,000-character string into a `VARCHAR(100)` column without error. If you need length validation, do it in your application code (Zod schemas), not in the database schema.

### WRONG: Missing Foreign Key References

```typescript
// WRONG -- no .references(), so the database does not enforce relationships
export const tasks = sqliteTable('tasks', {
  columnId: integer('column_id').notNull(),  // No reference!
  boardId: integer('board_id').notNull()      // No reference!
});
```

Without `.references()`, you can insert a task with `columnId: 999` even if column 999 does not exist. This creates orphaned records that break your queries. Always declare foreign key references so the database enforces referential integrity.

## Environment Variables

TeamBoard uses all four `$env` module types. Understanding which to use where is critical for security and deployment flexibility:

```bash
# .env

# $env/static/private -- baked into server bundle at build time
DATABASE_URL=file:./data/teamboard.db
SESSION_SECRET=your-secret-key-change-in-production

# $env/static/public -- baked into client bundle (PUBLIC_ prefix)
PUBLIC_APP_NAME=TeamBoard
PUBLIC_APP_URL=http://localhost:5173

# $env/dynamic/private -- read at runtime, server-only
# Set in the deployment environment, not in .env
# DEPLOY_REGION, SENTRY_DSN, etc.

# $env/dynamic/public -- read at runtime, available to client
# PUBLIC_WS_URL, PUBLIC_FEATURE_FLAGS, etc.
```

### The Four $env Modules

```typescript
// 1. $env/static/private -- server-only, build-time
// Best for: database URLs, API secrets, signing keys
// The value is inlined at build time -- the env var name does not appear in the bundle
import { DATABASE_URL, SESSION_SECRET } from '$env/static/private';

// 2. $env/static/public -- client-safe, build-time
// Best for: app name, public URLs, feature names
// The value is inlined in the client bundle -- anyone can read it
import { PUBLIC_APP_NAME } from '$env/static/public';

// 3. $env/dynamic/private -- server-only, runtime
// Best for: values that change per deployment without rebuild
// Read from process.env at runtime, not at build time
import { env } from '$env/dynamic/private';
const region = env.DEPLOY_REGION ?? 'us-east-1';

// 4. $env/dynamic/public -- client-safe, runtime
// Best for: feature flags, WebSocket URLs that change without redeploy
import { env } from '$env/dynamic/public';
const wsUrl = env.PUBLIC_WS_URL ?? 'ws://localhost:5173';
```

### When to Use Static vs Dynamic

**Static** modules are resolved at build time. Vite replaces the import with the literal value, which means:
- Dead code elimination works (e.g., `if (SECRET_KEY === 'test') { ... }` removes the block in production builds)
- The env var name does not appear in the bundle
- You must rebuild to change the value

**Dynamic** modules are resolved at runtime. The server reads `process.env` on each request, which means:
- You can change values without rebuilding (redeploy with new env vars)
- The env var name appears in the bundle (for public dynamic vars)
- No dead code elimination based on the value

### WRONG: Using Dynamic When Static Would Do

```typescript
// WRONG -- dynamic adds runtime overhead for a value that never changes
import { env } from '$env/dynamic/private';
const dbUrl = env.DATABASE_URL;  // Read from process.env on every import

// CORRECT -- static is inlined at build time, zero runtime cost
import { DATABASE_URL } from '$env/static/private';
```

Use `$env/static` for values that are set during deployment and do not change between requests. Use `$env/dynamic` only for values that genuinely need to change at runtime without a rebuild (feature flags, A/B test configuration).

### WRONG: Using PUBLIC_ Prefix for Secrets

```bash
# WRONG -- PUBLIC_ makes this visible to everyone
PUBLIC_STRIPE_SECRET_KEY=sk_live_abc123

# CORRECT -- no prefix means server-only
STRIPE_SECRET_KEY=sk_live_abc123
```

Any variable with the `PUBLIC_` prefix can be imported by client-side code and will appear in the browser's JavaScript bundle. Never use the `PUBLIC_` prefix for secrets, API keys, or credentials.

## SvelteKit Configuration

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  kit: {
    adapter: adapter(),

    alias: {
      $components: 'src/lib/components',
      $actions: 'src/lib/actions',
      $state: 'src/lib/state',
      $server: 'src/lib/server'
    },

    env: {
      dir: '.',
      publicPrefix: 'PUBLIC_'
    },

    csrf: {
      checkOrigin: true
    },

    version: {
      name: Date.now().toString()
    }
  }
};

export default config;
```

### What Each Config Option Does

**`alias`** entries let you write `import { draggable } from '$actions/drag'` instead of `import { draggable } from '../../lib/actions/drag'`. This keeps imports clean as the project grows and makes file moves less painful -- the alias still works regardless of the importing file's depth.

**`csrf.checkOrigin`** verifies that `POST` requests come from your own origin. Without this, an attacker could create a form on their website that submits to your `/api/boards` endpoint, potentially creating boards in the victim's account (Cross-Site Request Forgery). SvelteKit enables this by default, but it is worth being explicit about.

**`version.name`** changes on every build, which powers the "new version available" banner you will wire up in Module 48. The client periodically checks the version and shows a notification when the server's version differs from the client's.

### WRONG: Using Generic Aliases

```javascript
// WRONG -- alias names should match directory names for discoverability
alias: {
  $c: 'src/lib/components',
  $a: 'src/lib/actions',
  $s: 'src/lib/state'
}
```

Single-letter aliases save a few keystrokes but make imports unreadable. `import { Toast } from '$c/ui/Toast'` tells you nothing about what `$c` is. `import { Toast } from '$components/ui/Toast'` is self-documenting.

## Project Scaffolding

Create the folder structure. Each directory has a specific purpose:

```
src/
├── lib/
│   ├── actions/          # Custom use: actions (Module 47)
│   │   ├── drag.ts       # Drag-and-drop action
│   │   ├── clickOutside.ts
│   │   └── focus.ts
│   ├── api/              # Remote function .remote.ts files (Module 45)
│   │   ├── boards.remote.ts
│   │   ├── tasks.remote.ts
│   │   └── teams.remote.ts
│   ├── components/       # Reusable UI components
│   │   ├── board/        # Kanban board components
│   │   │   ├── BoardColumn.svelte
│   │   │   ├── TaskCard.svelte
│   │   │   └── TaskModal.svelte
│   │   ├── ui/           # Generic UI (Toast, Modal, CommandPalette)
│   │   │   ├── Button.svelte
│   │   │   ├── Dialog.svelte
│   │   │   └── Toast.svelte
│   │   └── layout/       # Header, Sidebar, Footer
│   │       ├── AppHeader.svelte
│   │       └── AppSidebar.svelte
│   ├── server/           # Server-only code
│   │   ├── schema.ts     # Drizzle schema (above)
│   │   ├── database.ts   # Database connection
│   │   └── auth.ts       # Session helpers
│   ├── state/            # Reactive .svelte.ts modules (Module 46)
│   │   ├── board.svelte.ts
│   │   └── toast.svelte.ts
│   └── types/            # Shared TypeScript types
│       └── index.ts
├── params/               # Route matchers (Module 45)
│   └── teamSlug.ts
├── routes/
│   ├── (auth)/           # Login/signup layout group
│   │   ├── login/
│   │   │   ├── +page.svelte
│   │   │   └── +page.server.ts
│   │   └── signup/
│   │       ├── +page.svelte
│   │       └── +page.server.ts
│   ├── (app)/            # Authenticated app layout group
│   │   ├── +layout.svelte
│   │   ├── +layout.server.ts
│   │   ├── dashboard/
│   │   │   └── +page.svelte
│   │   ├── [teamSlug]/
│   │   │   ├── +layout.svelte
│   │   │   ├── +layout.server.ts
│   │   │   ├── boards/
│   │   │   │   ├── +page.svelte
│   │   │   │   └── [boardId]/
│   │   │   │       ├── +page.svelte
│   │   │   │       └── +page.server.ts
│   │   │   ├── settings/
│   │   │   │   └── +page.svelte
│   │   │   └── activity/
│   │   │       └── +page.svelte
│   │   └── help/[...slug]/
│   │       └── +page.svelte
│   ├── +layout.svelte    # Root layout
│   ├── +error.svelte     # Error page
│   └── +page.svelte      # Marketing landing page
├── hooks.server.ts       # Server hooks (auth, logging, security)
├── hooks.client.ts       # Client hooks (error handling)
├── hooks.ts              # Universal hooks (reroute, transport)
└── service-worker.ts     # Offline support
```

### Why Layout Groups?

Layout groups (`(auth)`, `(app)`) are directories wrapped in parentheses. They do not appear in the URL but allow different layout structures:

```
Route file location              →  URL
(auth)/login/+page.svelte       →  /login
(app)/dashboard/+page.svelte    →  /dashboard
(app)/[teamSlug]/boards/...     →  /acme-corp/boards/...
```

The `(auth)` group uses a minimal centered layout (logo + form). The `(app)` group uses a full application layout (sidebar + header + main content). Without groups, you would need conditional logic in a single root layout to decide which UI to show -- fragile, hard to maintain, and ugly.

### The params/ Directory

Route matchers in `params/` constrain dynamic route segments. The `[teamSlug]` parameter should only match valid slug formats:

```typescript
// src/params/teamSlug.ts
import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => {
  // Only match lowercase alphanumeric strings with hyphens
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(param);
};
```

Use it in routes as `[teamSlug=teamSlug]`:

```
src/routes/(app)/[teamSlug=teamSlug]/boards/+page.svelte
```

Without the matcher, a URL like `/dashboard` would match `[teamSlug]`, and the load function would try to look up a team with slug "dashboard" -- which does not exist. The matcher prevents this by only matching valid slug patterns.

## Try It

Complete the full project foundation:

1. Create the complete database schema in `src/lib/server/schema.ts` with all eight tables, proper foreign key references, and the JSON metadata column on `activityLog`

2. Create the `.env` file with `DATABASE_URL`, `SESSION_SECRET`, `PUBLIC_APP_NAME`, and `PUBLIC_APP_URL`

3. Configure `svelte.config.js` with aliases for `$components`, `$actions`, `$state`, and `$server`, plus `csrf.checkOrigin` and `version.name`

4. Create the folder structure with layout groups `(auth)` and `(app)`, including empty placeholder files for every route listed above

5. Create the `teamSlug` param matcher in `src/params/teamSlug.ts`

6. Write user stories for one additional feature not listed above (e.g., task labels, due date reminders, board templates) and identify which SvelteKit features it would exercise

7. Generate the first Drizzle migration and verify it creates all tables correctly using Drizzle Studio

8. Review every table and answer: "If I need to query all X for a given Y, is there an indexed foreign key?" For any missing indexes, add them to the schema

## Key Takeaways

- **Plan features and schema before writing code** -- the database design shapes the data flow, the load functions, the form actions, and the component hierarchy
- **User stories map to architecture decisions** -- "drag tasks" implies actions, "live updates" implies SSE, "command palette" implies `<svelte:window>` key handling
- **The `position` column enables drag-and-drop ordering** -- without it, you cannot reorder items in a Kanban board
- **Denormalize when the common query benefits** -- `boardId` on tasks avoids a join through columns for the most frequent query
- **Use all four `$env` modules for their intended purpose**: static for build-time constants, dynamic for runtime configuration, private for secrets, public for client-visible values
- **SvelteKit config aliases keep imports clean** -- `$components`, `$actions`, `$state`, `$server` are self-documenting and survive file moves
- **The `version.name` config enables deployment detection** -- the client compares its version to the server's and can show a "new version available" banner
- **Layout groups separate authenticated and public sections** -- different layouts, same URL space, no conditional rendering
- **Param matchers prevent route collisions** -- `[teamSlug=teamSlug]` ensures `/dashboard` does not match as a team slug
- **JSON metadata columns handle polymorphic data** -- the activity log stores different metadata shapes for different action types without separate tables
