# Team Settings with Rich Forms

Every team needs a settings page. The kind of page where admins update the team name, swap the avatar, tweak the billing email, and invite new members. It sounds mundane, but this is where form handling gets real. You need validation, file uploads, sensitive fields, dirty checking, navigation guards, and state preservation across page navigations. This lesson builds all of that for TeamBoard's settings page.

## The Update Team Form

Start with the remote function definition. The `form()` function from `$app/server` pairs a Valibot schema with a server-side handler. The schema validates input both on the server and (optionally) on the client via preflight:

```typescript
// src/lib/api/team.remote.ts
import { form, command } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/database';
import { teams } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { invalid } from '@sveltejs/kit';

const UpdateTeamSchema = v.object({
  teamId: v.number(),
  name: v.pipe(
    v.string(),
    v.minLength(2, 'Team name must be at least 2 characters'),
    v.maxLength(50, 'Team name must be under 50 characters')
  ),
  description: v.pipe(
    v.string(),
    v.maxLength(500, 'Description must be under 500 characters')
  ),
  billingEmail: v.pipe(
    v.string(),
    v.email('Please enter a valid email address')
  )
});

export const updateTeam = form(
  UpdateTeamSchema,
  async (data) => {
    const [existing] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, data.teamId))
      .limit(1);

    if (!existing) {
      return invalid(404, {
        name: ['Team not found']
      });
    }

    await db
      .update(teams)
      .set({
        name: data.name,
        description: data.description,
        billingEmail: data.billingEmail
      })
      .where(eq(teams.id, data.teamId));
  }
);
```

The schema defines every field with validation pipes. `v.pipe()` chains validators together — first check it is a string, then check the length. If any validator fails, the corresponding error message lands in the field's `.issues()` array.

Now build the component. Spread `{...updateTeam}` onto the `<form>` element and use field helpers for each input:

```svelte
<!-- src/routes/(app)/[teamSlug]/settings/+page.svelte -->
<script lang="ts">
  import { updateTeam } from '$lib/api/team.remote';
  import * as v from 'valibot';

  let { data } = $props();

  // Preflight validation runs in the browser before submission
  const teamForm = updateTeam.preflight(
    v.object({
      teamId: v.number(),
      name: v.pipe(v.string(), v.minLength(2, 'Team name must be at least 2 characters')),
      description: v.pipe(v.string(), v.maxLength(500, 'Description too long')),
      billingEmail: v.pipe(v.string(), v.email('Invalid email'))
    })
  );

  // Pre-populate with existing team data
  $effect(() => {
    teamForm.fields.teamId.set(data.team.id);
    teamForm.fields.name.set(data.team.name);
    teamForm.fields.description.set(data.team.description ?? '');
    teamForm.fields.billingEmail.set(data.team.billingEmail ?? '');
  });
</script>

<h1 class="text-2xl font-bold mb-6">Team Settings</h1>

<form {...teamForm} class="space-y-6 max-w-lg">
  <div>
    <label for="name" class="block text-sm font-medium mb-1">Team Name</label>
    <input
      {...teamForm.fields.name.as('text')}
      id="name"
      class="w-full px-3 py-2 border rounded-lg"
    />
    {#each teamForm.fields.name.issues() as issue}
      <p class="text-sm text-red-600 mt-1">{issue}</p>
    {/each}
  </div>

  <div>
    <label for="description" class="block text-sm font-medium mb-1">Description</label>
    <textarea
      {...teamForm.fields.description.as('textarea')}
      id="description"
      rows="3"
      class="w-full px-3 py-2 border rounded-lg"
    ></textarea>
    <p class="text-xs text-gray-500 mt-1">
      {teamForm.fields.description.value().length}/500 characters
    </p>
    {#each teamForm.fields.description.issues() as issue}
      <p class="text-sm text-red-600 mt-1">{issue}</p>
    {/each}
  </div>

  <div>
    <label for="billing" class="block text-sm font-medium mb-1">Billing Email</label>
    <input
      {...teamForm.fields.billingEmail.as('email')}
      id="billing"
      class="w-full px-3 py-2 border rounded-lg"
    />
    {#each teamForm.fields.billingEmail.issues() as issue}
      <p class="text-sm text-red-600 mt-1">{issue}</p>
    {/each}
  </div>

  <input type="hidden" name="teamId" value={data.team.id} />

  <button
    type="submit"
    class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
  >
    Save Changes
  </button>
</form>
```

