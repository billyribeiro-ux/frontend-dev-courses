# Requirements, Schema & Environment Setup

Welcome to Phase 7. Over the next nine modules you will build **TeamBoard**, a real-time team project manager with Kanban boards, live collaboration, and a full suite of advanced features. Think of it as a simplified Linear or Trello -- the kind of application that demonstrates real engineering skill in a portfolio.

Phase 6 taught every advanced Svelte 5 and SvelteKit feature in isolation. Now you will apply them all together in a single production-grade application. By the end, every rune variant, every special element, every SvelteKit module, and every remote function will have earned its place in your code.

Before writing any code, you need a plan. This is the step most developers skip, and it is the step that separates junior from senior engineers. A senior engineer does not open a code editor first -- they open a document and ask: what are we building, who is it for, what does the data look like, and what are the technical constraints? The answers to these questions determine everything that follows.

## Why Requirements Come First

I have seen teams jump into coding on day one and spend month three rewriting their database schema because they did not think through relationships upfront. I have seen applications where the "task" table had 40 columns because nobody modeled the domain before building. Requirements analysis is not bureaucratic overhead -- it is the cheapest time you will ever spend on a project.

The process looks like this:

1. **Feature overview** -- what does the app do at a high level?
2. **User stories** -- who uses it and what do they need?
3. **Domain analysis** -- what are the core entities and their relationships?
4. **Schema design** -- how does the data model translate to database tables?
5. **Type derivation** -- how do TypeScript types flow from the schema?
6. **API design** -- what operations does the frontend need?
7. **Environment setup** -- what configuration does the app require?

Each step constrains the next. If you skip step 3 (domain analysis), your schema will be ad-hoc. If you skip step 5 (type derivation), you lose end-to-end type safety. If you skip step 7, every developer on the team wastes hours on setup issues.

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

Each area exercises specific SvelteKit features:

- **Boards & Tasks** uses actions (`use:draggable`), runes (`$state`, `$derived`, `$effect`), snippets, and the `$inspect` rune for debugging
- **Real-Time** uses `$effect` for SSE connections, `$state` for optimistic updates, and the `$app/stores` for page-level reactivity
- **Team Management** uses form actions, progressive enhancement, and `$page.data` for shared layout data
- **Dashboard** uses streaming with `await` blocks, `$derived.by()` for analytics computation, and prerendering for static content

## User Stories

Writing user stories forces you to think about the application from the user's perspective, not the developer's. Each story implies specific UI, data requirements, and technical implementation.

```
Board User:
- As a user, I want to drag tasks between columns so I can update their status visually
  → Requires: drag-and-drop action, PATCH API for task position/column, optimistic update
- As a user, I want to open a task detail modal so I can edit without leaving the board
  → Requires: SvelteKit shallow routing ($page.state), modal component, task detail form
- As a user, I want to see live updates when teammates move tasks so we stay in sync
  → Requires: Server-Sent Events endpoint, $effect for connection, event dispatch
- As a user, I want a command palette (Cmd+K) so I can navigate quickly
  → Requires: svelte:window keydown handler, fuzzy search, task/board navigation

Team Admin:
- As an admin, I want to invite members so my team can collaborate
  → Requires: invitation form action, email validation, team_members insert
- As an admin, I want to assign roles so I can control who can edit vs view
  → Requires: role enum in schema, permission checks in load functions and actions
- As an admin, I want an activity feed so I can audit changes
  → Requires: activity_log table, JSON metadata, streaming load function

System:
- As the app, I should work offline so users are not blocked by connectivity
  → Requires: service worker, local storage cache, sync on reconnect
- As the app, I should prerender static pages so marketing content loads instantly
  → Requires: +page.ts with export const prerender = true
- As the app, I should stream slow data so fast content appears immediately
  → Requires: deferred loading with promises in load functions
```

### From Stories to Technical Requirements

Notice how each user story decomposes into specific technical needs. "Drag tasks between columns" is not a vague wish -- it requires a `use:drag` action, a PATCH endpoint that updates `column_id` and `position`, an optimistic state update that moves the card immediately before the server responds, and a rollback mechanism if the server rejects the change.

This decomposition is the bridge between product thinking and engineering. Every story you write should have a clear implementation path before you start coding.

## Domain Analysis

Before designing tables, identify the core entities and their relationships using plain language. This is the domain model -- the conceptual structure that the database schema will encode.

