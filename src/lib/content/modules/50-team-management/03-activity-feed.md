# Activity Feed & Audit Log

Every action in TeamBoard leaves a trace. Tasks created, columns reordered, members invited, settings changed — the activity log captures all of it. This lesson builds the activity feed page with rest parameter routing, paginated queries, dynamic elements, computed display values, infinite scroll, and performance-optimized state management.

## Route Structure with Rest Parameters

The activity feed lives at `/(app)/[teamSlug]/activity/[...filters]/+page.svelte`. The `[...filters]` rest parameter captures an optional chain of filter segments from the URL. This gives you clean, bookmarkable filter URLs:

```
/acme-team/activity                    → all activity, no filters
/acme-team/activity/tasks              → all task-related activity
/acme-team/activity/tasks/created      → only task_created events
/acme-team/activity/members            → all member-related activity
/acme-team/activity/members/joined     → only member_joined events
```

Parse the rest parameter in the load function:

```typescript
// src/routes/(app)/[teamSlug]/activity/[...filters]/+page.ts
import type { PageLoad } from './$types';

export interface ActivityFilters {
  entityType?: string;   // 'tasks', 'members', 'boards', etc.
  action?: string;       // 'created', 'moved', 'joined', etc.
}

export const load: PageLoad = async ({ params }) => {
  const segments = params.filters ? params.filters.split('/') : [];

  const filters: ActivityFilters = {};

  if (segments.length >= 1) {
    filters.entityType = segments[0]; // 'tasks', 'members', etc.
  }

  if (segments.length >= 2) {
    filters.action = segments[1]; // 'created', 'moved', etc.
  }

  return { filters };
};
```

The `params.filters` value is an empty string when no segments are present, `'tasks'` for one segment, and `'tasks/created'` for two. Splitting on `/` gives you a clean array to work with. This is simpler than using query parameters and produces URLs that are easy to share and bookmark.

## Paginated Query with query()

The activity log can contain thousands of entries. Fetch them in pages using a `query()` remote function:

```typescript
// src/lib/api/activity.remote.ts
import { query } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/database';
import { activityLog, users } from '$lib/server/schema';
import { eq, and, desc, count, like } from 'drizzle-orm';

const ActivityQuerySchema = v.object({
  teamId: v.number(),
  page: v.pipe(v.number(), v.minValue(1)),
  pageSize: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(50)), 20),
  entityType: v.optional(v.string()),
  action: v.optional(v.string())
});

export const getActivityLog = query(ActivityQuerySchema, async (params) => {
  const conditions = [eq(activityLog.teamId, params.teamId)];

  if (params.entityType) {
    // Map URL-friendly names to database values
    // 'tasks' → entity_type LIKE 'task%'
    const typePrefix = params.entityType.replace(/s$/, ''); // 'tasks' → 'task'
    conditions.push(like(activityLog.entityType, `${typePrefix}%`));
  }

  if (params.action) {
    conditions.push(like(activityLog.action, `%${params.action}%`));
  }

  const where = and(...conditions);
  const offset = (params.page - 1) * params.pageSize;

  // Fetch activities with the user who performed them
  const activities = await db
    .select({
      id: activityLog.id,
      action: activityLog.action,
      entityType: activityLog.entityType,
      entityId: activityLog.entityId,
      metadata: activityLog.metadata,
      createdAt: activityLog.createdAt,
      userName: users.name,
      userEmail: users.email,
      userAvatar: users.avatarUrl
    })
    .from(activityLog)
    .innerJoin(users, eq(activityLog.userId, users.id))
    .where(where)
    .orderBy(desc(activityLog.createdAt))
    .limit(params.pageSize)
    .offset(offset);

  // Get total count for pagination
  const [{ total }] = await db
    .select({ total: count() })
    .from(activityLog)
    .where(where);

  return {
    activities,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.ceil(total / params.pageSize)
  };
});
```

The query accepts a page number, optional page size, and the same filters parsed from the URL. It returns the activities for the current page along with the total count so the UI knows whether more pages exist.

## The Activity Feed Page

Now build the page that ties routing, querying, and rendering together:

```svelte
<!-- src/routes/(app)/[teamSlug]/activity/[...filters]/+page.svelte -->
<script lang="ts">
  import { getActivityLog } from '$lib/api/activity.remote';
  import type { ActivityFilters } from './+page';

  let { data } = $props();

  // Activity entries stored with $state.raw for performance
  let activities = $state.raw<Activity[]>([]);
  let currentPage = $state(1);
  let totalPages = $state(1);
  let loading = $state(false);
  let hasMore = $derived(currentPage < totalPages);

  // Initial load and filter changes
  $effect(() => {
    // Reset when filters change
    activities = [];
    currentPage = 1;
    loadPage(1, data.filters);
  });

  async function loadPage(page: number, filters: ActivityFilters) {
    loading = true;

    const result = await getActivityLog({
      teamId: data.team.id,
      page,
      entityType: filters.entityType,
      action: filters.action
    });

    if (page === 1) {
      // First page — replace everything
      activities = result.activities;
    } else {
      // Subsequent pages — append to existing
      activities = [...activities, ...result.activities];
    }

    totalPages = result.totalPages;
    currentPage = page;
    loading = false;
  }

  function loadNextPage() {
    if (!loading && hasMore) {
      loadPage(currentPage + 1, data.filters);
    }
  }
</script>
```

Notice `$state.raw()` for the activities array. This is a deliberate performance decision that deserves its own explanation.

## Why $state.raw() for the Activity List

The `activities` array is large — potentially hundreds of entries after several pages of infinite scroll. With regular `$state`, Svelte wraps every object in the array with a reactive proxy. Every nested property (action, metadata, userName, createdAt) becomes individually reactive. That is powerful when you need to mutate individual items, but this list is never mutated in place. It is either replaced entirely (first page load) or extended (appending a new page).

`$state.raw()` skips the deep proxy. The array itself is reactive — Svelte re-renders when you assign a new array — but the individual objects inside it are plain JavaScript objects. For a list of 200 activity entries with 10 properties each, that is 2,000 fewer reactive proxies that Svelte does not need to create, track, or garbage collect.

The rule of thumb: use `$state.raw()` when you replace the entire value but never mutate nested properties. Activity logs, search results, and paginated lists are prime candidates.

```svelte
<!-- Replacing the entire array triggers re-render -->
activities = [...activities, ...newPage];       // Works with $state.raw

<!-- This would NOT trigger re-render with $state.raw -->
<!-- activities[0].action = 'updated';          // Do not do this -->
```

## Rendering with Dynamic Elements and {@const}

Each activity entry has a different type — task created, task moved, member invited — and needs a different icon and description. Use `<svelte:element>` for the dynamic icon wrapper and `{@const}` for computed display values:

```svelte
{#each activities as activity (activity.id)}
  {@const relativeTime = getRelativeTime(activity.createdAt)}
  {@const initials = activity.userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)}
  {@const description = formatActivityDescription(activity)}
  {@const iconConfig = getActivityIcon(activity.action)}

  <div class="flex gap-3 py-4 border-b border-gray-100 last:border-0">
    <!-- Dynamic icon wrapper: 'div' for most, 'a' for navigable activities -->
    <svelte:element
      this={iconConfig.linkTo ? 'a' : 'div'}
      href={iconConfig.linkTo}
      class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 {iconConfig.bgColor}"
    >
      <svg class="w-4 h-4 {iconConfig.textColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={iconConfig.path} />
      </svg>
    </svelte:element>

    <div class="flex-1 min-w-0">
      <p class="text-sm">
        <!-- User avatar or initials -->
        {#if activity.userAvatar}
          <img
            src={activity.userAvatar}
            alt={activity.userName}
            class="w-5 h-5 rounded-full inline-block mr-1 align-text-bottom"
          />
        {:else}
          <span class="inline-flex w-5 h-5 rounded-full bg-gray-200 text-xs items-center justify-center mr-1 align-text-bottom">
            {initials}
          </span>
        {/if}

        <span class="font-medium">{activity.userName}</span>
        <span class="text-gray-600">{description}</span>
      </p>

      <p class="text-xs text-gray-400 mt-0.5">{relativeTime}</p>
    </div>
  </div>

{:else}
  <!-- Empty state when no activities match -->
  <div class="text-center py-12">
    <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
      <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    </div>

    <h3 class="text-lg font-medium text-gray-900 mb-1">No activity found</h3>
    <p class="text-sm text-gray-500 mb-4">
      {#if data.filters.entityType || data.filters.action}
        No activity matches the current filters.
      {:else}
        This team doesn't have any recorded activity yet.
      {/if}
    </p>

    {#if data.filters.entityType || data.filters.action}
      <a
        href="/{data.team.slug}/activity"
        class="text-sm text-indigo-600 hover:underline"
      >
        Clear filters and show all activity
      </a>
    {/if}
  </div>
{/each}
```

Let's unpack the three `{@const}` declarations:

- **`relativeTime`** converts the timestamp to a human-friendly string like "2 hours ago" or "yesterday". Computed once per iteration instead of calling the function in multiple places.
- **`initials`** extracts the first letter of each word in the user's name. "Alice Johnson" becomes "AJ". This is cheaper than loading a fallback avatar image.
- **`description`** formats the activity into a readable sentence. "created task 'Fix login bug'" or "invited dave@example.com as member".

`{@const}` is ideal here because these values are derived from the current `activity` object and do not change during the lifetime of that iteration. They are computed once, used in the template, and discarded when the list re-renders.

The `<svelte:element this={...}>` dynamically chooses between a `<div>` and an `<a>` tag based on whether the activity icon should be clickable. Task-related activities link to the task; member activities link to the member's profile. System activities get a plain `<div>`.

## Helper Functions

Here are the helper functions referenced in the template:

```typescript
// src/lib/utils/activity.ts

export function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) === 1 ? '' : 's'} ago`;

  return date.toLocaleDateString();
}

interface ActivityEntry {
  action: string;
  entityType: string;
  metadata: Record<string, unknown> | null;
  userName: string;
}

export function formatActivityDescription(activity: ActivityEntry): string {
  const meta = activity.metadata as Record<string, string> | null;

  switch (activity.action) {
    case 'task_created':
      return `created task "${meta?.title ?? 'Untitled'}"`;
    case 'task_moved':
      return `moved "${meta?.title}" from ${meta?.fromColumn} to ${meta?.toColumn}`;
    case 'task_completed':
      return `completed "${meta?.title}"`;
    case 'task_deleted':
      return `deleted task "${meta?.title}"`;
    case 'member_invited':
      return `invited ${meta?.email} as ${meta?.role}`;
    case 'member_joined':
      return `joined the team`;
    case 'member_removed':
      return `removed ${meta?.memberName} from the team`;
    case 'board_created':
      return `created board "${meta?.name}"`;
    case 'settings_updated':
      return `updated team settings`;
    default:
      return activity.action.replace(/_/g, ' ');
  }
}

interface IconConfig {
  path: string;
  bgColor: string;
  textColor: string;
  linkTo?: string;
}

export function getActivityIcon(action: string): IconConfig {
  if (action.startsWith('task_')) {
    return {
      path: 'M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-600'
    };
  }

  if (action.startsWith('member_')) {
    return {
      path: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
      bgColor: 'bg-green-100',
      textColor: 'text-green-600'
    };
  }

  if (action.startsWith('board_')) {
    return {
      path: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z',
      bgColor: 'bg-purple-100',
      textColor: 'text-purple-600'
    };
  }

  return {
    path: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-600'
  };
}
```

## Infinite Scroll with an Intersection Observer Action

Instead of a "Load More" button, use an intersection observer to automatically load the next page when the user scrolls to the bottom. Build this as a Svelte action:

```typescript
// src/lib/actions/inview.ts
export function inview(
  node: HTMLElement,
  callback: () => void
): { destroy: () => void } {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          callback();
        }
      }
    },
    {
      rootMargin: '200px' // Trigger 200px before the element is visible
    }
  );

  observer.observe(node);

  return {
    destroy() {
      observer.disconnect();
    }
  };
}
```

The `rootMargin` of `200px` means the callback fires 200 pixels before the sentinel element actually enters the viewport. This gives the network request a head start, so by the time the user scrolls to the bottom, the next page is already loaded (or close to it).

Wire it into the activity page with a sentinel element at the bottom of the list:

```svelte
<script lang="ts">
  import { inview } from '$lib/actions/inview';
</script>

