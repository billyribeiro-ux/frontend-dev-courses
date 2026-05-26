# Role-Based Access with Hooks & Context

Not everyone on a team should be able to do everything. Owners manage billing and can delete the team. Admins invite members and configure settings. Members create and edit tasks. Viewers can see the board but cannot change anything. This lesson builds a complete permission system using hooks, context, and error pages — so TeamBoard enforces access control at every layer.

## The Architecture: Defense in Depth

A principal engineer designs access control in layers. No single layer is sufficient on its own:

```
┌──────────────────────────────────────────────────┐
│  Layer 1: UI (Context + Conditional Rendering)   │  Hides buttons, links
│  Prevents confusion, not abuse                   │
├──────────────────────────────────────────────────┤
│  Layer 2: Route Guards (+page.server.ts)         │  Blocks unauthorized pages
│  Prevents navigation to restricted pages         │
├──────────────────────────────────────────────────┤
│  Layer 3: API Authorization (handlers + hooks)   │  Enforces permissions on mutations
│  Prevents unauthorized data changes              │
├──────────────────────────────────────────────────┤
│  Layer 4: Database Constraints (row-level)       │  Foreign keys, policies
│  Last line of defense                            │
└──────────────────────────────────────────────────┘
```

Layer 1 (UI) prevents confusion — users do not see actions they cannot perform. Layer 2 (route guards) prevents direct URL access. Layer 3 (API) prevents crafted HTTP requests. Layer 4 (database) prevents bugs in your own code. You need all of them. Skipping any layer creates a gap that is either confusing (missing UI checks) or exploitable (missing server checks).

## The Permissions Map

Start with a clear definition of what each role can do. This lives in a shared module that both server and client code can import:

```typescript
// src/lib/permissions.ts
export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  // Team management
  delete_team:      ['owner'],
  manage_billing:   ['owner'],
  manage_settings:  ['owner', 'admin'],
  manage_members:   ['owner', 'admin'],

  // Board operations
  create_board:     ['owner', 'admin', 'member'],
  edit_board:       ['owner', 'admin', 'member'],
  delete_board:     ['owner', 'admin'],

  // Task operations
  create_task:      ['owner', 'admin', 'member'],
  edit_task:        ['owner', 'admin', 'member'],
  delete_task:      ['owner', 'admin'],
  move_task:        ['owner', 'admin', 'member'],

  // View-only
  view_board:       ['owner', 'admin', 'member', 'viewer'],
  view_activity:    ['owner', 'admin', 'member', 'viewer'],

  // Comments
  add_comment:      ['owner', 'admin', 'member'],
  delete_comment:   ['owner', 'admin']
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: Role, action: Permission): boolean {
  const allowedRoles = PERMISSIONS[action];
  return (allowedRoles as readonly string[]).includes(role);
}
```

### Why `satisfies` Instead of a Type Annotation

The `satisfies` keyword ensures every permission maps to an array of valid roles without widening the type. If you used a type annotation (`const PERMISSIONS: Record<string, Role[]>`), you would lose the literal types — TypeScript would not know that `delete_team` only allows `'owner'`. With `satisfies`, the literal tuple types are preserved, enabling precise type checking downstream.

### WRONG vs CORRECT: Permission Map Design

```typescript
// WRONG — permissions as booleans per role
const PERMISSIONS = {
  owner: { delete_team: true, manage_billing: true, edit_task: true },
  admin: { delete_team: false, manage_billing: false, edit_task: true },
  // ... every role × every permission — combinatorial explosion
};
// Adding a new permission requires editing every role entry.

// CORRECT — permissions mapped to their allowed roles
const PERMISSIONS = {
  delete_team: ['owner'],
  manage_billing: ['owner'],
  edit_task: ['owner', 'admin', 'member'],
  // Adding a new permission = adding one line
};
// The question is "who can do X?" not "what can role Y do?"
```

The permission-centric approach scales better. Adding a new permission is one line. Adding a new role requires reviewing each permission — which is exactly right, because you need to consciously decide what the new role can do.

The `hasPermission` function is a pure check — give it a role and an action, and it tells you yes or no. This function works on both server and client because it has no dependencies on SvelteKit or the database.

## Fetching the User's Role