```
User
  - Has a profile (name, email, avatar)
  - Belongs to many teams (with a role in each)
  - Creates tasks, comments, and boards
  - Has active sessions for authentication

Team
  - Has many members (each with a role)
  - Has many boards
  - Has an activity log
  - Owned by one user (who can delete it)

Board
  - Belongs to one team
  - Has many columns (ordered)
  - Has many tasks (each in a column)
  - Created by one user

Column
  - Belongs to one board
  - Has a position (for ordering)
  - Has a color (for visual distinction)
  - Contains many tasks (ordered)

Task
  - Belongs to one column (and transitively one board)
  - Has a position within its column
  - Optionally assigned to one user
  - Has many comments
  - Created by one user
  - Has priority, due date, timestamps

Comment
  - Belongs to one task
  - Written by one user
  - Has a text body and timestamp

Activity Log Entry
  - Belongs to one team
  - Performed by one user
  - Records an action on an entity (with metadata)
```

### Identifying Relationships

From the domain model, extract the relationship types:

| Relationship | Type | Implementation |
|---|---|---|
| User ↔ Team | Many-to-Many | `teamMembers` junction table with `role` |
| Team → Board | One-to-Many | `boards.teamId` foreign key |
| Board → Column | One-to-Many | `columns.boardId` foreign key |
| Column → Task | One-to-Many | `tasks.columnId` foreign key |
| Task → Comment | One-to-Many | `comments.taskId` foreign key |
| User → Task (assignee) | Optional One-to-Many | `tasks.assigneeId` nullable foreign key |
| User → Task (creator) | One-to-Many | `tasks.createdBy` foreign key |
| Team → Activity | One-to-Many | `activityLog.teamId` foreign key |

The many-to-many relationship between User and Team is the most important to get right. A user can be in multiple teams, and a team has multiple users. The `teamMembers` junction table carries the `role` -- this is not just a link table, it has its own data.

## Database Schema

TeamBoard uses Drizzle ORM with SQLite. Here is the complete schema with annotations explaining every design decision:

```typescript
// src/lib/server/schema.ts
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// ========== Users ==========
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

// ========== Teams ==========
export const teams = sqliteTable('teams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  ownerId: integer('owner_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

// ========== Team Members (junction table) ==========
export const teamMembers = sqliteTable('team_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  teamId: integer('team_id').notNull().references(() => teams.id),
  userId: integer('user_id').notNull().references(() => users.id),
  role: text('role', { enum: ['owner', 'admin', 'member', 'viewer'] }).notNull(),
  joinedAt: integer('joined_at', { mode: 'timestamp' }).notNull()
}, (table) => [
  // A user can only be a member of a team once
  uniqueIndex('team_user_unique').on(table.teamId, table.userId)
]);

// ========== Boards ==========
export const boards = sqliteTable('boards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  teamId: integer('team_id').notNull().references(() => teams.id),
  name: text('name').notNull(),
  description: text('description'),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

// ========== Columns ==========
export const columns = sqliteTable('columns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  boardId: integer('board_id').notNull().references(() => boards.id),
  name: text('name').notNull(),
  position: integer('position').notNull(),
  color: text('color').default('#6366f1')
});

// ========== Tasks ==========
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

// ========== Comments ==========
export const comments = sqliteTable('comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull().references(() => tasks.id),
  userId: integer('user_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

// ========== Activity Log ==========
export const activityLog = sqliteTable('activity_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  teamId: integer('team_id').notNull().references(() => teams.id),
  userId: integer('user_id').notNull().references(() => users.id),
  action: text('action').notNull(),  // 'task.created', 'task.moved', 'member.invited'
  entityType: text('entity_type').notNull(),  // 'task', 'board', 'member'
  entityId: integer('entity_id').notNull(),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});
```

### Schema Design Decisions Explained

**Why `slug` on teams?** URLs like `/my-team/boards/1` are user-friendly and SEO-friendly. The slug is derived from the team name (lowercased, spaces replaced with hyphens) and must be unique. Using slugs instead of numeric IDs in URLs also prevents enumeration attacks -- a competitor cannot simply increment an ID to discover your teams.

**Why `boardId` on tasks (redundant with column)?** A task's board can be derived from its column. But storing `boardId` directly on tasks makes queries dramatically faster. "Get all tasks for board 5" is a simple indexed query instead of a join through columns. This is a deliberate denormalization -- you trade a tiny amount of data integrity risk for significant query performance.

