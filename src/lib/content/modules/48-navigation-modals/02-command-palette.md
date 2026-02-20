# Command Palette & Keyboard Shortcuts

Every productivity app worth using has a command palette. Hit Cmd+K (or Ctrl+K on Windows/Linux), type a few characters, and jump straight to a task, board, or action. No mouse required. Linear has it, Notion has it, VS Code has it — and TeamBoard needs it too.

Building a command palette pulls together several Svelte special elements: `<svelte:window>` for global keyboard shortcuts and responsive bindings, `<svelte:document>` for visibility tracking, and `<svelte:body>` for mouse interaction detection. This lesson builds the complete command palette and wires up global keyboard infrastructure along the way.

## Capturing Global Keyboard Shortcuts

The command palette opens with Cmd+K (Mac) or Ctrl+K (Windows/Linux). You need a global keydown listener that works no matter which element has focus. The `<svelte:window>` element handles this:

```svelte
<!-- src/lib/components/ui/CommandPalette.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import type { Task, Board } from '$lib/types';

  let {
    tasks = [],
    boards = [],
    isOpen = $bindable(false)
  }: {
    tasks: Task[];
    boards: Board[];
    isOpen: boolean;
  } = $props();

  let searchQuery = $state('');
  let selectedIndex = $state(0);

  function handleGlobalKeydown(e: KeyboardEvent) {
    // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      isOpen = !isOpen;
      if (isOpen) {
        searchQuery = '';
        selectedIndex = 0;
      }
    }

    // Escape to close
    if (e.key === 'Escape' && isOpen) {
      isOpen = false;
    }
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />
```

The `e.metaKey` check catches Cmd on Mac. The `e.ctrlKey` check catches Ctrl on Windows and Linux. By checking both with `||`, the shortcut works on every platform. The `e.preventDefault()` call stops the browser's default Ctrl+K behavior (which focuses the address bar in some browsers).

Notice that `isOpen` uses `$bindable()` so the parent component can both read and write the open state. The parent might close the palette after executing a command, or open it from a toolbar button.

## Autofocus Action on the Search Input

When the palette opens, the search input should be focused immediately. A Svelte action is the cleanest way to do this:

```typescript
// src/lib/actions/autofocus.ts
export function autofocus(node: HTMLElement) {
  // Use requestAnimationFrame to ensure the element is in the DOM
  requestAnimationFrame(() => {
    node.focus();
  });
}
```

Apply it to the search input:

```svelte
<script lang="ts">
  import { autofocus } from '$actions/autofocus';
</script>

{#if isOpen}
  <div class="palette-backdrop" onclick={() => isOpen = false}>
    <div class="palette" onclick|stopPropagation>
      <input
        type="text"
        placeholder="Search tasks, boards, or type a command..."
        bind:value={searchQuery}
        use:autofocus
      />
    </div>
  </div>
{/if}
```

The `use:autofocus` action fires when the input element is mounted into the DOM. Because the input is inside an `{#if}` block, it mounts fresh every time the palette opens — and focuses immediately every time.

## Fuzzy Search with $derived.by()

The palette needs to search across tasks, boards, and built-in commands, then rank results by relevance. This is a perfect use case for `$derived.by()`, which lets you run a function body (not just an expression) as a derived value:

```svelte
<script lang="ts">
  // Built-in commands that the palette can execute
  const commands = [
    { type: 'command' as const, id: 'new-task', label: 'Create New Task', icon: '+', action: () => goto('/new-task') },
    { type: 'command' as const, id: 'new-board', label: 'Create New Board', icon: '+', action: () => goto('/new-board') },
    { type: 'command' as const, id: 'settings', label: 'Open Settings', icon: 'gear', action: () => goto('/settings') },
    { type: 'command' as const, id: 'theme', label: 'Toggle Dark Mode', icon: 'moon', action: () => toggleTheme() },
  ];

  type SearchResult = {
    type: 'task' | 'board' | 'command';
    id: string | number;
    label: string;
    subtitle?: string;
    icon: string;
    score: number;
    action: () => void;
  };

  // Score how well a query matches a string (higher = better match)
  function fuzzyScore(query: string, text: string): number {
    const lower = text.toLowerCase();
    const q = query.toLowerCase();

    // Exact match at start gets highest score
    if (lower.startsWith(q)) return 100;

    // Contains the query as a substring
    if (lower.includes(q)) return 75;

    // Check if all characters appear in order (fuzzy)
    let qi = 0;
    let consecutiveBonus = 0;
    let lastMatchIndex = -2;

    for (let i = 0; i < lower.length && qi < q.length; i++) {
      if (lower[i] === q[qi]) {
        if (i === lastMatchIndex + 1) consecutiveBonus += 10;
        lastMatchIndex = i;
        qi++;
      }
    }

    if (qi === q.length) return 30 + consecutiveBonus;
    return 0; // No match
  }

  let filteredResults: SearchResult[] = $derived.by(() => {
    if (!searchQuery.trim()) {
      // Show recent items and commands when the search is empty
      return commands.map((cmd) => ({
        ...cmd,
        score: 50,
        action: cmd.action
      }));
    }

    const results: SearchResult[] = [];

    // Score tasks
    for (const task of tasks) {
      const titleScore = fuzzyScore(searchQuery, task.title);
      const descScore = fuzzyScore(searchQuery, task.description ?? '') * 0.5;
      const score = Math.max(titleScore, descScore);

      if (score > 0) {
        results.push({
          type: 'task',
          id: task.id,
          label: task.title,
          subtitle: task.description?.slice(0, 60),
          icon: 'task',
          score,
          action: () => goto(`/board/${task.boardId}/task/${task.id}`)
        });
      }
    }

    // Score boards
    for (const board of boards) {
      const score = fuzzyScore(searchQuery, board.name);
      if (score > 0) {
        results.push({
          type: 'board',
          id: board.id,
          label: board.name,
          subtitle: board.description,
          icon: 'board',
          score,
          action: () => goto(`/board/${board.id}`)
        });
      }
    }

    // Score commands
    for (const cmd of commands) {
      const score = fuzzyScore(searchQuery, cmd.label);
      if (score > 0) {
        results.push({
          ...cmd,
          score,
          action: cmd.action
        });
      }
    }

    // Sort by score descending
    return results.sort((a, b) => b.score - a.score);
  });
</script>
```

The `$derived.by()` block runs every time `searchQuery`, `tasks`, or `boards` changes. It scores every item against the search query and returns a sorted array. When the query is empty, it returns the built-in commands as suggestions.

## Keyboard Navigation Inside the Palette

Users expect to navigate the results with arrow keys and execute with Enter. Add a keydown handler to the palette input:

```svelte
<script lang="ts">
  function handlePaletteKeydown(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, filteredResults.length - 1);
        break;

      case 'ArrowUp':
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        break;

      case 'Enter':
        e.preventDefault();
        if (filteredResults[selectedIndex]) {
          executeResult(filteredResults[selectedIndex]);
        }
        break;
    }
  }

  function executeResult(result: SearchResult) {
    isOpen = false;
    result.action();
  }

  // Reset selection when results change
  $effect(() => {
    filteredResults; // track dependency
    selectedIndex = 0;
  });
</script>
```

The `$effect` resets `selectedIndex` to 0 whenever the filtered results change, so the user always starts at the top of the list after typing.

## Rendering the Results List

Now render the palette with the search input, results list, keyboard navigation, and empty state:

```svelte
{#if isOpen}
  <div class="palette-backdrop" onclick={() => isOpen = false} role="presentation">
    <div
      class="palette"
      role="combobox"
      aria-expanded="true"
      aria-haspopup="listbox"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="palette-input-wrapper">
        <span class="search-icon">magnifying glass</span>
        <input
          type="text"
          placeholder="Search tasks, boards, or type a command..."
          bind:value={searchQuery}
          onkeydown={handlePaletteKeydown}
          use:autofocus
          role="searchbox"
          aria-autocomplete="list"
        />
        <kbd class="shortcut-hint">Esc</kbd>
      </div>

      <ul class="palette-results" role="listbox">
        {#each filteredResults as result, i}
          <li
            class="palette-result"
            class:selected={i === selectedIndex}
            onclick={() => executeResult(result)}
            onmouseenter={() => selectedIndex = i}
            role="option"
            aria-selected={i === selectedIndex}
          >
            <span class="result-icon">{result.icon}</span>
            <div class="result-text">
              <span class="result-label">{result.label}</span>
              {#if result.subtitle}
                <span class="result-subtitle">{result.subtitle}</span>
              {/if}
            </div>
            <span class="result-type">{result.type}</span>
          </li>
        {:else}
          <li class="palette-empty">
            No results for "{searchQuery}"
          </li>
        {/each}
      </ul>

      <footer class="palette-footer">
        <span><kbd>up</kbd> <kbd>down</kbd> to navigate</span>
        <span><kbd>enter</kbd> to select</span>
        <span><kbd>esc</kbd> to close</span>
      </footer>
    </div>
  </div>
{/if}
```

The `{:else}` block on `{#each}` handles the empty state gracefully. The `onmouseenter` on each result item updates `selectedIndex` so mouse and keyboard navigation stay in sync — hovering over a result selects it, and arrow keys continue from that position.

## Responsive Layout with Window Bindings

TeamBoard needs to adapt its layout to the viewport size. The sidebar should collapse on small screens, and column widths should adjust. Use `<svelte:window>` bindings for this:

```svelte
<!-- src/routes/(app)/+layout.svelte -->
<script lang="ts">
  import CommandPalette from '$components/ui/CommandPalette.svelte';
  import Sidebar from '$components/layout/Sidebar.svelte';

  let { children, data } = $props();

  let innerWidth = $state(0);
  let innerHeight = $state(0);

  let isMobile = $derived(innerWidth < 768);
  let isTablet = $derived(innerWidth >= 768 && innerWidth < 1024);

  let sidebarOpen = $state(true);

  // Auto-collapse sidebar on mobile
  $effect(() => {
    if (isMobile) {
      sidebarOpen = false;
    }
  });

  let paletteOpen = $state(false);
</script>

<svelte:window bind:innerWidth bind:innerHeight />

<div class="app-layout" class:sidebar-collapsed={!sidebarOpen}>
  <Sidebar
    open={sidebarOpen}
    onToggle={() => sidebarOpen = !sidebarOpen}
    compact={isTablet}
  />

  <main class="app-main">
    {@render children()}
  </main>
</div>

<CommandPalette
  tasks={data.allTasks ?? []}
  boards={data.boards ?? []}
  bind:isOpen={paletteOpen}
/>
```

The `innerWidth` binding updates reactively as the user resizes the browser. The `$derived` values compute the breakpoints, and the `$effect` auto-collapses the sidebar when the screen is too narrow. This is more flexible than CSS media queries because you can change component structure, not just styles.

## Sticky Column Headers with scrollY

When the board has many tasks, users scroll vertically. The column headers should stay visible. Bind `scrollY` and apply a sticky class:

```svelte
<!-- src/lib/components/board/BoardColumns.svelte -->
<script lang="ts">
  let scrollY = $state(0);
  let isSticky = $derived(scrollY > 120);
</script>

<svelte:window bind:scrollY />

<div class="board-columns">
  {#each columns as column}
    <div class="column">
      <h3
        class="column-header"
        class:sticky={isSticky}
        style:border-color={column.color}
      >
        {column.name}
        <span class="task-count">{column.tasks.length}</span>
      </h3>

      <div class="card-list">
        {#each column.tasks as task}
          <slot name="card" {task} />
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .column-header.sticky {
    position: fixed;
    top: 0;
    z-index: 10;
    background: var(--bg-surface);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
</style>
```

The `scrollY` binding is two-way. You could set `scrollY = 0` to scroll back to the top programmatically — useful for a "scroll to top" button or when the user changes board views.

## Offline Detection with bind:online

TeamBoard syncs tasks in real time. When the user loses internet connectivity, you should tell them immediately and pause sync attempts. The `online` binding provides this:

```svelte
<!-- src/lib/components/ui/ConnectionStatus.svelte -->
<script lang="ts">
  let online = $state(true);
  let showBanner = $derived(!online);

  // Track how long the user has been offline
  let offlineSince: Date | null = $state(null);

  $effect(() => {
    if (!online) {
      offlineSince = new Date();
    } else {
      offlineSince = null;
    }
  });
</script>

<svelte:window bind:online />

{#if showBanner}
  <div class="offline-banner" role="alert">
    <span class="offline-icon">!</span>
    <p>
      You are offline. Changes will be saved locally and synced when you reconnect.
      {#if offlineSince}
        <small>Disconnected at {offlineSince.toLocaleTimeString()}</small>
      {/if}
    </p>
  </div>
{/if}

<style>
  .offline-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: #fef3c7;
    color: #92400e;
    border-bottom: 2px solid #f59e0b;
    font-weight: 500;
  }
</style>
```

## Pausing Sync on Hidden Tabs with svelte:document

When the user switches to another browser tab, there is no point maintaining the real-time SSE connection. It wastes bandwidth and server resources. Use `<svelte:document>` to detect tab visibility changes:

```svelte
<!-- src/lib/components/board/RealtimeSync.svelte -->
<script lang="ts">
  let isTabVisible = $state(true);
  let eventSource: EventSource | null = $state(null);

  let { boardId, onTaskUpdate }: {
    boardId: number;
    onTaskUpdate: (data: any) => void;
  } = $props();

  function connectSSE() {
    if (eventSource) eventSource.close();

    eventSource = new EventSource(`/api/boards/${boardId}/events`);
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onTaskUpdate(data);
    };
  }

  function disconnectSSE() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  }

  function handleVisibilityChange() {
    isTabVisible = !document.hidden;

    if (isTabVisible) {
      // Tab became visible — reconnect and refresh
      connectSSE();
    } else {
      // Tab hidden — disconnect to save resources
      disconnectSSE();
    }
  }

  // Connect on mount
  $effect(() => {
    connectSSE();
    return () => disconnectSSE();
  });
</script>

<svelte:document onvisibilitychange={handleVisibilityChange} />
```