The `handle` hook from Module 44 already attaches `event.locals.user` on every request. Now extend the team layout's load function to also fetch the user's role for the current team:

```typescript
// src/routes/(app)/[teamSlug]/+layout.server.ts
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/database';
import { teams, teamMembers } from '$lib/server/schema';
import { eq, and } from 'drizzle-orm';

export const load: LayoutServerLoad = async ({ locals, params }) => {
  if (!locals.user) {
    error(401, 'Not authenticated');
  }

  // Find the team by slug
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.slug, params.teamSlug))
    .limit(1);

  if (!team) {
    error(404, 'Team not found');
  }

  // Find the user's membership and role
  const [membership] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, team.id),
        eq(teamMembers.userId, locals.user.id)
      )
    )
    .limit(1);

  if (!membership) {
    error(403, "You don't have access to this team");
  }

  return {
    team,
    userRole: membership.role as import('$lib/permissions').Role
  };
};
```

This load function runs for every page under `/(app)/[teamSlug]/`. It verifies the team exists, confirms the user is a member, and returns both the team data and the user's role. If the user is not a member, they get a 403 immediately — they never see the team layout at all.

### Why This Must Be a Layout Load, Not a Page Load

The role check lives in `+layout.server.ts` (not `+page.server.ts`) because *every* page under `[teamSlug]` needs it — boards, settings, activity, members. Layout loads run once for the group and pass data to all child pages. If you put this in a page load, you would duplicate the team membership query in every page.

## Building the Permission Context

> **Tip:** Svelte now provides `createContext()` as a newer alternative to `setContext`/`getContext`. It returns a `[get, set]` pair and handles Symbol keys automatically: `const [getPermissions, setPermissions] = createContext<PermissionContext>()`. The manual `setContext`/`getContext` pattern shown below remains fully supported.

With the role available in layout data, set up a Svelte context that any child component can consume. Use a typed Symbol key to prevent collisions and ensure type safety:

```typescript
// src/lib/context/permissions.ts
import { setContext, getContext, hasContext } from 'svelte';
import { hasPermission as checkPermission, type Role, type Permission } from '$lib/permissions';

interface PermissionContext {
  role: Role;
  hasPermission: (action: Permission) => boolean;
  isAtLeast: (minimumRole: Role) => boolean;
}

const PERMISSION_KEY = Symbol('permissions');

const ROLE_HIERARCHY: Record<Role, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3
};

export function setPermissionContext(role: Role): PermissionContext {
  const ctx: PermissionContext = {
    role,
    hasPermission: (action) => checkPermission(role, action),
    isAtLeast: (minimumRole) => ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minimumRole]
  };

  setContext(PERMISSION_KEY, ctx);
  return ctx;
}

export function getPermissionContext(): PermissionContext {
  return getContext<PermissionContext>(PERMISSION_KEY);
}

export function hasPermissionContext(): boolean {
  return hasContext(PERMISSION_KEY);
}
```

Three functions, each serving a distinct purpose:

- **`setPermissionContext(role)`** creates and stores the context. Called once in the team layout.
- **`getPermissionContext()`** retrieves the context. Called in any child component that needs permission checks.
- **`hasPermissionContext()`** checks whether the context exists at all. Useful for shared components that might render outside a team.

The `isAtLeast` helper uses a role hierarchy for cases where you want "admin or higher" without listing every permission individually.

### Why Symbol Keys Instead of Strings

```typescript
// WRONG — string key can collide with other libraries or typos
setContext('permissions', ctx);
const ctx = getContext('permisions');  // Typo returns undefined silently

// CORRECT — Symbol is unique, typos cause compile errors
const PERMISSION_KEY = Symbol('permissions');
setContext(PERMISSION_KEY, ctx);
// Using the wrong key is impossible because you import the constant
```

Symbol keys are unique by definition — no two `Symbol('permissions')` values are equal. Combined with TypeScript generics on `getContext<PermissionContext>`, you get both runtime uniqueness and compile-time type safety.

## Setting Context in the Team Layout

Wire the context into the team layout component so every child page and component inherits it:

```svelte
<!-- src/routes/(app)/[teamSlug]/+layout.svelte -->
<script lang="ts">
  import { setPermissionContext } from '$lib/context/permissions';

  let { data, children } = $props();

  // Set the permission context for all child components
  const permissions = setPermissionContext(data.userRole);
</script>

<div class="flex h-full">
  <!-- Team sidebar -->
  <aside class="w-56 border-r bg-white dark:bg-gray-800 p-4">
    <h2 class="font-semibold text-lg mb-4">{data.team.name}</h2>

    <nav class="space-y-1">
      <a href="/{data.team.slug}/boards" class="block px-3 py-2 rounded-lg hover:bg-gray-100">
        Boards
      </a>

      <a href="/{data.team.slug}/activity" class="block px-3 py-2 rounded-lg hover:bg-gray-100">
        Activity
      </a>

      {#if permissions.hasPermission('manage_settings')}
        <a href="/{data.team.slug}/settings" class="block px-3 py-2 rounded-lg hover:bg-gray-100">
          Settings
        </a>
      {/if}

      {#if permissions.hasPermission('manage_members')}
        <a href="/{data.team.slug}/members" class="block px-3 py-2 rounded-lg hover:bg-gray-100">
          Members
        </a>
      {/if}
    </nav>

    <div class="mt-auto pt-4 text-xs text-gray-400">
      Your role: {data.userRole}
    </div>
  </aside>

  <!-- Page content -->
  <div class="flex-1 overflow-auto p-6">
    {@render children()}
  </div>
</div>
```

Notice how the sidebar already uses the permission context. The "Settings" and "Members" links only appear if the user has the corresponding permission. A viewer sees just "Boards" and "Activity".

## Consuming Context in Child Components

Any component inside the team layout tree can call `getPermissionContext()` to make permission-based decisions:

```svelte
<!-- src/lib/components/board/TaskCard.svelte -->
<script lang="ts">
  import { getPermissionContext } from '$lib/context/permissions';

  let { task } = $props();

  const permissions = getPermissionContext();
</script>

<div class="p-3 bg-white rounded-lg shadow-sm border">
  <h3 class="font-medium">{task.title}</h3>
  <p class="text-sm text-gray-500 mt-1">{task.description}</p>

  {#if permissions.hasPermission('edit_task')}
    <div class="mt-2 flex gap-2">
      <button class="text-xs text-indigo-600 hover:underline">Edit</button>

      {#if permissions.hasPermission('delete_task')}
        <button class="text-xs text-red-600 hover:underline">Delete</button>
      {/if}
    </div>
  {/if}

  {#if !permissions.hasPermission('move_task')}
    <p class="text-xs text-gray-400 mt-2 italic">View only</p>
  {/if}
</div>
```

The task card renders differently depending on the user's role. A member sees "Edit" but not "Delete". A viewer sees neither — just the task content with a "View only" label. An admin sees both buttons.

### Building a PermissionGate Component

For cleaner templates, create a reusable gate component:

```svelte
<!-- src/lib/components/ui/PermissionGate.svelte -->
<script lang="ts">
  import { getPermissionContext } from '$lib/context/permissions';
  import type { Permission } from '$lib/permissions';
  import type { Snippet } from 'svelte';

  interface Props {
    action: Permission;
    children: Snippet;
    fallback?: Snippet;
  }

  let { action, children, fallback }: Props = $props();

  const permissions = getPermissionContext();
  const allowed = permissions.hasPermission(action);
</script>

{#if allowed}
  {@render children()}
{:else if fallback}
  {@render fallback()}
{/if}
```

Use it to wrap any permission-sensitive UI:

```svelte
<script lang="ts">
  import PermissionGate from '$lib/components/ui/PermissionGate.svelte';
</script>

<PermissionGate action="delete_task">
  <button class="text-red-600">Delete Task</button>

  {#snippet fallback()}
    <span class="text-gray-400 text-xs">Insufficient permissions</span>
  {/snippet}
</PermissionGate>
```

## Using hasContext for Shared Components

Some components might be used both inside and outside a team context. A `<UserAvatar>` component might appear in the global header (no team context) and on a team board (with team context). Use `hasPermissionContext()` to handle both cases gracefully:

```svelte
<!-- src/lib/components/ui/MemberActions.svelte -->
<script lang="ts">
  import { hasPermissionContext, getPermissionContext } from '$lib/context/permissions';

  let { member } = $props();

  // Check if we are inside a team context
  const inTeamContext = hasPermissionContext();
  const permissions = inTeamContext ? getPermissionContext() : null;

  // Determine what actions are available
  const canManage = permissions?.hasPermission('manage_members') ?? false;
  const canRemove = permissions?.isAtLeast('admin') ?? false;
</script>

<div class="flex items-center gap-3 py-2">
  <img
    src={member.avatarUrl ?? '/default-avatar.png'}
    alt={member.name}
    class="w-8 h-8 rounded-full"
  />
  <div class="flex-1">
    <p class="text-sm font-medium">{member.name}</p>
    <p class="text-xs text-gray-500">{member.email}</p>
  </div>

  {#if canManage}
    <select class="text-sm border rounded px-2 py-1">
      <option value="member">Member</option>
      <option value="admin">Admin</option>
      <option value="viewer">Viewer</option>
    </select>
  {:else}
    <span class="text-xs text-gray-400">{member.role}</span>
  {/if}

  {#if canRemove}
    <button class="text-xs text-red-600 hover:underline">Remove</button>
  {/if}
</div>
```

When this component is rendered outside a team (say, in a global user directory), `hasPermissionContext()` returns `false`, `permissions` is `null`, and the component falls back to read-only mode. No role dropdown, no remove button. When it is rendered inside a team layout, the full permission checks activate.

This is a much better pattern than passing a `readOnly` prop from every parent. The component adapts to its environment automatically.

## Server-Side Authorization — The Security Layer

The UI hides buttons from unauthorized users, but that is not real security. Anyone can craft an HTTP request. The server must enforce permissions too.

### API Route Authorization

In your API routes or remote function handlers, always verify the role:

```typescript
// src/lib/api/team.remote.ts
import { command } from '$app/server';
import * as v from 'valibot';
import { hasPermission } from '$lib/permissions';
import { error } from '@sveltejs/kit';

export const deleteTask = command(
  v.object({ taskId: v.number() }),
  async ({ taskId }, { locals }) => {
    if (!locals.user) {
      error(401, 'Not authenticated');
    }

    if (!locals.teamRole || !hasPermission(locals.teamRole, 'delete_task')) {
      error(403, 'You do not have permission to delete tasks');
    }

    await db.delete(tasks).where(eq(tasks.id, taskId));
  }
);
```

### WRONG vs CORRECT: Server-Side Authorization

```typescript
// WRONG — trusting the client to only send requests it is authorized for
export const deleteTask = command(
  v.object({ taskId: v.number() }),
  async ({ taskId }) => {
    // No permission check — any authenticated user can delete any task
    await db.delete(tasks).where(eq(tasks.id, taskId));
  }
);
// A viewer can open DevTools, find the API endpoint, and delete tasks.

// CORRECT — always verify on the server
export const deleteTask = command(
  v.object({ taskId: v.number() }),
  async ({ taskId }, { locals }) => {
    if (!locals.user) error(401, 'Not authenticated');
    if (!hasPermission(locals.teamRole, 'delete_task')) {
      error(403, 'You do not have permission to delete tasks');
    }
    await db.delete(tasks).where(eq(tasks.id, taskId));
  }
);
```

The UI check prevents confusion. The server check prevents abuse. Both are necessary.

### Preventing Privilege Escalation

A critical edge case: a member should not be able to assign themselves the admin role. Always validate that the acting user has sufficient privilege for the operation:

```typescript
export const updateMemberRole = command(
  v.object({ memberId: v.number(), newRole: v.string() }),
  async ({ memberId, newRole }, { locals }) => {
    if (!locals.user) error(401, 'Not authenticated');
    if (!hasPermission(locals.teamRole, 'manage_members')) {
      error(403, 'Cannot manage members');
    }

    // Privilege escalation check: cannot assign a role higher than your own
    const ROLE_LEVEL: Record<string, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };
    const actorLevel = ROLE_LEVEL[locals.teamRole] ?? 0;
    const targetLevel = ROLE_LEVEL[newRole] ?? 0;

    if (targetLevel >= actorLevel) {
      error(403, 'Cannot assign a role equal to or higher than your own');
    }

    await db.update(teamMembers)
      .set({ role: newRole })
      .where(eq(teamMembers.id, memberId));
  }
);
```

