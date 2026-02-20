# Requirements, Schema & Environment Setup

Welcome to Phase 7. Over the next nine modules you will build **TeamBoard**, a real-time team project manager with Kanban boards, live collaboration, and a full suite of advanced features. Think of it as a simplified Linear or Trello — the kind of application that demonstrates real engineering skill in a portfolio.

Phase 6 taught every advanced Svelte 5 and SvelteKit feature in isolation. Now you will apply them all together in a single production-grade application. By the end, every rune variant, every special element, every SvelteKit module, and every remote function will have earned its place in your code.

Before writing any code, you need a plan.

## Feature Overview

TeamBoard has four user-facing areas:

```
1. Boards & Tasks
   - Kanban boards with draggable columns and cards
   - Task creation, editing, status changes
   - Inline editing and rich descriptions
   - Task detail modal with comments and activity

2. Real-Time Collaboration
   - Live board updates via Server-Sent Events
   - Optimistic UI for instant feedback
   - Notification toasts for team activity
   - Online/offline status indicators

3. Team Management
   - Team creation and member invitations
   - Role-based permissions (owner, admin, member, viewer)
   - Team settings and profile management
   - Activity feed and audit log

4. Dashboard & Analytics
   - Project overview with streaming analytics
   - Sprint velocity and burndown data
   - Task completion trends
   - Prerendered marketing and help pages
```

## User Stories

```
Board User:
- As a user, I want to drag tasks between columns so I can update their status visually
- As a user, I want to open a task detail modal so I can edit without leaving the board
- As a user, I want to see live updates when teammates move tasks so we stay in sync
- As a user, I want a command palette (Cmd+K) so I can navigate quickly

Team Admin:
- As an admin, I want to invite members so my team can collaborate
- As an admin, I want to assign roles so I can control who can edit vs view
- As an admin, I want an activity feed so I can audit changes

System:
- As the app, I should work offline so users are not blocked by connectivity
- As the app, I should prerender static pages so marketing content loads instantly
- As the app, I should stream slow data so fast content appears immediately
```

## Database Schema

TeamBoard uses Drizzle ORM with SQLite. Here is the complete schema:

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
  ownerId: integer('owner_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const teamMembers = sqliteTable('team_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  teamId: integer('team_id').notNull().references(() => teams.id),
  userId: integer('user_id').notNull().references(() => users.id),
  role: text('role', { enum: ['owner', 'admin', 'member', 'viewer'] }).notNull(),
  joinedAt: integer('joined_at', { mode: 'timestamp' }).notNull()
});

export const boards = sqliteTable('boards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  teamId: integer('team_id').notNull().references(() => teams.id),
  name: text('name').notNull(),
  description: text('description'),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const columns = sqliteTable('columns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  boardId: integer('board_id').notNull().references(() => boards.id),
  name: text('name').notNull(),
  position: integer('position').notNull(),
  color: text('color').default('#6366f1')
});

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  columnId: integer('column_id').notNull().references(() => columns.id),
  boardId: integer('board_id').notNull().references(() => boards.id),
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority', { enum: ['low', 'medium', 'high', 'urgent'] }).default('medium'),
  assigneeId: integer('assignee_id').references(() => users.id),
  position: integer('position').notNull(),
  dueDate: integer('due_date', { mode: 'timestamp' }),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const comments = sqliteTable('comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull().references(() => tasks.id),
  userId: integer('user_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const activityLog = sqliteTable('activity_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  teamId: integer('team_id').notNull().references(() => teams.id),
  userId: integer('user_id').notNull().references(() => users.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: integer('entity_id').notNull(),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});
```

The `activityLog` table records every significant action (task created, task moved, member invited) with JSON metadata for details. This powers the activity feed and audit log you will build in Module 50.

## Environment Variables

TeamBoard uses all four `$env` module types. Create a `.env` file at the project root:

```bash
# .env

# $env/static/private — baked into server bundle at build time
DATABASE_URL=file:./data/teamboard.db
SESSION_SECRET=your-secret-key-change-in-production
STRIPE_SECRET_KEY=sk_test_...

# $env/static/public — baked into client bundle (PUBLIC_ prefix)
PUBLIC_APP_NAME=TeamBoard
PUBLIC_APP_URL=http://localhost:5173

# $env/dynamic/private — read at runtime, server-only
# These are set in the deployment environment, not in .env
# DEPLOY_REGION, SENTRY_DSN, etc.

# $env/dynamic/public — read at runtime, available to client
# PUBLIC_WS_URL, PUBLIC_FEATURE_FLAGS, etc.
```

Access them in your code:

```typescript
// Server-only, build-time — database URL, secrets
import { DATABASE_URL, SESSION_SECRET } from '$env/static/private';

// Client-safe, build-time — app name shown in UI
import { PUBLIC_APP_NAME } from '$env/static/public';

// Server-only, runtime — changes per deployment without rebuild
import { env } from '$env/dynamic/private';
const region = env.DEPLOY_REGION ?? 'us-east-1';

// Client-safe, runtime — feature flags that change without redeploy
import { env } from '$env/dynamic/public';
const wsUrl = env.PUBLIC_WS_URL ?? 'ws://localhost:5173';
```

The static modules are tree-shaken and inlined at build time — the actual values never appear in your source code. The dynamic modules read from `process.env` at runtime, so you can change them per deployment without rebuilding.

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

The `alias` entries let you write `import { draggable } from '$actions/drag'` instead of deep relative paths. The `version.name` changes on every build, which powers the "new version available" banner you will wire up in Module 48.

## Project Scaffolding

Create the folder structure:

```
src/
├── lib/
│   ├── actions/          # Custom use: actions (Module 47)
│   ├── api/              # Remote function .remote.ts files (Module 45)
│   ├── components/       # Reusable UI components
│   │   ├── board/        # Kanban board components
│   │   ├── ui/           # Generic UI (Toast, Modal, CommandPalette)
│   │   └── layout/       # Header, Sidebar, Footer
│   ├── server/           # Server-only code
│   │   ├── schema.ts     # Drizzle schema (above)
│   │   ├── database.ts   # Database connection
│   │   └── auth.ts       # Session helpers
│   ├── state/            # Reactive .svelte.ts modules (Module 46)
│   └── types/            # Shared TypeScript types
├── params/               # Route matchers (Module 45)
├── routes/
│   ├── (auth)/           # Login/signup layout group
│   ├── (app)/            # Authenticated app layout group
│   │   ├── dashboard/
│   │   ├── [teamSlug]/
│   │   │   ├── boards/
│   │   │   │   └── [boardId]/
│   │   │   ├── settings/
│   │   │   └── activity/
│   │   └── help/[...slug]/
│   ├── +layout.svelte
│   ├── +error.svelte
│   └── +page.svelte      # Marketing landing page
├── hooks.server.ts
├── hooks.client.ts
└── service-worker.ts
```

## Key Takeaways

- Plan features and schema before writing code — the database design shapes everything that follows
- Use all four `$env` modules for their intended purpose: static for build-time constants, dynamic for runtime configuration, private for secrets, public for client-visible values
- SvelteKit config aliases keep imports clean as the project grows
- The `version.name` config enables deployment detection in the client
- The route structure uses layout groups to separate authenticated and public sections — you will build this in lesson 3