When the user switches away from the tab, the `visibilitychange` event fires, `document.hidden` becomes `true`, and the SSE connection closes. When they come back, it reconnects. This is a meaningful optimization for applications with many concurrent users.

## Preventing Body Scroll with svelte:body

When the command palette (or any modal) is open, the background should not scroll. Use `<svelte:body>` to detect mouse interactions and toggle a CSS class:

```svelte
<!-- src/lib/components/ui/CommandPalette.svelte (addition) -->
<script lang="ts">
  // Toggle body scroll lock when palette opens/closes
  $effect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  });
</script>

<svelte:body
  onmouseenter={() => {/* mouse entered the page */}}
  onmouseleave={() => {/* mouse left the page — could pause tooltips */}}
/>
```

The `$effect` approach is the most reliable way to lock scroll. The cleanup function (the returned function) ensures the scroll lock is removed even if the component is destroyed while the palette is open.

The `<svelte:body>` `onmouseenter` and `onmouseleave` events are useful for a different purpose: detecting when the user's mouse leaves the browser window entirely. You could use this to pause hover-based tooltips or drag operations that would behave strangely if the mouse leaves the viewport.

## Wiring the Palette into the App Layout

The command palette lives in the app layout so it is accessible from every page:

```svelte
<!-- src/routes/(app)/+layout.svelte (complete version) -->
<script lang="ts">
  import CommandPalette from '$components/ui/CommandPalette.svelte';
  import ConnectionStatus from '$components/ui/ConnectionStatus.svelte';
  import Sidebar from '$components/layout/Sidebar.svelte';
  import Header from '$components/layout/Header.svelte';

  let { children, data } = $props();

  let innerWidth = $state(0);
  let innerHeight = $state(0);
  let isMobile = $derived(innerWidth < 768);

  let sidebarOpen = $state(true);
  let paletteOpen = $state(false);

  $effect(() => {
    if (isMobile) sidebarOpen = false;
  });
</script>

<svelte:window bind:innerWidth bind:innerHeight />

<ConnectionStatus />

<div class="app-shell" class:sidebar-collapsed={!sidebarOpen}>
  <Sidebar
    open={sidebarOpen}
    compact={isMobile}
    onToggle={() => sidebarOpen = !sidebarOpen}
  />

  <div class="app-content">
    <Header
      user={data.user}
      onOpenPalette={() => paletteOpen = true}
    />

    <main>
      {@render children()}
    </main>
  </div>
</div>

<CommandPalette
  tasks={data.allTasks ?? []}
  boards={data.boards ?? []}
  bind:isOpen={paletteOpen}
/>
```

The header includes a search button that opens the palette with a click (for users who do not know the keyboard shortcut). The `bind:isOpen` two-way binding keeps the layout and the palette in sync.

## Try It

Build a command palette for TeamBoard with the following features:

1. Open/close with Cmd+K (or Ctrl+K) using `<svelte:window onkeydown>`.
2. `use:autofocus` action on the search input so it focuses immediately when the palette opens.
3. Fuzzy search across at least 5 tasks and 2 boards using `$derived.by()`.
4. Arrow key navigation (up/down) and Enter to execute, with `selectedIndex` tracking.
5. `{:else}` block showing "No results" when the search has no matches.
6. `<svelte:window bind:online>` to show an offline banner.
7. `<svelte:document onvisibilitychange>` to log when the tab becomes hidden/visible.
8. Body scroll lock when the palette is open.

Bonus: add a `<svelte:window bind:scrollY>` sticky header that appears when the user scrolls past 100px.

## Key Takeaways

- `<svelte:window onkeydown>` captures keyboard shortcuts globally — use `e.metaKey || e.ctrlKey` for cross-platform Cmd/Ctrl detection
- `<svelte:window>` bindings (`innerWidth`, `innerHeight`, `scrollY`, `online`) provide reactive access to browser state with automatic cleanup
- `<svelte:document>` handles document-level events like `visibilitychange` — pause background work when the tab is hidden
- `<svelte:body>` detects `mouseenter`/`mouseleave` on the page body — useful for pausing interactions when the mouse leaves the viewport
- `$derived.by()` runs complex logic (like fuzzy scoring and sorting) reactively — it recalculates whenever its dependencies change
- `{#each results}{:else}` provides a clean empty-state pattern when the filtered list is empty
- Svelte actions like `use:autofocus` encapsulate DOM behavior that fires on mount — perfect for focus management in conditional blocks
- Keyboard navigation in custom widgets (arrow keys, Enter, Escape) requires manual `onkeydown` handling with `e.preventDefault()` to stop default browser behavior