## Server-Side Access Guards for Pages

Some pages should be entirely off-limits based on role. The settings page, for instance, should only be accessible to owners and admins. Add a server load function that checks permissions before the page renders:

```typescript
// src/routes/(app)/[teamSlug]/settings/+page.server.ts
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { hasPermission } from '$lib/permissions';
import type { Role } from '$lib/permissions';

export const load: PageServerLoad = async ({ parent }) => {
  const { userRole } = await parent();

  if (!hasPermission(userRole as Role, 'manage_settings')) {
    error(403, "You don't have permission to view this page");
  }

  // Load settings-specific data
  return {
    // ... billing info, invite tokens, etc.
  };
};
```

The `parent()` call retrieves data from the team layout's load function, which includes `userRole`. If the user does not have the `manage_settings` permission, SvelteKit throws a 403 and renders the nearest error page.

### Route Guard vs UI Check — Use Both

```svelte
<!-- In the sidebar (UI check — Layer 1) -->
{#if permissions.hasPermission('manage_settings')}
  <a href="/{data.team.slug}/settings">Settings</a>
{/if}

<!-- In +page.server.ts (Route guard — Layer 2) -->
<!-- if (!hasPermission(userRole, 'manage_settings')) error(403); -->
```

The UI check hides the link, so most users never try to navigate to settings. But a savvy user could type the URL directly, or bookmark it from when they were an admin. The route guard catches that case.

## Custom 403 Error Page

When a viewer tries to access `/acme-team/settings` directly (by typing the URL, for example), the server returns a 403. Build a custom error page inside the team layout to handle this case:

```svelte
<!-- src/routes/(app)/[teamSlug]/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

<div class="max-w-md mx-auto mt-16 text-center">
  {#if page.status === 403}
    <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
      <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m0 0v2m0-2h2m-2 0H10m2-6V4" />
      </svg>
    </div>

    <h1 class="text-2xl font-bold mb-2">Access Denied</h1>
    <p class="text-gray-600 mb-4">
      You don't have permission to view this page. Your current role
      does not include the required access level.
    </p>
    <p class="text-sm text-gray-500 mb-6">
      Contact your team owner or admin to request elevated permissions.
    </p>

  {:else if page.status === 404}
    <h1 class="text-2xl font-bold mb-2">Page Not Found</h1>
    <p class="text-gray-600 mb-4">
      This page doesn't exist in your team workspace.
    </p>

  {:else}
    <h1 class="text-2xl font-bold mb-2">Something Went Wrong</h1>
    <p class="text-gray-600 mb-4">{page.error?.message}</p>

    {#if page.error?.errorId}
      <p class="text-sm text-gray-400 mb-4">Error ID: {page.error.errorId}</p>
    {/if}
  {/if}

  <a
    href="/{page.params.teamSlug}/boards"
    class="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
  >
    Back to Boards
  </a>
</div>
```

Because this error page is inside `/(app)/[teamSlug]/`, it inherits the team layout with the sidebar. The user sees the familiar team navigation alongside the error message. This is much better than dumping them on a generic full-page error screen.

The error page handles three cases: 403 (access denied with a helpful message), 404 (page not found within the team), and everything else (generic error with the tracking ID from `handleError`).

## The Complete Permission Flow

Here is how every layer works together when a viewer tries to access the settings page:

```
1. Browser requests /(app)/acme-team/settings
2. handle hook attaches event.locals.user (from session cookie)
3. [teamSlug]/+layout.server.ts loads team + userRole ("viewer")
4. [teamSlug]/settings/+page.server.ts calls parent(), gets userRole
5. hasPermission("viewer", "manage_settings") returns false
6. error(403) is thrown
7. SvelteKit finds [teamSlug]/+error.svelte (nearest error page)
8. Error page renders inside the team layout with "Access Denied"
```

And when the same viewer navigates within their allowed pages:

```
1. Browser requests /(app)/acme-team/boards
2. handle hook attaches event.locals.user
3. [teamSlug]/+layout.server.ts loads team + userRole ("viewer")
4. boards/+page.svelte renders with permission context
5. TaskCard components check hasPermission('edit_task') — false for viewer
6. Edit/Delete buttons are hidden, "View only" label appears
```