**Why `position` as an integer?** Position determines display order within a column. When a user drags a task between two others, you update only the moved task's position. Using integers means you can assign positions like 10, 20, 30 and insert between them (15). When positions get too close, re-normalize the entire column's positions in a batch update.

**Why `mode: 'timestamp'` on dates?** SQLite does not have a native datetime type. Drizzle's `mode: 'timestamp'` stores dates as Unix timestamps (integers) and converts them to JavaScript `Date` objects when reading. This gives you correct date comparison, sorting, and arithmetic without string parsing.

**Why `mode: 'json'` on metadata?** The activity log's `metadata` field stores arbitrary JSON for each action type. A "task.moved" action might store `{ from: "To Do", to: "In Progress" }`. A "member.invited" action might store `{ email: "new@example.com", role: "member" }`. Storing this as JSON avoids creating separate metadata tables for each action type.

### Relations

Drizzle relations are declared separately from the table schema. They do not affect the database -- they exist purely for Drizzle's relational query API:

```typescript
// ========== Relations ==========
export const usersRelations = relations(users, ({ many }) => ({
  teamMemberships: many(teamMembers),
  createdTasks: many(tasks),
  comments: many(comments)
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  owner: one(users, {
    fields: [teams.ownerId],
    references: [users.id]
  }),
  members: many(teamMembers),
  boards: many(boards),
  activityLog: many(activityLog)
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id]
  }),
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id]
  })
}));

export const boardsRelations = relations(boards, ({ one, many }) => ({
  team: one(teams, {
    fields: [boards.teamId],
    references: [teams.id]
  }),
  creator: one(users, {
    fields: [boards.createdBy],
    references: [users.id]
  }),
  columns: many(columns),
  tasks: many(tasks)
}));

export const columnsRelations = relations(columns, ({ one, many }) => ({
  board: one(boards, {
    fields: [columns.boardId],
    references: [boards.id]
  }),
  tasks: many(tasks)
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  column: one(columns, {
    fields: [tasks.columnId],
    references: [columns.id]
  }),
  board: one(boards, {
    fields: [tasks.boardId],
    references: [boards.id]
  }),
  assignee: one(users, {
    fields: [tasks.assigneeId],
    references: [users.id]
  }),
  creator: one(users, {
    fields: [tasks.createdBy],
    references: [users.id]
  }),
  comments: many(comments)
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  task: one(tasks, {
    fields: [comments.taskId],
    references: [tasks.id]
  }),
  author: one(users, {
    fields: [comments.userId],
    references: [users.id]
  })
}));

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  team: one(teams, {
    fields: [activityLog.teamId],
    references: [teams.id]
  }),
  user: one(users, {
    fields: [activityLog.userId],
    references: [users.id]
  })
}));
```

With relations declared, you can use Drizzle's relational query API:

```typescript
// Get a board with its columns and tasks, plus task assignees
const board = await db.query.boards.findFirst({
  where: eq(boards.id, boardId),
  with: {
    columns: {
      orderBy: [asc(columns.position)],
      with: {
        tasks: {
          orderBy: [asc(tasks.position)],
          with: {
            assignee: true
          }
        }
      }
    }
  }
});
```

This single query replaces what would be 4 separate queries with manual joins. Drizzle generates a single efficient SQL query with the necessary JOINs.

## TypeScript Types Derived from Schema

One of Drizzle's strengths is type inference from the schema. Instead of maintaining separate TypeScript interfaces that can drift from the database schema, derive types directly:

```typescript
// src/lib/types/index.ts
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { users, teams, teamMembers, boards, columns, tasks, comments, activityLog } from '$server/schema';

// Select types — what you get when reading from the database
export type User = InferSelectModel<typeof users>;
export type Team = InferSelectModel<typeof teams>;
export type TeamMember = InferSelectModel<typeof teamMembers>;
export type Board = InferSelectModel<typeof boards>;
export type Column = InferSelectModel<typeof columns>;
export type Task = InferSelectModel<typeof tasks>;
export type Comment = InferSelectModel<typeof comments>;
export type ActivityLogEntry = InferSelectModel<typeof activityLog>;

// Insert types — what you need to provide when inserting
export type NewUser = InferInsertModel<typeof users>;
export type NewTask = InferInsertModel<typeof tasks>;
export type NewComment = InferInsertModel<typeof comments>;

// Composite types — what load functions actually return
export type TaskWithAssignee = Task & {
  assignee: Pick<User, 'id' | 'name' | 'avatarUrl'> | null;
};

export type ColumnWithTasks = Column & {
  tasks: TaskWithAssignee[];
};

export type BoardWithColumns = Board & {
  columns: ColumnWithTasks[];
};

// Role type extracted from schema enum
export type TeamRole = TeamMember['role'];
```