<!-- Activity list -->
<div class="divide-y divide-gray-100">
  {#each activities as activity (activity.id)}
    <!-- ...activity entries from above... -->
  {:else}
    <!-- ...empty state from above... -->
  {/each}
</div>

<!-- Infinite scroll sentinel -->
{#if hasMore}
  <div use:inview={loadNextPage} class="py-8 text-center">
    {#if loading}
      <div class="inline-flex items-center gap-2 text-sm text-gray-500">
        <svg class="animate-spin w-4 h-4" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading more activity...
      </div>
    {:else}
      <span class="text-sm text-gray-400">Scroll for more</span>
    {/if}
  </div>
{/if}

<!-- End of list -->
{#if !hasMore && activities.length > 0}
  <p class="text-center text-sm text-gray-400 py-6">
    You've reached the end of the activity log
  </p>
{/if}
```

When the sentinel `<div>` enters the viewport (or comes within 200 pixels of it), the `inview` action calls `loadNextPage`. The function checks `!loading && hasMore` before fetching, which prevents duplicate requests. Once the last page is loaded, `hasMore` becomes false, the sentinel disappears, and the "end of list" message appears.

## Filter Navigation Bar

Add a filter bar at the top of the page that uses the rest parameter URLs:

```svelte
<nav class="flex gap-2 mb-6 flex-wrap">
  <a
    href="/{data.team.slug}/activity"
    class="px-3 py-1.5 text-sm rounded-full"
    class:bg-indigo-100={!data.filters.entityType}
    class:text-indigo-700={!data.filters.entityType}
    class:bg-gray-100={data.filters.entityType}
    class:text-gray-600={data.filters.entityType}
  >
    All
  </a>

  {#each filterOptions as option}
    {@const isActive = data.filters.entityType === option.segment
      && (!option.action || data.filters.action === option.action)}

    <a
      href="/{data.team.slug}/activity/{option.segment}{option.action ? `/${option.action}` : ''}"
      class="px-3 py-1.5 text-sm rounded-full"
      class:bg-indigo-100={isActive}
      class:text-indigo-700={isActive}
      class:bg-gray-100={!isActive}
      class:text-gray-600={!isActive}
    >
      {option.label}
    </a>
  {/each}
</nav>
```

```svelte
<script lang="ts">
  const filterOptions = [
    { label: 'Tasks', segment: 'tasks' },
    { label: 'Tasks Created', segment: 'tasks', action: 'created' },
    { label: 'Tasks Moved', segment: 'tasks', action: 'moved' },
    { label: 'Members', segment: 'members' },
    { label: 'Boards', segment: 'boards' }
  ];
</script>
```

Clicking a filter chip navigates to a new URL (e.g., `/acme-team/activity/tasks/created`), which triggers the load function, which parses the new filter segments, which re-runs the `$effect` that resets and reloads the activity list. The entire filter flow is URL-driven — you can share a filtered view by copying the link.

## The Complete Page

Here is the full page component with all pieces assembled:

```svelte
<!-- src/routes/(app)/[teamSlug]/activity/[...filters]/+page.svelte -->
<script lang="ts">
  import { getActivityLog } from '$lib/api/activity.remote';
  import { inview } from '$lib/actions/inview';
  import { getRelativeTime, formatActivityDescription, getActivityIcon } from '$lib/utils/activity';
  import type { ActivityFilters } from './+page';

  type Activity = {
    id: number;
    action: string;
    entityType: string;
    entityId: number;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
    userName: string;
    userEmail: string;
    userAvatar: string | null;
  };

  let { data } = $props();

  let activities = $state.raw<Activity[]>([]);
  let currentPage = $state(1);
  let totalPages = $state(1);
  let loading = $state(false);
  let hasMore = $derived(currentPage < totalPages);

  const filterOptions = [
    { label: 'Tasks', segment: 'tasks' },
    { label: 'Tasks Created', segment: 'tasks', action: 'created' },
    { label: 'Tasks Moved', segment: 'tasks', action: 'moved' },
    { label: 'Members', segment: 'members' },
    { label: 'Boards', segment: 'boards' }
  ];

  $effect(() => {
    activities = [];
    currentPage = 1;
    loadPage(1, data.filters);
  });

  async function loadPage(page: number, filters: ActivityFilters) {
    loading = true;

    const result = await getActivityLog({
      teamId: data.team.id,
      page,
      entityType: filters.entityType,
      action: filters.action
    });

    if (page === 1) {
      activities = result.activities;
    } else {
      activities = [...activities, ...result.activities];
    }

    totalPages = result.totalPages;
    currentPage = page;
    loading = false;
  }

  function loadNextPage() {
    if (!loading && hasMore) {
      loadPage(currentPage + 1, data.filters);
    }
  }
</script>

<svelte:head>
  <title>Activity — {data.team.name}</title>
</svelte:head>

<div class="max-w-2xl">
  <h1 class="text-2xl font-bold mb-6">Activity</h1>

  <!-- Filter bar -->
  <nav class="flex gap-2 mb-6 flex-wrap">
    <a
      href="/{data.team.slug}/activity"
      class="px-3 py-1.5 text-sm rounded-full"
      class:bg-indigo-100={!data.filters.entityType}
      class:text-indigo-700={!data.filters.entityType}
      class:bg-gray-100={data.filters.entityType}
      class:text-gray-600={data.filters.entityType}
    >
      All
    </a>

    {#each filterOptions as option}
      {@const isActive = data.filters.entityType === option.segment
        && (!option.action || data.filters.action === option.action)}

      <a
        href="/{data.team.slug}/activity/{option.segment}{option.action ? `/${option.action}` : ''}"
        class="px-3 py-1.5 text-sm rounded-full transition-colors"
        class:bg-indigo-100={isActive}
        class:text-indigo-700={isActive}
        class:bg-gray-100={!isActive}
        class:text-gray-600={!isActive}
        class:hover:bg-gray-200={!isActive}
      >
        {option.label}
      </a>
    {/each}
  </nav>

  <!-- Activity list -->
  <div class="divide-y divide-gray-100">
    {#each activities as activity (activity.id)}
      {@const relativeTime = getRelativeTime(activity.createdAt)}
      {@const initials = activity.userName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)}
      {@const description = formatActivityDescription(activity)}
      {@const iconConfig = getActivityIcon(activity.action)}

      <div class="flex gap-3 py-4">
        <svelte:element
          this={iconConfig.linkTo ? 'a' : 'div'}
          href={iconConfig.linkTo}
          class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 {iconConfig.bgColor}"
        >
          <svg class="w-4 h-4 {iconConfig.textColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={iconConfig.path} />
          </svg>
        </svelte:element>

        <div class="flex-1 min-w-0">
          <p class="text-sm">
            {#if activity.userAvatar}
              <img
                src={activity.userAvatar}
                alt={activity.userName}
                class="w-5 h-5 rounded-full inline-block mr-1 align-text-bottom"
              />
            {:else}
              <span class="inline-flex w-5 h-5 rounded-full bg-gray-200 text-xs items-center justify-center mr-1 align-text-bottom">
                {initials}
              </span>
            {/if}
            <span class="font-medium">{activity.userName}</span>
            <span class="text-gray-600"> {description}</span>
          </p>
          <p class="text-xs text-gray-400 mt-0.5">{relativeTime}</p>
        </div>
      </div>

    {:else}
      <div class="text-center py-12">
        <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
          <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>

        <h3 class="text-lg font-medium text-gray-900 mb-1">No activity found</h3>
        <p class="text-sm text-gray-500 mb-4">
          {#if data.filters.entityType || data.filters.action}
            No activity matches the current filters.
          {:else}
            This team doesn't have any recorded activity yet.
          {/if}
        </p>

        {#if data.filters.entityType || data.filters.action}
          <a
            href="/{data.team.slug}/activity"
            class="text-sm text-indigo-600 hover:underline"
          >
            Clear filters and show all activity
          </a>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Infinite scroll sentinel -->
  {#if hasMore}
    <div use:inview={loadNextPage} class="py-8 text-center">
      {#if loading}
        <div class="inline-flex items-center gap-2 text-sm text-gray-500">
          <svg class="animate-spin w-4 h-4" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading more activity...
        </div>
      {:else}
        <span class="text-sm text-gray-400">Scroll for more</span>
      {/if}
    </div>
  {/if}

  {#if !hasMore && activities.length > 0}
    <p class="text-center text-sm text-gray-400 py-6">
      You've reached the end of the activity log
    </p>
  {/if}
</div>
```

## Try It

Extend the activity feed with these exercises:

1. Add a date range filter using two `<input type="date">` fields. Pass the start and end dates as additional query parameters to `getActivityLog` and filter with `gte`/`lte` in the Drizzle query.
2. Add a "group by date" mode that inserts date separator headings ("Today", "Yesterday", "January 15") between activity entries. Use `{@const}` inside the `{#each}` to detect when the date changes between consecutive entries.
3. Build a live-updating mode using Server-Sent Events (from Module 46). When a new activity is logged by another team member, prepend it to the list without a page refresh. Use `$state.raw()` replacement: `activities = [newEntry, ...activities]`.
4. Add keyboard navigation: pressing `j` and `k` moves focus between activity entries, and pressing `Enter` navigates to the related entity (task, board, or member profile).

## Key Takeaways

- Rest parameters `[...filters]` capture multiple optional URL segments, enabling clean filter URLs like `/activity/tasks/created`
- `query()` remote functions with pagination return both the data page and the total count for calculating whether more pages exist
- `<svelte:element this={tag}>` renders different HTML elements dynamically — useful when the wrapper element depends on data (link vs. div)
- `{@const}` inside `{#each}` blocks computes derived values per iteration — relative time, initials, formatted descriptions — without polluting component-level state
- `$state.raw()` skips deep reactivity for large arrays that are replaced wholesale, reducing proxy overhead for hundreds or thousands of entries
- The `use:inview` intersection observer action triggers infinite scroll loading before the user reaches the bottom, creating a seamless scrolling experience
- `{#each ... (key)}` with `{:else}` provides both keyed list rendering and a built-in empty state when no items match the current filters
- URL-driven filtering (rest parameters + link navigation) makes every filter state bookmarkable and shareable without client-side state management
