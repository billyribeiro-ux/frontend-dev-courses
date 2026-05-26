# Streaming Dashboard with Analytics

A dashboard that makes you wait for everything before showing anything is a bad dashboard. The user's name, team, and recent tasks can load in milliseconds from the database. But analytics — aggregations across thousands of tasks, burndown calculations, heatmap data — take real time to compute. Making the user stare at a blank screen while the slowest query finishes is a waste of the fast data that is already ready.

SvelteKit's streaming pattern solves this elegantly. You `await` the fast data in your load function (it blocks the page from rendering until it is ready) and return the slow data as unresolved promises. The page renders immediately with the fast data, and each analytics section loads independently as its promise resolves. Combine this with Svelte's `Tween` motion for animated numbers, `$derived.by()` for trend calculations, and `{@const}` for inline formatting, and you get a dashboard that feels fast, looks polished, and computes everything reactively.

## The Streaming Load Function

The load function is where streaming begins. Fast data gets awaited — it blocks the response until ready, but since it is fast, the user barely notices. Slow data gets returned as bare promises without `await`:

```typescript
// src/routes/(app)/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';
import { db } from '$server/database';
import { users, teams, tasks, columns, activityLog } from '$server/schema';
import { eq, desc, sql, and, gte } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
  const userId = locals.user.id;
  const teamId = locals.team.id;

  // --- FAST DATA: awaited, blocks page render ---

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId)
  });

  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId)
  });

  const recentTasks = await db.query.tasks.findMany({
    where: eq(tasks.boardId, locals.activeBoardId),
    orderBy: desc(tasks.updatedAt),
    limit: 5,
    with: { column: true, assignee: true }
  });

  // --- SLOW DATA: NOT awaited, returned as promises ---

  const analyticsSummary = getAnalyticsSummary(teamId);
  const sprintBurndown = getSprintBurndown(teamId);
  const activityHeatmap = getActivityHeatmap(teamId);
  const completionTrend = getCompletionTrend(teamId);

  return {
    user,
    team,
    recentTasks,
    // These are promises — SvelteKit streams them to the client
    // as they resolve
    analytics: analyticsSummary,
    burndown: sprintBurndown,
    heatmap: activityHeatmap,
    trend: completionTrend
  };
};

// --- Slow query functions ---

async function getAnalyticsSummary(teamId: number) {
  // Simulate a complex aggregation query
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [thisWeek] = await db
    .select({
      completed: sql<number>`count(*)`.as('completed'),
      created: sql<number>`count(*)`.as('created')
    })
    .from(tasks)
    .innerJoin(columns, eq(tasks.columnId, columns.id))
    .where(
      and(
        gte(tasks.updatedAt, oneWeekAgo),
        eq(columns.name, 'Done')
      )
    );

  const [lastWeek] = await db
    .select({
      completed: sql<number>`count(*)`.as('completed')
    })
    .from(tasks)
    .innerJoin(columns, eq(tasks.columnId, columns.id))
    .where(
      and(
        gte(tasks.updatedAt, twoWeeksAgo),
        eq(columns.name, 'Done')
      )
    );

  const totalTasks = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks);

  return {
    tasksCompletedThisWeek: thisWeek.completed,
    tasksCompletedLastWeek: lastWeek.completed,
    totalActiveTasks: totalTasks[0].count,
    velocityScore: Math.round((thisWeek.completed / 5) * 100) / 100,
    completionRate: 89.2,
    avgCycleTimeHours: 26.5
  };
}

async function getSprintBurndown(teamId: number) {
  // Returns daily remaining task counts for the current sprint
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    days.push({
      date: date.toISOString().split('T')[0],
      ideal: Math.round(50 - (50 / 14) * (14 - i)),
      actual: Math.round(50 - (50 / 14) * (14 - i) + (Math.random() * 8 - 4))
    });
  }
  return { days, sprintName: 'Sprint 12', totalPoints: 50 };
}

async function getActivityHeatmap(teamId: number) {
  // Returns activity counts per day-of-week and hour
  const heatmap: Record<string, number>[] = [];
  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  for (const day of daysOfWeek) {
    const hours: Record<string, number> = { day: 0 };
    for (let h = 9; h <= 18; h++) {
      hours[`h${h}`] = Math.floor(Math.random() * 20);
    }
    heatmap.push({ dayLabel: day, ...hours } as Record<string, number>);
  }
  return heatmap;
}

async function getCompletionTrend(teamId: number) {
  // Returns weekly completion counts for the last 8 weeks
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i * 7);
    weeks.push({
      weekOf: date.toISOString().split('T')[0],
      completed: Math.floor(Math.random() * 15) + 5,
      created: Math.floor(Math.random() * 12) + 3
    });
  }
  return weeks;
}
```