### Why Derive Instead of Define Separately?

```typescript
// WRONG — manually defined type that can drift from schema
interface Task {
  id: number;
  title: string;
  description: string;  // Schema says this is nullable, but interface forgot
  priority: string;      // Schema has a specific enum, interface allows any string
  // ... missing fields ...
}

// CORRECT — derived from schema, always in sync
type Task = InferSelectModel<typeof tasks>;
// If you add a column to the schema, Task automatically includes it
```

The derived types are the single source of truth. When you add a `labels` column to the tasks table, the `Task` type updates automatically. Every load function, form action, and component that uses `Task` gets type-checked against the new schema without any manual updates.

## Migration Strategy

### Initial Migration

After defining the schema, generate and apply the initial migration:

```bash
npx drizzle-kit generate  # Creates drizzle/0000_initial.sql
npx drizzle-kit migrate   # Applies it to the database
```

### Evolving the Schema

During development, your schema will change. The process is:

1. Modify the schema in `schema.ts`
2. Run `npx drizzle-kit generate` -- Drizzle diffs the schema against the last migration and generates a new SQL file
3. Review the generated SQL -- never apply blindly
4. Run `npx drizzle-kit migrate`

### Destructive vs Non-Destructive Changes

| Change | Type | Risk |
|---|---|---|
| Add a column with default | Non-destructive | Safe -- existing rows get the default |
| Add a nullable column | Non-destructive | Safe -- existing rows get NULL |
| Add a non-nullable column without default | Destructive | Fails if table has data |
| Rename a column | Destructive | Breaks existing queries |
| Drop a column | Destructive | Loses data permanently |
| Change column type | Destructive | May lose precision or fail |

For destructive changes in production, use a multi-step migration strategy:
1. Add the new column (keep the old one)
2. Deploy code that writes to both columns
3. Backfill the new column from the old
4. Deploy code that reads from the new column
5. Drop the old column

For a capstone project, you can use `db:reset` to wipe and recreate the database. In production, you never do this.

## Seed Data Patterns

Seed data is essential for development and testing. Here is a comprehensive seed script for TeamBoard:

```typescript
// scripts/seed.ts
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from '../src/lib/server/schema';
import bcrypt from 'bcryptjs';

const client = createClient({ url: 'file:./data/teamboard.db' });
const db = drizzle(client);

async function seed() {
  console.log('Seeding TeamBoard...');

  // ===== Users =====
  const passwordHash = await bcrypt.hash('password123', 12);
  const now = new Date();

  const [alice, bob, carol] = await db.insert(schema.users).values([
    { email: 'alice@example.com', name: 'Alice Chen', passwordHash, createdAt: now },
    { email: 'bob@example.com', name: 'Bob Smith', passwordHash, createdAt: now },
    { email: 'carol@example.com', name: 'Carol Diaz', passwordHash, createdAt: now }
  ]).returning();

  // ===== Team =====
  const [team] = await db.insert(schema.teams).values({
    name: 'Acme Engineering',
    slug: 'acme-engineering',
    description: 'Building the future, one sprint at a time.',
    ownerId: alice.id,
    createdAt: now
  }).returning();

  // ===== Team Members =====
  await db.insert(schema.teamMembers).values([
    { teamId: team.id, userId: alice.id, role: 'owner', joinedAt: now },
    { teamId: team.id, userId: bob.id, role: 'admin', joinedAt: now },
    { teamId: team.id, userId: carol.id, role: 'member', joinedAt: now }
  ]);

  // ===== Board =====
  const [board] = await db.insert(schema.boards).values({
    teamId: team.id,
    name: 'Sprint 23',
    description: 'Authentication and dashboard features',
    createdBy: alice.id,
    createdAt: now
  }).returning();

  // ===== Columns =====
  const [backlog, todo, inProgress, done] = await db.insert(schema.columns).values([
    { boardId: board.id, name: 'Backlog', position: 0, color: '#94a3b8' },
    { boardId: board.id, name: 'To Do', position: 1, color: '#3b82f6' },
    { boardId: board.id, name: 'In Progress', position: 2, color: '#f59e0b' },
    { boardId: board.id, name: 'Done', position: 3, color: '#22c55e' }
  ]).returning();

  // ===== Tasks =====
  await db.insert(schema.tasks).values([
    { columnId: todo.id, boardId: board.id, title: 'Set up authentication', description: 'Implement login/signup with session cookies', priority: 'high', assigneeId: alice.id, position: 0, createdBy: alice.id, createdAt: now, updatedAt: now },
    { columnId: todo.id, boardId: board.id, title: 'Design dashboard layout', priority: 'medium', assigneeId: bob.id, position: 1, createdBy: alice.id, createdAt: now, updatedAt: now },
    { columnId: inProgress.id, boardId: board.id, title: 'Build Kanban board component', description: 'Drag and drop between columns', priority: 'high', assigneeId: bob.id, position: 0, createdBy: alice.id, createdAt: now, updatedAt: now },
    { columnId: inProgress.id, boardId: board.id, title: 'API endpoints for tasks', priority: 'high', assigneeId: carol.id, position: 1, createdBy: bob.id, createdAt: now, updatedAt: now },
    { columnId: done.id, boardId: board.id, title: 'Project scaffolding', priority: 'medium', position: 0, createdBy: alice.id, createdAt: now, updatedAt: now },
    { columnId: done.id, boardId: board.id, title: 'Database schema design', priority: 'medium', position: 1, createdBy: alice.id, createdAt: now, updatedAt: now },
    { columnId: backlog.id, boardId: board.id, title: 'Real-time updates with SSE', priority: 'low', position: 0, createdBy: alice.id, createdAt: now, updatedAt: now },
    { columnId: backlog.id, boardId: board.id, title: 'Command palette (Cmd+K)', priority: 'low', position: 1, createdBy: bob.id, createdAt: now, updatedAt: now }
  ]);

  console.log('Seed complete!');
  console.log(`  Users: alice@example.com, bob@example.com, carol@example.com`);
  console.log(`  Password: password123`);
  console.log(`  Team: ${team.slug}`);
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
```

## Environment Variables

TeamBoard uses all four `$env` module types. Create a `.env` file at the project root:

```bash
# .env

# $env/static/private — baked into server bundle at build time
DATABASE_URL=file:./data/teamboard.db
SESSION_SECRET=your-secret-key-change-in-production

# $env/static/public — baked into client bundle (PUBLIC_ prefix)
PUBLIC_APP_NAME=TeamBoard
PUBLIC_APP_URL=http://localhost:5173

# $env/dynamic/private — read at runtime, server-only
# These are set in the deployment environment, not in .env
# DEPLOY_REGION, SENTRY_DSN, etc.

# $env/dynamic/public — read at runtime, available to client
# PUBLIC_WS_URL, PUBLIC_FEATURE_FLAGS, etc.
```

### Understanding the Four $env Modules

```typescript
// Server-only, build-time — database URL, secrets
import { DATABASE_URL, SESSION_SECRET } from '$env/static/private';
// These values are inlined at build time. The variable name disappears from
// the bundle — it becomes the literal string value. If DATABASE_URL changes,
// you must rebuild.

// Client-safe, build-time — app name shown in UI
import { PUBLIC_APP_NAME } from '$env/static/public';
// Also inlined at build time, but safe to include in client-side code.
// Available in both server and client.

// Server-only, runtime — changes per deployment without rebuild
import { env } from '$env/dynamic/private';
const region = env.DEPLOY_REGION ?? 'us-east-1';
// These read from process.env at runtime. You can change them by setting
// environment variables in your deployment platform without rebuilding.

// Client-safe, runtime — feature flags that change without redeploy
import { env } from '$env/dynamic/public';
const wsUrl = env.PUBLIC_WS_URL ?? 'ws://localhost:5173';
// Runtime values available on both server and client. Useful for feature
// flags that you toggle without a redeploy.
```

### When to Use Which

| Variable Type | Static (build-time) | Dynamic (runtime) |
|---|---|---|
| **Private** (server-only) | Database URLs, API keys, signing secrets | Deploy region, Sentry DSN, feature flags |
| **Public** (client-safe) | App name, public API URLs | WebSocket URLs, A/B test flags |