Let's break down the field helpers:

- **`.as('text')`** returns spread attributes (`name`, `type`, `value`) that wire the input to the form function. Use `'text'`, `'email'`, `'textarea'`, `'select'`, etc.
- **`.value()`** reads the field's current value reactively. We use it for the character counter on the description.
- **`.issues()`** returns an array of validation error strings. With preflight enabled, these appear instantly in the browser. Without preflight, they appear after the server responds.
- **`.set(value)`** programmatically updates a field. We use it in the `$effect` to pre-populate the form with existing team data.

The `.preflight()` call duplicates the validation schema on the client side. When the user submits, the browser validates first. If it passes, the request goes to the server, which validates again with its own schema. This is defense in depth — the client provides instant feedback, but the server is the authority.

## Avatar Upload with command()

Uploading a file does not fit neatly into a form with text fields. The avatar is a standalone mutation — select a file, upload it, done. This is exactly what `command()` is for:

```typescript
// src/lib/api/team.remote.ts (continued)
export const uploadAvatar = command(
  v.object({
    teamId: v.number(),
    fileName: v.string(),
    fileBase64: v.string()
  }),
  async ({ teamId, fileName, fileBase64 }) => {
    // Decode the base64 file on the server
    const buffer = Buffer.from(fileBase64, 'base64');

    // Save to disk or upload to S3/R2 — simplified here
    const avatarPath = `/uploads/teams/${teamId}/${fileName}`;
    await writeFile(`./static${avatarPath}`, buffer);

    // Update the team record
    await db
      .update(teams)
      .set({ avatarUrl: avatarPath })
      .where(eq(teams.id, teamId));

    return { avatarUrl: avatarPath };
  }
);
```

Wire it up in the component with an `<input type="file">` and a change event handler:

```svelte
<script lang="ts">
  import { uploadAvatar } from '$lib/api/team.remote';

  let { data } = $props();
  let avatarUrl = $state(data.team.avatarUrl);
  let uploading = $state(false);

  async function handleAvatarChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Validate on the client before sending
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be under 2 MB');
      return;
    }

    uploading = true;

    // Convert to base64 for transmission
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];

      const result = await uploadAvatar({
        teamId: data.team.id,
        fileName: file.name,
        fileBase64: base64
      });

      avatarUrl = result.avatarUrl;
      uploading = false;
    };

    reader.readAsDataURL(file);
  }
</script>

<div class="flex items-center gap-4 mb-8">
  {#if avatarUrl}
    <img
      src={avatarUrl}
      alt="{data.team.name} avatar"
      class="w-16 h-16 rounded-full object-cover"
    />
  {:else}
    <div class="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-xl font-bold">
      {data.team.name[0]}
    </div>
  {/if}

  <label class="cursor-pointer">
    <span class="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">
      {uploading ? 'Uploading...' : 'Change Avatar'}
    </span>
    <input
      type="file"
      accept="image/*"
      class="hidden"
      onchange={handleAvatarChange}
      disabled={uploading}
    />
  </label>
</div>
```

The command is called directly from the event handler — no form submission involved. The file is read as base64 on the client, sent to the server via the command's HTTP request, decoded, and written to storage. This is a common pattern for single-file uploads that do not need the progressive enhancement of a `<form>`.

## Sensitive Fields: The Invite Form

TeamBoard lets admins invite people by generating a one-time invite token. The token field should not be echoed back to the client if validation fails. Prefix it with an underscore to mark it as sensitive:

```typescript
// src/lib/api/team.remote.ts (continued)
const InviteSchema = v.object({
  teamId: v.number(),
  email: v.pipe(v.string(), v.email('Please enter a valid email')),
  role: v.picklist(['admin', 'member', 'viewer'], 'Invalid role'),
  _inviteToken: v.pipe(v.string(), v.minLength(1, 'Token is required'))
});

export const inviteMember = form(
  InviteSchema,
  async (data) => {
    // Verify the token is valid and not expired
    const validToken = await verifyInviteToken(data._inviteToken);
    if (!validToken) {
      return invalid(400, {
        _inviteToken: ['Invalid or expired invite token']
      });
    }

    // Create the invitation
    await db.insert(invitations).values({
      teamId: data.teamId,
      email: data.email,
      role: data.role,
      token: data._inviteToken,
      createdAt: new Date()
    });

    // Send invitation email
    await sendInviteEmail(data.email, data._inviteToken);
  }
);
```

The `_inviteToken` field is available in the handler but will not be sent back to the client if the form submission fails. This is the same mechanism you would use for passwords or API keys. In the component:

```svelte
<h2 class="text-lg font-semibold mt-10 mb-4">Invite Team Member</h2>

<form {...inviteMember} class="space-y-4 max-w-lg">
  <div>
    <label for="invite-email" class="block text-sm font-medium mb-1">Email Address</label>
    <input
      {...inviteMember.fields.email.as('email')}
      id="invite-email"
      placeholder="colleague@company.com"
      class="w-full px-3 py-2 border rounded-lg"
    />
    {#each inviteMember.fields.email.issues() as issue}
      <p class="text-sm text-red-600 mt-1">{issue}</p>
    {/each}
  </div>

  <div>
    <label for="role" class="block text-sm font-medium mb-1">Role</label>
    <select
      {...inviteMember.fields.role.as('select')}
      id="role"
      class="w-full px-3 py-2 border rounded-lg"
    >
      <option value="member">Member</option>
      <option value="admin">Admin</option>
      <option value="viewer">Viewer</option>
    </select>
  </div>

  <!-- The token is hidden and sensitive — not repopulated on failure -->
  <input
    {...inviteMember.fields._inviteToken.as('hidden')}
    value={data.currentInviteToken}
  />

  <button
    type="submit"
    class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
  >
    Send Invitation
  </button>
</form>
```

If the server returns a validation error (say, the email is already a member), the email field repopulates with the user's input, but `_inviteToken` stays empty. The server generates a fresh token on the next page load.

## Dirty Checking with $state.snapshot()

Users expect a warning when they have unsaved changes. The trick is comparing the current form values against the last saved state. `$state.snapshot()` takes a reactive object and returns a plain, non-reactive copy — perfect for deep comparisons:

```svelte
<script lang="ts">
  import { updateTeam } from '$lib/api/team.remote';

  let { data } = $props();

  // Store the original values as a plain snapshot
  let savedState = $state({
    name: data.team.name,
    description: data.team.description ?? '',
    billingEmail: data.team.billingEmail ?? ''
  });

  // Derive whether the form is dirty
  let isDirty = $derived.by(() => {
    const current = {
      name: teamForm.fields.name.value(),
      description: teamForm.fields.description.value(),
      billingEmail: teamForm.fields.billingEmail.value()
    };

    const snapshot = $state.snapshot(savedState);

    return (
      current.name !== snapshot.name ||
      current.description !== snapshot.description ||
      current.billingEmail !== snapshot.billingEmail
    );
  });
</script>

{#if isDirty}
  <div class="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
    <p class="text-sm text-amber-800">You have unsaved changes</p>
    <button
      type="button"
      class="text-sm text-amber-600 hover:underline"
      onclick={() => {
        // Reset fields to saved values
        const snapshot = $state.snapshot(savedState);
        teamForm.fields.name.set(snapshot.name);
        teamForm.fields.description.set(snapshot.description);
        teamForm.fields.billingEmail.set(snapshot.billingEmail);
      }}
    >
      Discard changes
    </button>
  </div>
{/if}
```