The critical detail: `analyticsSummary`, `sprintBurndown`, `activityHeatmap`, and `completionTrend` are function calls that return promises, but they are **not** preceded by `await`. SvelteKit detects that these values in the returned object are promises and streams them to the client. The page starts rendering as soon as the awaited data (`user`, `team`, `recentTasks`) is ready. Each slow promise resolves independently, and the corresponding `{#await}` block on the page transitions from its pending state to its resolved state.

## The Dashboard Page with Progressive Loading

The page renders immediately with the fast data and shows skeleton placeholders for each analytics section. As each promise resolves, the skeleton is replaced with real content:

```svelte
<!-- src/routes/(app)/dashboard/+page.svelte -->
<script lang="ts">
  import type { PageData } from './$types';
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import AnalyticsCard from '$components/ui/AnalyticsCard.svelte';
  import BurndownChart from '$components/ui/BurndownChart.svelte';
  import SkeletonCard from '$components/ui/SkeletonCard.svelte';

  let { data }: { data: PageData } = $props();

  // Tween instances for animated number counting
  const completedCount = new Tween(0, {
    duration: 800,
    easing: cubicOut
  });

  const velocityScore = new Tween(0, {
    duration: 1000,
    easing: cubicOut
  });

  const completionRate = new Tween(0, {
    duration: 900,
    easing: cubicOut,
    // Custom interpolator for one decimal place
    interpolate: (from, to) => (t) =>
      Math.round((from + (to - from) * t) * 10) / 10
  });

  const cycleTime = new Tween(0, {
    duration: 700,
    easing: cubicOut,
    interpolate: (from, to) => (t) =>
      Math.round((from + (to - from) * t) * 10) / 10
  });

  // Trend indicators computed from analytics data
  let analyticsResolved = $state<typeof data.analytics extends
    Promise<infer T> ? T : never | null>(null);

  let weeklyChange = $derived.by(() => {
    if (!analyticsResolved) return null;

    const thisWeek = analyticsResolved.tasksCompletedThisWeek;
    const lastWeek = analyticsResolved.tasksCompletedLastWeek;

    if (lastWeek === 0) {
      return { direction: 'up' as const, percentage: 100, label: 'up 100%' };
    }

    const change = ((thisWeek - lastWeek) / lastWeek) * 100;
    const rounded = Math.round(Math.abs(change));

    if (change > 0) {
      return { direction: 'up' as const, percentage: rounded, label: `up ${rounded}%` };
    }

    if (change < 0) {
      return { direction: 'down' as const, percentage: rounded, label: `down ${rounded}%` };
    }

    return { direction: 'flat' as const, percentage: 0, label: 'no change' };
  });
</script>

<div class="dashboard">
  <!-- Fast data: renders immediately -->
  <header class="dashboard-header">
    <div>
      <h1>Welcome back, {data.user.name}</h1>
      <p class="team-name">{data.team.name}</p>
    </div>
  </header>

  <!-- Recent tasks: also fast, renders immediately -->
  <section class="recent-tasks">
    <h2>Recent Tasks</h2>
    <div class="task-list">
      {#each data.recentTasks as task (task.id)}
        <div class="task-row">
          <span class="task-title">{task.title}</span>
          <span class="task-column">{task.column.name}</span>
          {#if task.assignee}
            <span class="task-assignee">{task.assignee.name}</span>
          {/if}
        </div>
      {/each}
    </div>
  </section>

  <!-- Slow data: streamed, shows skeletons then resolves -->
  <section class="analytics-grid">
    <h2>This Week</h2>

    {#await data.analytics}
      <!-- Pending: skeleton cards while analytics compute -->
      <div class="card-grid">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

    {:then analytics}
      <!-- Resolved: animate the numbers in -->
      {@const _ = (() => {
        analyticsResolved = analytics;
        completedCount.set(analytics.tasksCompletedThisWeek);
        velocityScore.set(analytics.velocityScore);
        completionRate.set(analytics.completionRate);
        cycleTime.set(analytics.avgCycleTimeHours);
      })()}

      <div class="card-grid">
        {#each [
          {
            label: 'Tasks Completed',
            value: completedCount.current,
            format: 'integer',
            trend: weeklyChange
          },
          {
            label: 'Velocity Score',
            value: velocityScore.current,
            format: 'decimal',
            trend: null
          },
          {
            label: 'Completion Rate',
            value: completionRate.current,
            format: 'percentage',
            trend: null
          },
          {
            label: 'Avg Cycle Time',
            value: cycleTime.current,
            format: 'duration',
            trend: null
          }
        ] as metric (metric.label)}
          {@const formatted = metric.format === 'integer'
            ? Math.round(metric.value).toLocaleString()
            : metric.format === 'percentage'
              ? `${metric.value.toFixed(1)}%`
              : metric.format === 'duration'
                ? `${Math.floor(metric.value)}h ${Math.round((metric.value % 1) * 60)}m`
                : metric.value.toFixed(2)}

          <div class="analytics-card">
            <p class="card-label">{metric.label}</p>
            <p class="card-value">{formatted}</p>
            {#if metric.trend}
              <p class="card-trend trend-{metric.trend.direction}">
                {#if metric.trend.direction === 'up'}
                  <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                    <path fill-rule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L10 6.414l-3.293 3.293a1 1 0 01-1.414 0z"/>
                  </svg>
                {:else if metric.trend.direction === 'down'}
                  <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                    <path fill-rule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L10 13.586l3.293-3.293a1 1 0 011.414 0z"/>
                  </svg>
                {/if}
                {metric.trend.label} vs last week
              </p>
            {/if}
          </div>
        {/each}
      </div>

    {:catch error}
      <div class="error-card">
        <p>Failed to load analytics: {error.message}</p>
        <button onclick={() => location.reload()}>Reload</button>
      </div>
    {/await}
  </section>

  <!-- Sprint burndown: separate streamed promise -->
  <section class="burndown-section">
    <h2>Sprint Burndown</h2>

    {#await data.burndown}
      <div class="chart-skeleton">
        <div class="skeleton-bar" style="height: 200px;"></div>
      </div>
    {:then burndown}
      <BurndownChart
        days={burndown.days}
        sprintName={burndown.sprintName}
        totalPoints={burndown.totalPoints}
      />
    {:catch}
      <p class="error-text">Burndown data unavailable.</p>
    {/await}
  </section>

  <!-- Activity heatmap: another independent stream -->
  <section class="heatmap-section">
    <h2>Team Activity</h2>

    {#await data.heatmap}
      <div class="chart-skeleton">
        <div class="skeleton-grid">
          {#each Array(7) as _}
            <div class="skeleton-row"></div>
          {/each}
        </div>
      </div>
    {:then heatmap}
      <div class="heatmap-grid">
        {#each heatmap as row}
          <div class="heatmap-row">
            <span class="day-label">{row.dayLabel}</span>
            {#each Object.entries(row).filter(([k]) => k.startsWith('h')) as [hour, count]}
              {@const intensity = Math.min(count / 20, 1)}
              {@const label = `${hour.replace('h', '')}:00`}
              <div
                class="heatmap-cell"
                style:background-color="rgba(99, 102, 241, {intensity})"
                title="{label}: {count} actions"
              ></div>
            {/each}
          </div>
        {/each}
      </div>
    {:catch}
      <p class="error-text">Activity data unavailable.</p>
    {/await}
  </section>

  <!-- Completion trend: yet another independent stream -->
  <section class="trend-section">
    <h2>Completion Trend</h2>

    {#await data.trend}
      <div class="chart-skeleton">
        <div class="skeleton-bar" style="height: 160px;"></div>
      </div>
    {:then weeks}
      <div class="trend-chart">
        {#each weeks as week (week.weekOf)}
          {@const maxVal = Math.max(...weeks.map(w => Math.max(w.completed, w.created)))}
          {@const completedHeight = (week.completed / maxVal) * 120}
          {@const createdHeight = (week.created / maxVal) * 120}

          <div class="trend-bar-group">
            <div class="trend-bars">
              <div
                class="trend-bar completed"
                style:height="{completedHeight}px"
                title="Completed: {week.completed}"
              ></div>
              <div
                class="trend-bar created"
                style:height="{createdHeight}px"
                title="Created: {week.created}"
              ></div>
            </div>
            <span class="trend-label">
              {new Date(week.weekOf).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        {/each}
      </div>
      <div class="trend-legend">
        <span class="legend-item"><span class="dot completed"></span> Completed</span>
        <span class="legend-item"><span class="dot created"></span> Created</span>
      </div>
    {:catch}
      <p class="error-text">Trend data unavailable.</p>
    {/await}
  </section>
</div>

<style>
  .dashboard {
    max-width: 1000px;
    margin: 0 auto;
    padding: 32px 24px;
  }

  .dashboard-header h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  .team-name {
    color: #6b7280;
    margin: 4px 0 0;
  }

  .recent-tasks {
    margin-top: 32px;
  }

  .task-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 12px;
  }

  .task-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: #f9fafb;
    border-radius: 8px;
    font-size: 0.9rem;
  }

  .task-title { flex: 1; font-weight: 500; }
  .task-column {
    padding: 2px 10px;
    background: #e0e7ff;
    color: #4338ca;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .task-assignee { color: #6b7280; font-size: 0.85rem; }

  .analytics-grid { margin-top: 32px; }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-top: 12px;
  }

  .analytics-card {
    padding: 20px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
  }

  .card-label {
    margin: 0;
    font-size: 0.8rem;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .card-value {
    margin: 8px 0 4px;
    font-size: 1.8rem;
    font-weight: 700;
    color: #111827;
  }

  .card-trend {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0;
    font-size: 0.8rem;
    font-weight: 500;
  }

  .trend-up { color: #16a34a; }
  .trend-down { color: #dc2626; }
  .trend-flat { color: #6b7280; }

  .burndown-section,
  .heatmap-section,
  .trend-section {
    margin-top: 32px;
  }

  h2 {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0 0 4px;
  }

  .chart-skeleton {
    margin-top: 12px;
    background: #f3f4f6;
    border-radius: 12px;
    overflow: hidden;
  }

  .skeleton-bar {
    background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }

  .skeleton-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px;
  }

  .skeleton-row {
    height: 24px;
    background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .heatmap-grid {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 12px;
  }

  .heatmap-row {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .day-label {
    width: 32px;
    font-size: 0.7rem;
    color: #6b7280;
  }

  .heatmap-cell {
    width: 32px;
    height: 24px;
    border-radius: 4px;
    background-color: rgba(99, 102, 241, 0.1);
  }

  .trend-chart {
    display: flex;
    align-items: flex-end;
    gap: 12px;
    margin-top: 12px;
    padding: 16px;
    background: #f9fafb;
    border-radius: 12px;
    min-height: 160px;
  }

  .trend-bar-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
  }

  .trend-bars {
    display: flex;
    gap: 3px;
    align-items: flex-end;
  }

  .trend-bar {
    width: 16px;
    border-radius: 4px 4px 0 0;
    transition: height 0.3s ease;
  }

  .trend-bar.completed { background: #6366f1; }
  .trend-bar.created { background: #c7d2fe; }

  .trend-label {
    margin-top: 6px;
    font-size: 0.65rem;
    color: #9ca3af;
  }

  .trend-legend {
    display: flex;
    gap: 16px;
    margin-top: 12px;
    font-size: 0.8rem;
    color: #6b7280;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }

  .dot.completed { background: #6366f1; }
  .dot.created { background: #c7d2fe; }

  .error-card {
    padding: 24px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 12px;
    text-align: center;
    color: #991b1b;
    margin-top: 12px;
  }

  .error-card button {
    margin-top: 8px;
    padding: 8px 20px;
    background: #dc2626;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
  }

  .error-text {
    color: #9ca3af;
    font-size: 0.9rem;
    padding: 24px 0;
    text-align: center;
  }
</style>
```

