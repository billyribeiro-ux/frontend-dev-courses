# Role-Based Access with Hooks & Context

Not everyone on a team should be able to do everything. Owners manage billing and can delete the team. Admins invite members and configure settings. Members create and edit tasks. Viewers can see the board but cannot change anything. This lesson builds a complete permission system using hooks, context, and error pages — so TeamBoard enforces access control at every layer.

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

The `satisfies` keyword ensures every permission maps to an array of valid roles without widening the type. The `hasPermission` function is a pure check — give it a role and an action, and it tells you yes or no. This function works on both server and client because it has no dependencies on SvelteKit or the database.

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

## Building the Permission Context

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

This pattern works for any UI element: form buttons, action menus, drag handles, inline editors. The component asks "does this user have permission to do X?" and renders accordingly.

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

## Server-Side Authorization with handleFetch

The UI hides buttons from unauthorized users, but that is not real security. Anyone can craft an HTTP request. The server must enforce permissions too.

The `handleFetch` hook (set up in Module 44) already forwards cookies on internal requests. Extend it to also include the user's team role as a header, so API routes can check permissions without a separate database query:

```typescript
// src/hooks.server.ts (extending the existing handleFetch)
export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
  if (request.url.startsWith(event.url.origin)) {
    // Forward cookies for session auth
    const cookie = event.request.headers.get('cookie');
    if (cookie) {
      request.headers.set('cookie', cookie);
    }

    // Forward the team role if available (set by team layout load function)
    // This avoids re-querying the database in every API route
    if (event.locals.teamRole) {
      request.headers.set('x-team-role', event.locals.teamRole);
    }
  }

  return fetch(request);
};
```

Update `app.d.ts` to include the team role:

```typescript
// src/app.d.ts
declare global {
  namespace App {
    interface Locals {
      user: import('$server/auth').SessionUser | null;
      teamRole?: import('$lib/permissions').Role;
    }
  }
}
```

And in your API routes or remote function handlers, always verify the role:

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

The UI check prevents confusion. The server check prevents abuse. Both are necessary.

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

## Custom 403 Error Page

When a viewer tries to access `/acme-team/settings` directly (by typing the URL, for example), the server returns a 403. Build a custom error page inside the team layout to handle this case:

```svelte
<!-- src/routes/(app)/[teamSlug]/+error.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
</script>

<div class="max-w-md mx-auto mt-16 text-center">
  {#if $page.status === 403}
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

  {:else if $page.status === 404}
    <h1 class="text-2xl font-bold mb-2">Page Not Found</h1>
    <p class="text-gray-600 mb-4">
      This page doesn't exist in your team workspace.
    </p>

  {:else}
    <h1 class="text-2xl font-bold mb-2">Something Went Wrong</h1>
    <p class="text-gray-600 mb-4">{$page.error?.message}</p>

    {#if $page.error?.errorId}
      <p class="text-sm text-gray-400 mb-4">Error ID: {$page.error.errorId}</p>
    {/if}
  {/if}

  <a
    href="/{$page.params.teamSlug}/boards"
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

The permission check happens at multiple levels: page-level server guards prevent unauthorized page loads entirely, and component-level context checks control which UI elements are visible. Together they create a complete authorization system.

## Try It

Extend the permission system with these exercises:

1. Add a `transfer_ownership` permission that only the `owner` role has. Build a "Transfer Ownership" button in the settings page that is only visible to the owner, and wire it to a `command()` that changes the team's `ownerId` and swaps the roles of the old and new owner.
2. Create a `<PermissionGate>` wrapper component that accepts an `action` prop and only renders its children if the current user has that permission. Use it like `<PermissionGate action="delete_task">...</PermissionGate>`. Fall back to a slot for the "no permission" case.
3. Add a `manage_roles` permission for adjusting other members' roles. Ensure that no one can assign a role higher than their own (a member cannot make someone an admin).
4. Test the 403 flow by logging in as a viewer and navigating directly to `/[teamSlug]/settings`.

## Key Takeaways

- Define permissions as a plain map of actions to allowed roles — this is portable, testable, and usable on both server and client
- The team layout's load function fetches the user's role once; every child page and component inherits it
- `setContext` with a typed Symbol key provides the permission checker to the entire component tree
- `getContext` in child components enables conditional rendering: `{#if permissions.hasPermission('manage_members')}`
- `hasContext` lets shared components adapt to both team and non-team contexts without prop changes
- `handleFetch` can forward role headers so internal API calls during SSR include authorization data
- Always enforce permissions on the server too — UI checks prevent confusion, server checks prevent abuse
- Custom `+error.svelte` inside the team route renders 403 pages with the team layout intact
- The `error()` function in load functions and remote handlers triggers the nearest error page in the route tree