`$state.snapshot()` is the key here. Without it, you would be comparing reactive proxies, which can produce unexpected results during equality checks. The snapshot gives you a plain JavaScript object that behaves predictably with `===` and `!==`.

After a successful save, update the saved state to match the new values:

```svelte
<form
  {...teamForm}
  use:teamForm.enhance={() => {
    return async ({ result }) => {
      if (result.type === 'success') {
        // Update the saved state so isDirty becomes false
        savedState = {
          name: teamForm.fields.name.value(),
          description: teamForm.fields.description.value(),
          billingEmail: teamForm.fields.billingEmail.value()
        };
      }
    };
  }}
  class="space-y-6 max-w-lg"
>
  <!-- fields... -->
</form>
```

## Navigation Guard with beforeNavigate

The dirty checking banner is nice, but users might click a sidebar link without noticing it. `beforeNavigate` intercepts client-side navigations and gives you a chance to cancel:

```svelte
<script lang="ts">
  import { beforeNavigate } from '$app/navigation';

  beforeNavigate((navigation) => {
    if (isDirty) {
      const confirmed = confirm(
        'You have unsaved changes. Are you sure you want to leave?'
      );

      if (!confirmed) {
        navigation.cancel();
      }
    }
  });
</script>
```

When `isDirty` is true and the user tries to navigate away, a native confirmation dialog appears. If they click "Cancel", `navigation.cancel()` aborts the navigation entirely — they stay on the settings page. If they confirm, the navigation proceeds and their changes are lost.

A few details to keep in mind:

- `beforeNavigate` only catches client-side navigations. If the user types a new URL in the address bar or closes the tab, you need the `beforeunload` browser event instead.
- The `navigation` object includes `.to` (the destination URL), `.type` (link, popstate, goto), and `.cancel()`.
- Always check `isDirty` inside the callback, not outside. The callback captures the reactive value at call time.

To cover the browser-level case too:

```svelte
<svelte:window
  onbeforeunload={(event) => {
    if (isDirty) {
      event.preventDefault();
    }
  }}
/>
```

This triggers the browser's built-in "Leave site?" dialog when the user tries to close the tab or navigate away via the address bar.

## Preserving Form State with export const snapshot

What if the user navigates away from settings, realizes they forgot to save, and presses the back button? By default, the form resets to the server data. The `snapshot` export preserves the form state across navigations:

```svelte
<script lang="ts">
  import type { Snapshot } from './$types';
  import { updateTeam } from '$lib/api/team.remote';

  let { data } = $props();

  // Local state that mirrors form fields
  let formValues = $state({
    name: data.team.name,
    description: data.team.description ?? '',
    billingEmail: data.team.billingEmail ?? ''
  });

  // Keep form fields in sync with local state
  $effect(() => {
    teamForm.fields.name.set(formValues.name);
    teamForm.fields.description.set(formValues.description);
    teamForm.fields.billingEmail.set(formValues.billingEmail);
  });

  // Snapshot captures form values when navigating away
  export const snapshot: Snapshot<typeof formValues> = {
    capture: () => {
      return {
        name: teamForm.fields.name.value(),
        description: teamForm.fields.description.value(),
        billingEmail: teamForm.fields.billingEmail.value()
      };
    },
    restore: (value) => {
      formValues = value;
    }
  };
</script>
```

The `Snapshot` type requires two functions:

- **`capture()`** is called when the user navigates away. It returns a serializable value that SvelteKit stores in the browser's session history.
- **`restore(value)`** is called when the user navigates back. It receives the previously captured value and restores the component state.

This means a user can partially fill out the settings form, click away to check a board, press back, and find their half-written changes still intact. It is a small detail that makes the application feel polished.