There is a lot happening on this page, so let us break down the key patterns.

## Tween Instances for Animated Numbers

When analytics data arrives, you do not want the numbers to just appear — you want them to count up from zero, giving the user a sense of magnitude and drawing attention to the freshly loaded data. The `Tween` class from `svelte/motion` creates a value that animates smoothly toward a target over a specified duration:

```typescript
import { Tween } from 'svelte/motion';
import { cubicOut } from 'svelte/easing';

const completedCount = new Tween(0, {
  duration: 800,
  easing: cubicOut
});

// When analytics resolve, animate from 0 to the real value
completedCount.set(42);  // Animates: 0 -> 42 over 800ms
```

The `completedCount.current` property reads the tween's current interpolated value. On every animation frame, Svelte recalculates the value between the starting point and the target, applies the easing function, and re-renders the component. With `cubicOut`, the animation starts fast and decelerates — it feels snappy and responsive.

For the completion rate, you need a custom interpolator because the default linear interpolation produces too many decimal places mid-animation:

```typescript
const completionRate = new Tween(0, {
  duration: 900,
  easing: cubicOut,
  interpolate: (from, to) => (t) =>
    Math.round((from + (to - from) * t) * 10) / 10
});
```

The `interpolate` function receives `from` and `to` values, and returns a function that takes `t` (progress from 0 to 1) and returns the interpolated value. By rounding to one decimal place inside the interpolator, you avoid showing "89.23847%" mid-animation — it always looks like "89.2%".