The static modules are tree-shaken and inlined at build time -- the actual values never appear in your source code at runtime. The dynamic modules read from `process.env` at runtime, so you can change them per deployment without rebuilding.

### WRONG: Using the Wrong Module

```typescript
// WRONG — secret key in client-safe module
import { PUBLIC_SESSION_SECRET } from '$env/static/public';
// Anyone can see this in the browser's JavaScript bundle

// WRONG — build-time module for values that change per deployment
import { SENTRY_DSN } from '$env/static/private';
// If your staging and production DSNs differ, you need to rebuild for each

// CORRECT
import { SESSION_SECRET } from '$env/static/private';  // Server-only, inlined
import { env } from '$env/dynamic/private';
const sentryDsn = env.SENTRY_DSN;  // Server-only, runtime
```

## SvelteKit Configuration

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-auto';
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

### Why Each Configuration Option Matters

**`alias`** entries let you write `import { draggable } from '$actions/drag'` instead of `import { draggable } from '../../../lib/actions/drag'`. Deep relative paths are fragile -- moving a file breaks every import. Aliases are stable regardless of file location.

**`csrf.checkOrigin`** is `true` by default, but setting it explicitly documents that you have considered CSRF protection. It rejects POST requests where the Origin header does not match your app's URL.

**`version.name`** changes on every build, which powers the "new version available" banner. SvelteKit exposes this via `$app/stores`'s `updated` store -- when the version changes between the loaded page and the current deployment, `updated.current` becomes true.

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

### Route Parameter Design

The URL structure encodes the data hierarchy:

```
/acme-engineering/boards/1        → teamSlug=acme-engineering, boardId=1
/acme-engineering/settings        → team settings
/acme-engineering/activity        → team activity log
/help/getting-started/boards      → catch-all slug for help articles
```

Using `[teamSlug]` instead of `[teamId]` makes URLs human-readable and bookmarkable. The load function resolves the slug to a team ID by querying the database.

The `[...slug]` route for help pages is a catch-all that matches any depth of path segments. `/help/getting-started`, `/help/boards/creating`, and `/help/api/authentication/tokens` all route to the same page component, which uses the slug to load the correct content.

## Try It

1. Write the complete domain model for TeamBoard in your own words. Identify every entity, its attributes, and its relationships to other entities.

2. Create the full Drizzle schema with all tables, foreign keys, and the `uniqueIndex` on `teamMembers`. Add the relations declarations.

3. Derive TypeScript types from the schema using `InferSelectModel` and `InferInsertModel`. Create composite types for `BoardWithColumns` and `TaskWithAssignee`.

4. Write a seed script that creates 3 users, 1 team, 1 board with 4 columns, and at least 8 tasks distributed across the columns. Include at least one task with an assignee and one with a due date.

5. Set up the environment variables with all four `$env` module types. Write a small test in a load function that imports from each module to verify they work.

6. Configure the SvelteKit aliases and verify you can import from `$components`, `$server`, and `$state` without relative paths.

## Key Takeaways

- **Plan features and schema before writing code** -- the database design shapes everything that follows, and schema changes are expensive after you have built features on top of them
- **Domain analysis identifies entities and relationships** -- the many-to-many User-Team relationship with roles, the deliberate denormalization of `boardId` on tasks, and the JSON metadata on activity logs are all domain-driven decisions
- **Derive TypeScript types from the Drizzle schema** with `InferSelectModel` and `InferInsertModel` -- this guarantees type safety between database and application code without manual synchronization
- **Drizzle relations enable relational queries** -- a single `findFirst` with nested `with` clauses replaces multiple manual queries and joins
- Use all four `$env` modules for their intended purpose: **static for build-time constants, dynamic for runtime configuration, private for secrets, public for client-visible values**
- **The `slug` pattern** makes URLs human-readable and prevents enumeration attacks -- trade a database query for better UX and security
- SvelteKit config aliases keep imports clean as the project grows -- `$components/ui/Button` is clearer and more stable than `../../../lib/components/ui/Button`
- The `version.name` config enables **deployment detection in the client** -- used for "new version available" banners
- The route structure uses **layout groups** to separate authenticated and public sections without affecting URLs
- **Seed data is not optional** -- developing against an empty database hides bugs and wastes time
- Store **positions as integers** for ordered lists (columns, tasks) -- allows insertion between existing items without reordering everything