The captured value must be serializable — no functions, no class instances, no circular references. Plain objects with primitives, arrays, and nested objects work fine.

## Putting It All Together

Here is the complete settings page with every feature wired up:

```svelte
<!-- src/routes/(app)/[teamSlug]/settings/+page.svelte -->
<script lang="ts">
  import type { Snapshot } from './$types';
  import { beforeNavigate } from '$app/navigation';
  import { updateTeam, uploadAvatar, inviteMember } from '$lib/api/team.remote';
  import * as v from 'valibot';

  let { data } = $props();

  // Set up the form with preflight validation
  const teamForm = updateTeam.preflight(
    v.object({
      teamId: v.number(),
      name: v.pipe(v.string(), v.minLength(2, 'Too short')),
      description: v.pipe(v.string(), v.maxLength(500, 'Too long')),
      billingEmail: v.pipe(v.string(), v.email('Invalid email'))
    })
  );

  // Track saved state for dirty checking
  let savedState = $state({
    name: data.team.name,
    description: data.team.description ?? '',
    billingEmail: data.team.billingEmail ?? ''
  });

  let isDirty = $derived.by(() => {
    const current = {
      name: teamForm.fields.name.value(),
      description: teamForm.fields.description.value(),
      billingEmail: teamForm.fields.billingEmail.value()
    };
    const snapshot = $state.snapshot(savedState);
    return (
      current.name !== snapshot.name ||
      current.description !== snapshot.description ||
      current.billingEmail !== snapshot.billingEmail
    );
  });

  // Navigation guard
  beforeNavigate((navigation) => {
    if (isDirty && !confirm('You have unsaved changes. Leave anyway?')) {
      navigation.cancel();
    }
  });

  // Avatar upload state
  let avatarUrl = $state(data.team.avatarUrl);
  let uploading = $state(false);

  async function handleAvatarChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !file.type.startsWith('image/') || file.size > 2_097_152) return;

    uploading = true;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const result = await uploadAvatar({
        teamId: data.team.id,
        fileName: file.name,
        fileBase64: base64
      });
      avatarUrl = result.avatarUrl;
      uploading = false;
    };
    reader.readAsDataURL(file);
  }

  // Snapshot for back/forward navigation
  export const snapshot: Snapshot = {
    capture: () => ({
      name: teamForm.fields.name.value(),
      description: teamForm.fields.description.value(),
      billingEmail: teamForm.fields.billingEmail.value()
    }),
    restore: (value) => {
      teamForm.fields.name.set(value.name);
      teamForm.fields.description.set(value.description);
      teamForm.fields.billingEmail.set(value.billingEmail);
    }
  };
</script>

<svelte:window
  onbeforeunload={(e) => { if (isDirty) e.preventDefault(); }}
/>

<h1 class="text-2xl font-bold mb-6">Team Settings</h1>

<!-- Avatar section -->
<div class="flex items-center gap-4 mb-8">
  {#if avatarUrl}
    <img src={avatarUrl} alt="Team avatar" class="w-16 h-16 rounded-full object-cover" />
  {:else}
    <div class="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-xl font-bold text-indigo-600">
      {data.team.name[0]}
    </div>
  {/if}
  <label class="cursor-pointer">
    <span class="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">
      {uploading ? 'Uploading...' : 'Change Avatar'}
    </span>
    <input type="file" accept="image/*" class="hidden" onchange={handleAvatarChange} disabled={uploading} />
  </label>
</div>

<!-- Unsaved changes banner -->
{#if isDirty}
  <div class="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
    You have unsaved changes
  </div>
{/if}

<!-- Team details form -->
<form
  {...teamForm}
  use:teamForm.enhance={() => {
    return async ({ result }) => {
      if (result.type === 'success') {
        savedState = {
          name: teamForm.fields.name.value(),
          description: teamForm.fields.description.value(),
          billingEmail: teamForm.fields.billingEmail.value()
        };
      }
    };
  }}
  class="space-y-6 max-w-lg"
>
  <div>
    <label for="name" class="block text-sm font-medium mb-1">Team Name</label>
    <input {...teamForm.fields.name.as('text')} id="name" class="w-full px-3 py-2 border rounded-lg" />
    {#each teamForm.fields.name.issues() as issue}
      <p class="text-sm text-red-600 mt-1">{issue}</p>
    {/each}
  </div>

  <div>
    <label for="desc" class="block text-sm font-medium mb-1">Description</label>
    <textarea {...teamForm.fields.description.as('textarea')} id="desc" rows="3" class="w-full px-3 py-2 border rounded-lg"></textarea>
    {#each teamForm.fields.description.issues() as issue}
      <p class="text-sm text-red-600 mt-1">{issue}</p>
    {/each}
  </div>

  <div>
    <label for="billing" class="block text-sm font-medium mb-1">Billing Email</label>
    <input {...teamForm.fields.billingEmail.as('email')} id="billing" class="w-full px-3 py-2 border rounded-lg" />
    {#each teamForm.fields.billingEmail.issues() as issue}
      <p class="text-sm text-red-600 mt-1">{issue}</p>
    {/each}
  </div>

  <input type="hidden" name="teamId" value={data.team.id} />

  <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
    Save Changes
  </button>
</form>

<!-- Invite form with sensitive token -->
<h2 class="text-lg font-semibold mt-12 mb-4">Invite Team Member</h2>

<form {...inviteMember} class="space-y-4 max-w-lg">
  <div>
    <label for="invite-email" class="block text-sm font-medium mb-1">Email</label>
    <input {...inviteMember.fields.email.as('email')} id="invite-email" class="w-full px-3 py-2 border rounded-lg" />
    {#each inviteMember.fields.email.issues() as issue}
      <p class="text-sm text-red-600 mt-1">{issue}</p>
    {/each}
  </div>

  <div>
    <label for="role" class="block text-sm font-medium mb-1">Role</label>
    <select {...inviteMember.fields.role.as('select')} id="role" class="w-full px-3 py-2 border rounded-lg">
      <option value="member">Member</option>
      <option value="admin">Admin</option>
      <option value="viewer">Viewer</option>
    </select>
  </div>

  <input {...inviteMember.fields._inviteToken.as('hidden')} value={data.currentInviteToken} />

  <button type="submit" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
    Send Invitation
  </button>
</form>
```