## $derived.by() for Trend Indicators

The weekly change indicator ("up 12% vs last week") requires multi-step logic: null checks, division, rounding, direction detection, and label formatting. A plain `$derived` expression would be unwieldy. `$derived.by()` lets you write a full function body:

```typescript
let weeklyChange = $derived.by(() => {
  if (!analyticsResolved) return null;

  const thisWeek = analyticsResolved.tasksCompletedThisWeek;
  const lastWeek = analyticsResolved.tasksCompletedLastWeek;

  // Edge case: avoid division by zero
  if (lastWeek === 0) {
    return { direction: 'up' as const, percentage: 100, label: 'up 100%' };
  }

  const change = ((thisWeek - lastWeek) / lastWeek) * 100;
  const rounded = Math.round(Math.abs(change));

  if (change > 0) {
    return {
      direction: 'up' as const,
      percentage: rounded,
      label: `up ${rounded}%`
    };
  }

  if (change < 0) {
    return {
      direction: 'down' as const,
      percentage: rounded,
      label: `down ${rounded}%`
    };
  }

  return { direction: 'flat' as const, percentage: 0, label: 'no change' };
});
```

This is reactive — it automatically recomputes whenever `analyticsResolved` changes. The early returns make the logic easy to follow: handle the null case, handle the zero-division edge case, handle positive change, handle negative change, handle flat. Each branch returns a typed object with `direction`, `percentage`, and `label`.