And when the same viewer tries to delete a task via a crafted HTTP request:

```
1. POST /api/tasks/delete { taskId: 42 }
2. handle hook attaches event.locals.user
3. deleteTask handler checks hasPermission('viewer', 'delete_task') → false
4. error(403, 'You do not have permission to delete tasks')
5. Request is rejected — task is safe
```

The permission check happens at multiple levels: page-level server guards prevent unauthorized page loads entirely, component-level context checks control which UI elements are visible, and API-level checks prevent unauthorized mutations. Together they create a complete authorization system.

## Role-Based Conditional Styling

Beyond showing/hiding elements, permissions can affect *how* elements appear:

```svelte
<script lang="ts">
  import { getPermissionContext } from '$lib/context/permissions';
  let { task } = $props();
  const permissions = getPermissionContext();
</script>

<div
  class="task-card"
  class:draggable={permissions.hasPermission('move_task')}
  class:read-only={!permissions.hasPermission('edit_task')}
  draggable={permissions.hasPermission('move_task') ? 'true' : undefined}
>
  <h3 class:editable={permissions.hasPermission('edit_task')}>
    {task.title}
  </h3>
</div>

<style>
  .task-card {
    padding: 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid #e2e8f0;
  }

  .task-card.draggable {
    cursor: grab;
  }

  .task-card.draggable:active {
    cursor: grabbing;
  }

  .task-card.read-only {
    opacity: 0.85;
    border-style: dashed;
  }

  .editable:hover {
    text-decoration: underline;
    cursor: text;
  }
</style>
```

Viewers see tasks with dashed borders and no drag cursor. Members see solid borders with a grab cursor. The visual treatment communicates capability before the user even tries to interact.

## Try It

Extend the permission system with these exercises:

1. Add a `transfer_ownership` permission that only the `owner` role has. Build a "Transfer Ownership" button in the settings page that is only visible to the owner, and wire it to a `command()` that changes the team's `ownerId` and swaps the roles of the old and new owner. Include privilege escalation protection — the new owner must currently be an admin.
2. Create the `<PermissionGate>` wrapper component described above with `action`, `children`, and `fallback` snippets. Use it in at least three different components to verify it works with different permissions.
3. Add a `manage_roles` permission for adjusting other members' roles. Ensure that no one can assign a role higher than their own (a member cannot make someone an admin). Implement this check both in the UI (disable role options above the current user's level in the select dropdown) and on the server (return `error(403)` if the assigned role is >= the actor's role).
4. Test the 403 flow by logging in as a viewer and navigating directly to `/[teamSlug]/settings`. Verify the error page renders inside the team layout.
5. Build an "Activity Log" that records permission-related events: "Alex changed Jordan's role from member to admin." Use the notification context to show a toast when a role change succeeds.
6. Create a shared `<ActionMenu>` component that uses `hasPermissionContext()` to adapt — showing full actions inside a team and read-only mode outside a team. Test it in both contexts.

## Key Takeaways

- Define permissions as a plain map of actions to allowed roles — this is portable, testable, and usable on both server and client
- Use `satisfies` on the permissions map to preserve literal tuple types while ensuring correctness
- The team layout's load function fetches the user's role once; every child page and component inherits it
- `setContext` with a typed Symbol key provides the permission checker to the entire component tree — symbols prevent collisions, generics provide type safety
- `getContext` in child components enables conditional rendering: `{#if permissions.hasPermission('manage_members')}`
- `hasContext` lets shared components adapt to both team and non-team contexts without prop changes
- Build a `<PermissionGate>` component for cleaner permission-based rendering with `children` and `fallback` snippets
- Always enforce permissions on the server too — UI checks prevent confusion, server checks prevent abuse
- Prevent privilege escalation: users cannot assign roles equal to or higher than their own
- Custom `+error.svelte` inside the team route renders 403 pages with the team layout intact, providing a polished experience
- The `error()` function in load functions and remote handlers triggers the nearest error page in the route tree
- Use `$app/state` (not `$app/stores`) to access `page.status` and `page.error` in error pages
- Defense in depth: UI layer hides actions, route guards block pages, API handlers reject requests, database constraints prevent corruption