## Try It

Build out the settings page with these additions:

1. Add a "Team Slug" field to the update form that auto-generates from the team name (convert to lowercase, replace spaces with hyphens) but allows manual override. Display the resulting URL preview: `teamboard.app/{slug}`.
2. Add a second `command()` for deleting the team that requires the user to type the team name as confirmation. Wire it to a "Danger Zone" section at the bottom of the page.
3. Test the navigation guard by modifying a field, clicking a sidebar link, and canceling. Then confirm and verify the form resets on return.
4. Navigate away from a half-filled form, press the browser back button, and confirm the snapshot restores your draft.

## Key Takeaways

- `form()` remote functions pair a Valibot schema with a server handler — spread the result onto `<form>` for automatic wiring
- Field helpers `.as()`, `.value()`, `.issues()`, and `.set()` eliminate boilerplate for building form UIs
- `.preflight()` adds instant client-side validation while the server remains the source of truth
- `command()` handles mutations outside of forms — file uploads, toggles, and imperative actions
- Fields prefixed with `_` (like `_inviteToken`) are sensitive and will not be repopulated after validation failures
- `$state.snapshot()` creates a plain copy of reactive state, enabling reliable dirty checking with `===`
- `beforeNavigate` with `navigation.cancel()` prevents accidental navigation when changes are unsaved
- `svelte:window` with `onbeforeunload` catches browser-level exits (tab close, address bar navigation)
- `export const snapshot` with `capture()` and `restore()` preserves form state across browser history navigations