You could extend this pattern for other metrics:

```typescript
let velocityTrend = $derived.by(() => {
  if (!analyticsResolved) return 'loading';

  const score = analyticsResolved.velocityScore;

  if (score >= 8) return 'excellent';
  if (score >= 5) return 'good';
  if (score >= 3) return 'fair';
  return 'needs-improvement';
});
```

## {@const} for Inline Metric Formatting

Inside the analytics grid `{#each}` loop, each metric needs different formatting: integers get comma separators, percentages get a percent sign, durations get hours-and-minutes formatting. You could write helper functions and call them, but `{@const}` lets you compute the formatted value inline, right where it is used:

```svelte
{#each metrics as metric (metric.label)}
  {@const formatted = metric.format === 'integer'
    ? Math.round(metric.value).toLocaleString()
    : metric.format === 'percentage'
      ? `${metric.value.toFixed(1)}%`
      : metric.format === 'duration'
        ? `${Math.floor(metric.value)}h ${Math.round((metric.value % 1) * 60)}m`
        : metric.value.toFixed(2)}

  <div class="analytics-card">
    <p class="card-label">{metric.label}</p>
    <p class="card-value">{formatted}</p>
  </div>
{/each}
```

`{@const}` declares a block-scoped constant within a template block. It exists only for the current iteration of the `{#each}`. This is cleaner than creating a global formatting function for three different format types that are only used in one place. If the formatting logic grows more complex, you can always extract it into a function later — but `{@const}` keeps simple formatting close to where it is rendered.

A few more `{@const}` examples from the heatmap and trend chart:

```svelte
<!-- Heatmap: compute intensity per cell -->
{#each Object.entries(row).filter(([k]) => k.startsWith('h')) as [hour, count]}
  {@const intensity = Math.min(count / 20, 1)}
  {@const label = `${hour.replace('h', '')}:00`}
  <div
    class="heatmap-cell"
    style:background-color="rgba(99, 102, 241, {intensity})"
    title="{label}: {count} actions"
  ></div>
{/each}

<!-- Trend chart: compute bar heights relative to max -->
{#each weeks as week (week.weekOf)}
  {@const maxVal = Math.max(...weeks.map(w => Math.max(w.completed, w.created)))}
  {@const completedHeight = (week.completed / maxVal) * 120}
  {@const createdHeight = (week.created / maxVal) * 120}
  <!-- render bars -->
{/each}
```

## How Streaming Works Under the Hood

When SvelteKit encounters an unresolved promise in the return value of a `load` function, it sends the initial HTML with a placeholder marker. As each promise resolves, SvelteKit sends a small `<script>` chunk over the same HTTP connection that patches the data into the page. The `{#await}` block in your component detects the resolution and swaps from the pending state to the resolved state.

This means:

1. The initial page HTML includes the fast data and the pending states of each `{#await}` block.
2. The browser renders that HTML immediately — the user sees their name, team, and recent tasks.
3. Over the next few hundred milliseconds (or seconds, depending on query complexity), each slow promise resolves and the corresponding section transitions from skeleton to content.
4. Each section is independent — the burndown chart can resolve before or after the analytics summary.

The user experience is dramatically better than showing a blank page until everything is ready. Fast data appears in under 100ms. Slow data progressively fills in. Each section has its own error handling so a failure in the heatmap query does not affect the burndown chart.

## Try It

Build an extended dashboard section called "Team Leaderboard" that streams separately from the other analytics:

1. Add a new async function `getTeamLeaderboard(teamId)` in the load function that returns an array of `{ name, avatar, tasksCompleted, avgCycleTime }` objects. Return it as an unresolved promise alongside the other slow data.
2. In the page component, add a new `{#await data.leaderboard}` section with a skeleton state (3 placeholder rows), a resolved state showing a ranked list, and an error fallback.
3. Use `Tween` to animate each team member's task count from 0 to their actual value, staggered by 100ms per row (use the `delay` option).
4. Add a `$derived.by()` that determines the "MVP" — the team member with the highest tasks completed — and displays a trophy icon next to their name.
5. Use `{@const}` inside the leaderboard `{#each}` to format cycle time as "Xh Ym" and to compute a percentage bar width relative to the highest performer.

## Key Takeaways

- SvelteKit streams unresolved promises from `load` functions — `await` fast data to block rendering, return slow data as bare promises to stream it
- Each `{#await promise}` block has three states: pending (skeleton), resolved (content), and rejected (error) — they are independent, so one failure does not block others
- `Tween` from `svelte/motion` animates numeric values smoothly — use custom `interpolate` functions to control decimal precision during the animation
- `$derived.by()` lets you write multi-step computations with early returns and conditional logic — perfect for trend indicators and status labels
- `{@const}` declares block-scoped constants inside `{#each}` loops and other template blocks — use it for per-item formatting like number localization, percentages, and duration strings
- The streaming pattern gives users a dramatically faster perceived load time — fast content in under 100ms, slow content fills in progressively
- Each streamed section should have its own error fallback so a single failed query does not take down the entire dashboard
