# Contact Form Project

It is time to put everything together. In this project, you will build a complete **multi-step registration form** with real-time validation, file upload with preview, draft persistence, and full accessibility. This combines nearly every concept you have learned: HTML form elements, CSS styling, `$state()`, `$derived()`, `$effect()`, `bind:value`, `{#if}` blocks, component structure, and progressive enhancement with SvelteKit form actions.

This is the kind of form you will build over and over in real-world projects — signing up users, collecting feedback, processing orders, onboarding workflows. Nail this pattern and you are ready for anything.

## The Goal

We are building a multi-step registration form with:
1. **Step 1**: Personal information (name, email, password) with real-time validation
2. **Step 2**: Profile details (avatar upload with preview, bio, website)
3. **Step 3**: Preferences (notification settings, timezone, newsletter opt-in)
4. **Step 4**: Review and confirm — a preview of all entered data
5. Step navigation with validation gates — you cannot advance past an invalid step
6. Form draft persistence via `localStorage` — reload the page and your data survives
7. Accessible error announcements and focus management
8. Server-side validation with Zod schemas
9. Progressive enhancement with `use:enhance`

## Step 1: Form State Architecture

The first architectural decision is how to organize state. With a multi-step form, you need state that is structured by step but accessible across all steps for the review page. A flat object with clear grouping works better than separate variables:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  // Form data organized by step
  let personal = $state({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  let profile = $state({
    avatar: null as File | null,
    avatarPreview: '' as string,
    bio: '',
    website: ''
  });

  let preferences = $state({
    notifications: 'email' as 'email' | 'push' | 'none',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    newsletter: false,
    marketingEmails: false
  });

  // Form UI state
  let currentStep = $state(1);
  let totalSteps = 4;
  let submitting = $state(false);
  let submitted = $state(false);
  let serverErrors = $state<Record<string, string>>({});

  // Track which fields the user has interacted with (touched)
  // Only show validation errors after a field has been touched
  let touched = $state<Set<string>>(new Set());

  function touch(field: string) {
    touched = new Set([...touched, field]);
  }
</script>
```

The `touched` set is a critical UX pattern. Without it, the form shows errors before the user has typed anything — "Email is required" on a blank form is annoying, not helpful. By tracking which fields have been interacted with, we only show errors for fields the user has actually visited and left.

## Step 2: Validation with $derived()

Validation rules live in `$derived` computations. They update automatically as the user types, with zero manual wiring:

```svelte
<script lang="ts">
  // === Personal Info Validation ===
  let firstNameError = $derived(
    personal.firstName.trim().length === 0
      ? 'First name is required'
      : personal.firstName.trim().length < 2
        ? 'Must be at least 2 characters'
        : personal.firstName.trim().length > 50
          ? 'Must be under 50 characters'
          : null
  );

  let lastNameError = $derived(
    personal.lastName.trim().length === 0
      ? 'Last name is required'
      : personal.lastName.trim().length < 2
        ? 'Must be at least 2 characters'
        : null
  );

  let emailError = $derived(() => {
    if (personal.email.length === 0) return 'Email is required';
    // RFC 5322 simplified — catches 99% of real email formats
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(personal.email)) return 'Enter a valid email address';
    return null;
  });

  let passwordError = $derived(() => {
    if (personal.password.length === 0) return 'Password is required';
    if (personal.password.length < 8) return 'Must be at least 8 characters';
    if (!/[A-Z]/.test(personal.password)) return 'Must include an uppercase letter';
    if (!/[a-z]/.test(personal.password)) return 'Must include a lowercase letter';
    if (!/[0-9]/.test(personal.password)) return 'Must include a number';
    return null;
  });

  let confirmPasswordError = $derived(
    personal.confirmPassword.length === 0
      ? 'Please confirm your password'
      : personal.confirmPassword !== personal.password
        ? 'Passwords do not match'
        : null
  );

  // Password strength indicator
  let passwordStrength = $derived(() => {
    const p = personal.password;
    if (p.length === 0) return { score: 0, label: '' };

    let score = 0;
    if (p.length >= 8) score++;
    if (p.length >= 12) score++;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;

    const labels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
    return { score, label: labels[Math.min(score, labels.length) - 1] || 'Very Weak' };
  });

  // === Profile Validation ===
  let bioError = $derived(
    profile.bio.length > 500 ? `Bio must be under 500 characters (${profile.bio.length}/500)` : null
  );

  let websiteError = $derived(() => {
    if (profile.website.length === 0) return null; // Optional field
    try {
      new URL(profile.website);
      return null;
    } catch {
      return 'Must be a valid URL (include https://)';
    }
  });

  let avatarError = $derived(() => {
    if (!profile.avatar) return null; // Optional
    if (profile.avatar.size > 5 * 1024 * 1024) return 'Image must be under 5MB';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(profile.avatar.type)) {
      return 'Must be JPEG, PNG, or WebP';
    }
    return null;
  });

  // === Step Validity ===
  let step1Valid = $derived(
    !firstNameError && !lastNameError && !emailError && !passwordError && !confirmPasswordError
  );

  let step2Valid = $derived(!bioError && !websiteError && !avatarError);

  let step3Valid = $derived(true); // Preferences are always valid (all have defaults)

  let formValid = $derived(step1Valid && step2Valid && step3Valid);

  // Check if a specific step is valid (used for navigation gates)
  function isStepValid(step: number): boolean {
    switch (step) {
      case 1: return step1Valid;
      case 2: return step2Valid;
      case 3: return step3Valid;
      default: return true;
    }
  }

  // Character counters
  let bioLength = $derived(profile.bio.trim().length);
</script>
```

Notice the validation functions return `null` for valid fields and an error string for invalid ones. This pattern makes conditional rendering clean: `{#if error && touched.has(field)}` shows the error only when it exists AND the user has interacted with the field.

## Step 3: Step Navigation with Validation Gates

The step navigation prevents users from advancing past invalid steps while allowing them to go back freely:

```svelte
<script lang="ts">
  // Attempt to go to the next step — only if current step is valid
  function nextStep() {
    // Touch all fields in the current step so errors become visible
    touchAllFieldsInStep(currentStep);

    if (!isStepValid(currentStep)) {
      // Focus the first invalid field
      announceError('Please fix the errors before continuing');
      focusFirstError();
      return;
    }

    if (currentStep < totalSteps) {
      currentStep++;
      // Focus the first field in the new step for keyboard users
      requestAnimationFrame(() => {
        const firstInput = document.querySelector<HTMLElement>(
          `[data-step="${currentStep}"] input, [data-step="${currentStep}"] select, [data-step="${currentStep}"] textarea`
        );
        firstInput?.focus();
      });
    }
  }

  function prevStep() {
    if (currentStep > 1) {
      currentStep--;
    }
  }

  // Go to a specific step (from the progress bar)
  function goToStep(step: number) {
    // Can always go back, but can only go forward if all previous steps are valid
    if (step < currentStep) {
      currentStep = step;
      return;
    }

    // Validate all steps up to the target
    for (let s = 1; s < step; s++) {
      if (!isStepValid(s)) {
        touchAllFieldsInStep(s);
        currentStep = s;
        announceError(`Please complete Step ${s} first`);
        return;
      }
    }

    currentStep = step;
  }

  function touchAllFieldsInStep(step: number) {
    const fieldsByStep: Record<number, string[]> = {
      1: ['firstName', 'lastName', 'email', 'password', 'confirmPassword'],
      2: ['avatar', 'bio', 'website'],
      3: ['notifications', 'timezone', 'newsletter']
    };

    const fields = fieldsByStep[step] ?? [];
    touched = new Set([...touched, ...fields]);
  }

  // Accessibility: announce errors to screen readers
  let announcement = $state('');
  function announceError(message: string) {
    announcement = message;
    // Clear after screen reader has time to announce
    setTimeout(() => { announcement = ''; }, 3000);
  }

  function focusFirstError() {
    requestAnimationFrame(() => {
      const firstError = document.querySelector<HTMLElement>('[aria-invalid="true"]');
      firstError?.focus();
    });
  }
</script>
```

The `requestAnimationFrame` calls are important — they wait for Svelte to finish updating the DOM before trying to find and focus elements. Without this, you might focus an element that does not exist yet or has stale ARIA attributes.

## Step 4: File Upload with Preview

File uploads need special handling. The `<input type="file">` does not support `bind:value` (for security reasons — scripts cannot set a file input's value). Instead, listen for the `change` event and read the file:

```svelte
<script lang="ts">
  function handleAvatarChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      profile.avatar = null;
      profile.avatarPreview = '';
      return;
    }

    profile.avatar = file;

    // Create a preview URL for the image
    // This is a blob URL that points to the file in memory
    if (profile.avatarPreview) {
      URL.revokeObjectURL(profile.avatarPreview); // Clean up the old preview
    }
    profile.avatarPreview = URL.createObjectURL(file);
    touch('avatar');
  }

  function removeAvatar() {
    profile.avatar = null;
    if (profile.avatarPreview) {
      URL.revokeObjectURL(profile.avatarPreview);
      profile.avatarPreview = '';
    }
    // Reset the file input so the same file can be selected again
    const input = document.getElementById('avatar') as HTMLInputElement;
    if (input) input.value = '';
  }
</script>
```

The `URL.createObjectURL()` call creates a temporary URL that points to the file in the browser's memory. It is efficient (no base64 encoding, no server round-trip) but must be cleaned up with `URL.revokeObjectURL()` when no longer needed to prevent memory leaks.

## Step 5: Form Draft Persistence

Users filling out long forms hate losing their progress. Persist the draft to `localStorage` so it survives page refreshes, accidental navigations, and browser crashes:

```svelte
<script lang="ts">
  const STORAGE_KEY = 'registration-draft';

  // Load saved draft on mount
  onMount(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        // Restore each section — merge with defaults so new fields are not undefined
        personal = { ...personal, ...draft.personal };
        // Do NOT restore passwords from localStorage (security)
        personal.password = '';
        personal.confirmPassword = '';
        preferences = { ...preferences, ...draft.preferences };
        profile.bio = draft.profile?.bio ?? '';
        profile.website = draft.profile?.website ?? '';
        // Cannot restore file uploads — they don't serialize
        currentStep = draft.currentStep ?? 1;
      } catch {
        // Corrupted data — ignore silently
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  });

  // Auto-save draft whenever form data changes
  $effect(() => {
    // Access all reactive values to create dependencies
    const draft = {
      personal: {
        firstName: personal.firstName,
        lastName: personal.lastName,
        email: personal.email
        // Intentionally exclude passwords
      },
      profile: {
        bio: profile.bio,
        website: profile.website
        // Cannot serialize File objects
      },
      preferences: { ...preferences },
      currentStep
    };

    // Debounce the save — don't hit localStorage on every keystroke
    const timer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    }, 500);

    return () => clearTimeout(timer);
  });

  function clearDraft() {
    localStorage.removeItem(STORAGE_KEY);
  }
</script>
```

Critical security detail: never persist passwords to `localStorage`. It is accessible to any JavaScript on the page (including XSS attacks) and persists even after the browser is closed. Persist the non-sensitive fields and let users re-enter passwords.

The `$effect` with a `setTimeout` creates an auto-saving debounce — it waits 500ms after the last change before writing to `localStorage`. The cleanup function (`return () => clearTimeout(timer)`) cancels pending saves when the next change arrives, preventing unnecessary writes.

## Step 6: The Progress Bar

A progress bar shows users where they are and lets them jump to completed steps:

```svelte
<!-- Step Progress Bar -->
<nav aria-label="Form progress" class="progress-bar">
  {#each Array(totalSteps) as _, i}
    {@const step = i + 1}
    {@const stepLabels = ['Personal', 'Profile', 'Preferences', 'Review']}
    <button
      type="button"
      class="step-indicator"
      class:active={currentStep === step}
      class:completed={step < currentStep}
      class:disabled={step > currentStep && !isStepValid(currentStep)}
      aria-current={currentStep === step ? 'step' : undefined}
      aria-label="{stepLabels[i]}, Step {step} of {totalSteps}{step < currentStep ? ', completed' : ''}"
      onclick={() => goToStep(step)}
      disabled={step > currentStep && !isStepValid(currentStep)}
    >
      <span class="step-number">
        {#if step < currentStep}
          <!-- Checkmark for completed steps -->
          <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
          </svg>
        {:else}
          {step}
        {/if}
      </span>
      <span class="step-label">{stepLabels[i]}</span>
    </button>
  {/each}
</nav>

<!-- Live region for screen reader announcements -->
<div
  aria-live="assertive"
  aria-atomic="true"
  class="sr-only"
>
  {announcement}
</div>
```

The `aria-live="assertive"` region announces validation errors to screen reader users. The `aria-current="step"` attribute marks the active step. These are not optional niceties — they are the difference between a form that works for everyone and one that excludes users who rely on assistive technology.

## Step 7: The Form Markup

Each step is a section that shows or hides based on `currentStep`. The entire form is wrapped in a single `<form>` element for progressive enhancement:

```svelte
{#if submitted}
  <div class="success" role="alert">
    <h2>Registration Complete!</h2>
    <p>Welcome, {personal.firstName}! Check {personal.email} for a confirmation link.</p>
    <button type="button" onclick={resetForm}>Start Over</button>
  </div>
{:else}
  <div class="form-container">
    <form method="POST" use:enhance={handleSubmit}>
      <h2>Create Your Account</h2>

      <!-- Step 1: Personal Information -->
      {#if currentStep === 1}
        <fieldset data-step="1">
          <legend class="sr-only">Personal Information</legend>

          <div class="field">
            <label for="firstName">First Name <span aria-hidden="true">*</span></label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              bind:value={personal.firstName}
              onblur={() => touch('firstName')}
              aria-required="true"
              aria-invalid={touched.has('firstName') && !!firstNameError}
              aria-describedby={touched.has('firstName') && firstNameError ? 'firstName-error' : undefined}
              autocomplete="given-name"
              placeholder="Jane"
            />
            {#if touched.has('firstName') && firstNameError}
              <span id="firstName-error" class="error" role="alert">{firstNameError}</span>
            {/if}
          </div>

          <div class="field">
            <label for="lastName">Last Name <span aria-hidden="true">*</span></label>
            <input
              id="lastName"
              name="lastName"
              type="text"
              bind:value={personal.lastName}
              onblur={() => touch('lastName')}
              aria-required="true"
              aria-invalid={touched.has('lastName') && !!lastNameError}
              aria-describedby={touched.has('lastName') && lastNameError ? 'lastName-error' : undefined}
              autocomplete="family-name"
              placeholder="Doe"
            />
            {#if touched.has('lastName') && lastNameError}
              <span id="lastName-error" class="error" role="alert">{lastNameError}</span>
            {/if}
          </div>

          <div class="field">
            <label for="email">Email <span aria-hidden="true">*</span></label>
            <input
              id="email"
              name="email"
              type="email"
              bind:value={personal.email}
              onblur={() => touch('email')}
              aria-required="true"
              aria-invalid={touched.has('email') && !!emailError}
              aria-describedby={touched.has('email') && emailError ? 'email-error' : undefined}
              autocomplete="email"
              placeholder="jane@example.com"
            />
            {#if touched.has('email') && emailError}
              <span id="email-error" class="error" role="alert">{emailError}</span>
            {/if}
            {#if serverErrors.email}
              <span class="error" role="alert">{serverErrors.email}</span>
            {/if}
          </div>

          <div class="field">
            <label for="password">Password <span aria-hidden="true">*</span></label>
            <input
              id="password"
              name="password"
              type="password"
              bind:value={personal.password}
              onblur={() => touch('password')}
              aria-required="true"
              aria-invalid={touched.has('password') && !!passwordError}
              aria-describedby="password-requirements {touched.has('password') && passwordError ? 'password-error' : ''}"
              autocomplete="new-password"
            />
            <div id="password-requirements" class="hint">
              8+ characters with uppercase, lowercase, and a number
            </div>
            {#if touched.has('password') && passwordError}
              <span id="password-error" class="error" role="alert">{passwordError}</span>
            {/if}

            <!-- Password strength meter -->
            {#if personal.password.length > 0}
              <div class="strength-meter" aria-label="Password strength: {passwordStrength.label}">
                <div
                  class="strength-bar"
                  style="width: {(passwordStrength.score / 5) * 100}%"
                  class:weak={passwordStrength.score <= 2}
                  class:fair={passwordStrength.score === 3}
                  class:strong={passwordStrength.score >= 4}
                ></div>
                <span class="strength-label">{passwordStrength.label}</span>
              </div>
            {/if}
          </div>

          <div class="field">
            <label for="confirmPassword">Confirm Password <span aria-hidden="true">*</span></label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              bind:value={personal.confirmPassword}
              onblur={() => touch('confirmPassword')}
              aria-required="true"
              aria-invalid={touched.has('confirmPassword') && !!confirmPasswordError}
              aria-describedby={touched.has('confirmPassword') && confirmPasswordError ? 'confirm-error' : undefined}
              autocomplete="new-password"
            />
            {#if touched.has('confirmPassword') && confirmPasswordError}
              <span id="confirm-error" class="error" role="alert">{confirmPasswordError}</span>
            {/if}
          </div>
        </fieldset>
      {/if}

      <!-- Step 2: Profile Details -->
      {#if currentStep === 2}
        <fieldset data-step="2">
          <legend class="sr-only">Profile Details</legend>

          <div class="field">
            <label for="avatar">Profile Photo (optional)</label>
            <div class="avatar-upload">
              {#if profile.avatarPreview}
                <div class="avatar-preview">
                  <img
                    src={profile.avatarPreview}
                    alt="Avatar preview"
                    width={96}
                    height={96}
                  />
                  <button
                    type="button"
                    class="remove-avatar"
                    onclick={removeAvatar}
                    aria-label="Remove avatar"
                  >
                    Remove
                  </button>
                </div>
              {/if}
              <input
                id="avatar"
                name="avatar"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onchange={handleAvatarChange}
                aria-describedby="avatar-hint"
              />
              <span id="avatar-hint" class="hint">JPEG, PNG, or WebP. Max 5MB.</span>
            </div>
            {#if touched.has('avatar') && avatarError}
              <span class="error" role="alert">{avatarError}</span>
            {/if}
          </div>

          <div class="field">
            <label for="bio">Bio ({bioLength}/500 characters)</label>
            <textarea
              id="bio"
              name="bio"
              bind:value={profile.bio}
              onblur={() => touch('bio')}
              rows="4"
              maxlength="500"
              aria-invalid={touched.has('bio') && !!bioError}
              placeholder="Tell us about yourself..."
            ></textarea>
            {#if touched.has('bio') && bioError}
              <span class="error" role="alert">{bioError}</span>
            {/if}
          </div>

          <div class="field">
            <label for="website">Website (optional)</label>
            <input
              id="website"
              name="website"
              type="url"
              bind:value={profile.website}
              onblur={() => touch('website')}
              aria-invalid={touched.has('website') && !!websiteError}
              aria-describedby={touched.has('website') && websiteError ? 'website-error' : undefined}
              placeholder="https://yoursite.com"
              autocomplete="url"
            />
            {#if touched.has('website') && websiteError}
              <span id="website-error" class="error" role="alert">{websiteError}</span>
            {/if}
          </div>
        </fieldset>
      {/if}

      <!-- Step 3: Preferences -->
      {#if currentStep === 3}
        <fieldset data-step="3">
          <legend class="sr-only">Preferences</legend>

          <div class="field">
            <label for="notifications">Notification Preference</label>
            <select
              id="notifications"
              name="notifications"
              bind:value={preferences.notifications}
            >
              <option value="email">Email notifications</option>
              <option value="push">Push notifications</option>
              <option value="none">No notifications</option>
            </select>
          </div>

          <div class="field">
            <label for="timezone">Timezone</label>
            <select id="timezone" name="timezone" bind:value={preferences.timezone}>
              {#each Intl.supportedValuesOf('timeZone') as tz}
                <option value={tz}>{tz.replace(/_/g, ' ')}</option>
              {/each}
            </select>
          </div>

          <div class="field checkbox-group">
            <label class="checkbox-label">
              <input
                type="checkbox"
                name="newsletter"
                bind:checked={preferences.newsletter}
              />
              <span>Subscribe to the weekly newsletter</span>
            </label>

            <label class="checkbox-label">
              <input
                type="checkbox"
                name="marketingEmails"
                bind:checked={preferences.marketingEmails}
              />
              <span>Receive product updates and promotional emails</span>
            </label>
          </div>
        </fieldset>
      {/if}

      <!-- Step 4: Review -->
      {#if currentStep === 4}
        <div data-step="4" class="review">
          <h3>Review Your Information</h3>

          <div class="review-section">
            <h4>
              Personal Information
              <button type="button" class="edit-link" onclick={() => goToStep(1)}>Edit</button>
            </h4>
            <dl>
              <dt>Name</dt>
              <dd>{personal.firstName} {personal.lastName}</dd>
              <dt>Email</dt>
              <dd>{personal.email}</dd>
            </dl>
          </div>

          <div class="review-section">
            <h4>
              Profile
              <button type="button" class="edit-link" onclick={() => goToStep(2)}>Edit</button>
            </h4>
            <dl>
              {#if profile.avatarPreview}
                <dt>Photo</dt>
                <dd>
                  <img
                    src={profile.avatarPreview}
                    alt="Avatar"
                    width={48}
                    height={48}
                    class="review-avatar"
                  />
                </dd>
              {/if}
              <dt>Bio</dt>
              <dd>{profile.bio || '(not set)'}</dd>
              <dt>Website</dt>
              <dd>{profile.website || '(not set)'}</dd>
            </dl>
          </div>

          <div class="review-section">
            <h4>
              Preferences
              <button type="button" class="edit-link" onclick={() => goToStep(3)}>Edit</button>
            </h4>
            <dl>
              <dt>Notifications</dt>
              <dd>{preferences.notifications}</dd>
              <dt>Timezone</dt>
              <dd>{preferences.timezone}</dd>
              <dt>Newsletter</dt>
              <dd>{preferences.newsletter ? 'Yes' : 'No'}</dd>
            </dl>
          </div>
        </div>
      {/if}

      <!-- Navigation Buttons -->
      <div class="form-nav">
        {#if currentStep > 1}
          <button type="button" class="btn-secondary" onclick={prevStep}>
            Back
          </button>
        {:else}
          <div></div> <!-- Spacer for flex alignment -->
        {/if}

        {#if currentStep < totalSteps}
          <button type="button" class="btn-primary" onclick={nextStep}>
            Continue
          </button>
        {:else}
          <button
            type="submit"
            class="btn-primary btn-submit"
            disabled={!formValid || submitting}
          >
            {#if submitting}
              Creating Account...
            {:else}
              Create Account
            {/if}
          </button>
        {/if}
      </div>

      {#if currentStep > 1}
        <p class="draft-notice">
          Your progress is saved automatically.
          <button type="button" class="text-link" onclick={() => { clearDraft(); resetForm(); }}>
            Clear draft
          </button>
        </p>
      {/if}
    </form>
  </div>
{/if}
```

### Accessibility Deep Dive

Every form element in the markup above follows accessibility best practices that are worth understanding:

- **`aria-required="true"`** on required fields communicates to screen readers that the field must be filled
- **`aria-invalid="true"`** marks fields with errors — screen readers announce "invalid entry" when the user focuses the field
- **`aria-describedby`** links the field to its error message or hint text — the screen reader reads both the label and the description
- **`role="alert"`** on error messages causes them to be announced immediately when they appear, even if the user is not focused on that field
- **`autocomplete`** attributes (`given-name`, `family-name`, `email`, `new-password`) enable browser autofill and password managers
- **`<fieldset>` and `<legend>`** group related fields — screen readers announce "Personal Information group" when entering the fieldset
- **`aria-current="step"`** on the progress bar marks the active step for screen readers
- **The `sr-only` class** hides content visually but keeps it available to screen readers

## Step 8: Progressive Enhancement with use:enhance

The `use:enhance` action intercepts the form submission and handles it with JavaScript. Without JavaScript, the form submits normally as a standard HTML form POST:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';

  function handleSubmit() {
    return async ({ result, update }) => {
      submitting = true;

      if (result.type === 'success') {
        submitted = true;
        clearDraft();
      } else if (result.type === 'failure') {
        // Server returned validation errors
        serverErrors = result.data?.errors ?? {};
        if (result.data?.step) {
          currentStep = result.data.step;
        }
        announceError('There were errors with your submission. Please review and try again.');
      } else if (result.type === 'error') {
        announceError('An unexpected error occurred. Please try again.');
      }

      submitting = false;

      // Do NOT call update() — we handle the UI update ourselves
      // Calling update() would trigger SvelteKit's default form behavior
    };
  }

  function resetForm() {
    personal = { firstName: '', lastName: '', email: '', password: '', confirmPassword: '' };
    profile = { avatar: null, avatarPreview: '', bio: '', website: '' };
    preferences = { notifications: 'email', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, newsletter: false, marketingEmails: false };
    currentStep = 1;
    submitted = false;
    submitting = false;
    touched = new Set();
    serverErrors = {};
    clearDraft();
  }
</script>
```

## Step 9: Server-Side Validation with Zod

Client-side validation is for UX — it gives instant feedback. Server-side validation is for security — it cannot be bypassed. Always validate on both sides:

```typescript
// src/routes/register/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from '$lib/server/auth';

const RegisterSchema = z.object({
  firstName: z.string().min(2, 'At least 2 characters').max(50).trim(),
  lastName: z.string().min(2, 'At least 2 characters').max(50).trim(),
  email: z.string().email('Invalid email address').max(255).toLowerCase().trim(),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Must include an uppercase letter')
    .regex(/[a-z]/, 'Must include a lowercase letter')
    .regex(/[0-9]/, 'Must include a number'),
  confirmPassword: z.string(),
  bio: z.string().max(500).optional().default(''),
  website: z.string().url().optional().or(z.literal('')),
  notifications: z.enum(['email', 'push', 'none']).default('email'),
  timezone: z.string().default('UTC'),
  newsletter: z.preprocess((v) => v === 'on' || v === 'true', z.boolean().default(false)),
  marketingEmails: z.preprocess((v) => v === 'on' || v === 'true', z.boolean().default(false))
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
});

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const formData = await request.formData();

    // Convert FormData to an object for Zod validation
    const raw = Object.fromEntries(formData);

    const result = RegisterSchema.safeParse(raw);

    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0]?.toString() ?? 'form';
        errors[field] = issue.message;
      }

      // Determine which step has the first error
      const step1Fields = ['firstName', 'lastName', 'email', 'password', 'confirmPassword'];
      const step2Fields = ['bio', 'website'];
      const errorFields = Object.keys(errors);

      let step = 3;
      if (errorFields.some(f => step1Fields.includes(f))) step = 1;
      else if (errorFields.some(f => step2Fields.includes(f))) step = 2;

      return fail(400, { errors, step });
    }

    const { firstName, lastName, email, password, bio, website, notifications, timezone, newsletter, marketingEmails } = result.data;

    // Check if email already exists
    const existing = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      return fail(400, {
        errors: { email: 'An account with this email already exists' },
        step: 1
      });
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);

    // Handle file upload (avatar)
    const avatarFile = formData.get('avatar') as File | null;
    let avatarUrl: string | null = null;
    if (avatarFile && avatarFile.size > 0) {
      // Validate file on server too
      if (avatarFile.size > 5 * 1024 * 1024) {
        return fail(400, { errors: { avatar: 'Image must be under 5MB' }, step: 2 });
      }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(avatarFile.type)) {
        return fail(400, { errors: { avatar: 'Invalid image format' }, step: 2 });
      }
      // In production: upload to S3/R2/Cloudinary and get the URL
      // avatarUrl = await uploadToStorage(avatarFile);
    }

    await db.insert(users).values({
      firstName,
      lastName,
      email,
      passwordHash,
      bio,
      website: website || null,
      avatarUrl,
      notifications,
      timezone,
      newsletter,
      marketingEmails
    });

    // Create session and redirect (covered in auth lessons)
    // For now, return success
    return { success: true };
  }
};
```

The `z.preprocess` calls for checkbox fields handle the fact that HTML checkboxes send `"on"` when checked and nothing when unchecked. The FormData object will have `"on"` or be missing entirely — the preprocessor normalizes this to a boolean.

## Step 10: Styling

Add polished styles that work across the multi-step flow:

```svelte
<style>
  .form-container {
    max-width: 600px;
    margin: 2rem auto;
    padding: 2rem;
  }

  .progress-bar {
    display: flex;
    justify-content: space-between;
    margin-bottom: 2rem;
    position: relative;
  }

  .progress-bar::before {
    content: '';
    position: absolute;
    top: 20px;
    left: 40px;
    right: 40px;
    height: 2px;
    background: #e2e8f0;
    z-index: 0;
  }

  .step-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    background: none;
    border: none;
    cursor: pointer;
    z-index: 1;
    padding: 0;
  }

  .step-indicator:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .step-number {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 0.9rem;
    background: #e2e8f0;
    color: #64748b;
    transition: all 0.2s;
  }

  .step-indicator.active .step-number {
    background: #3b82f6;
    color: white;
  }

  .step-indicator.completed .step-number {
    background: #22c55e;
    color: white;
  }

  .step-label {
    font-size: 0.8rem;
    color: #64748b;
    font-weight: 500;
  }

  .step-indicator.active .step-label {
    color: #3b82f6;
    font-weight: 600;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  fieldset {
    border: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  label {
    font-weight: 600;
    font-size: 0.9rem;
    color: #374151;
  }

  input, select, textarea {
    padding: 0.625rem 0.75rem;
    border: 2px solid #d1d5db;
    border-radius: 0.5rem;
    font-size: 1rem;
    font-family: inherit;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  input[aria-invalid="true"],
  textarea[aria-invalid="true"] {
    border-color: #ef4444;
  }

  input[aria-invalid="true"]:focus,
  textarea[aria-invalid="true"]:focus {
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
  }

  .error {
    color: #ef4444;
    font-size: 0.8rem;
    font-weight: 500;
  }

  .hint {
    color: #6b7280;
    font-size: 0.8rem;
  }

  .strength-meter {
    height: 4px;
    background: #e5e7eb;
    border-radius: 2px;
    overflow: hidden;
    margin-top: 0.25rem;
  }

  .strength-bar {
    height: 100%;
    transition: width 0.3s, background-color 0.3s;
    border-radius: 2px;
  }

  .strength-bar.weak { background: #ef4444; }
  .strength-bar.fair { background: #f59e0b; }
  .strength-bar.strong { background: #22c55e; }

  .strength-label {
    font-size: 0.75rem;
    color: #6b7280;
  }

  textarea {
    resize: vertical;
    min-height: 100px;
  }

  .avatar-upload {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .avatar-preview {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .avatar-preview img {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid #e5e7eb;
  }

  .remove-avatar {
    background: none;
    border: 1px solid #ef4444;
    color: #ef4444;
    padding: 0.25rem 0.75rem;
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .checkbox-label {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    font-weight: normal;
    cursor: pointer;
  }

  .checkbox-label input[type="checkbox"] {
    margin-top: 0.25rem;
    width: 1.125rem;
    height: 1.125rem;
  }

  .form-nav {
    display: flex;
    justify-content: space-between;
    margin-top: 1.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid #e5e7eb;
  }

  .btn-primary, .btn-secondary {
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-primary {
    background: #3b82f6;
    color: white;
    border: none;
  }

  .btn-primary:hover:not(:disabled) {
    background: #2563eb;
  }

  .btn-primary:disabled {
    background: #93c5fd;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: white;
    color: #374151;
    border: 2px solid #d1d5db;
  }

  .btn-secondary:hover {
    background: #f9fafb;
  }

  .review {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .review-section {
    padding: 1rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 0.5rem;
  }

  .review-section h4 {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 0 0 0.75rem;
    font-size: 0.95rem;
  }

  .edit-link {
    background: none;
    border: none;
    color: #3b82f6;
    cursor: pointer;
    font-size: 0.85rem;
    text-decoration: underline;
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.5rem 1rem;
    margin: 0;
    font-size: 0.9rem;
  }

  dt {
    color: #6b7280;
    font-weight: 500;
  }

  dd {
    margin: 0;
    color: #111827;
  }

  .review-avatar {
    border-radius: 50%;
    object-fit: cover;
  }

  .success {
    text-align: center;
    padding: 3rem 1.5rem;
    max-width: 500px;
    margin: 0 auto;
  }

  .success h2 {
    color: #22c55e;
    margin-bottom: 0.5rem;
  }

  .draft-notice {
    text-align: center;
    font-size: 0.8rem;
    color: #9ca3af;
    margin-top: 0.5rem;
  }

  .text-link {
    background: none;
    border: none;
    color: #6b7280;
    cursor: pointer;
    text-decoration: underline;
    font-size: inherit;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 640px) {
    .form-container {
      padding: 1rem;
    }

    .step-label {
      display: none;
    }

    dl {
      grid-template-columns: 1fr;
    }

    dt {
      margin-top: 0.5rem;
    }
  }
</style>
```

## What You Used

This project combined concepts from multiple phases of the course:
- **HTML**: form, input, select, textarea, fieldset, legend, label, button, dl/dt/dd, progress elements
- **CSS**: Grid layout, Flexbox, transitions, pseudo-elements (progress bar connector), media queries, `:focus` styling, `aspect-ratio`
- **JavaScript**: `$state()` for reactive form data, `$derived()` for validation rules and computed values, `$effect()` for auto-save persistence, `Set` for tracking touched fields
- **Svelte**: `bind:value`, `bind:checked`, `{#if}`, `{#each}`, `class:`, event handling, `onMount`, `use:enhance`
- **SvelteKit**: form actions, `fail()` for validation errors, server-side Zod validation, progressive enhancement
- **Accessibility**: ARIA attributes (`aria-required`, `aria-invalid`, `aria-describedby`, `aria-live`, `aria-current`), focus management, screen reader announcements, `autocomplete` attributes
- **Security**: server-side validation that mirrors client validation, password hashing, file upload validation, no passwords in localStorage

## Try It

Build this form step by step:

1. Start with Step 1 only — personal info fields with `$state()`, `$derived()` validation, and the touched pattern. Get the validation working perfectly before moving on.

2. Add the step navigation with the progress bar. Verify that you cannot advance past Step 1 without filling all fields correctly.

3. Add Step 2 with the file upload. Test that the preview appears, the file size/type validation works, and the remove button cleans up properly.

4. Add Step 3 with preferences. These fields all have defaults so they are always valid.

5. Add Step 4 — the review page. Include "Edit" buttons that jump back to the correct step.

6. Add localStorage persistence. Refresh the page and verify your data survives. Type in a password, refresh, and verify it is NOT restored.

7. Add the server action with Zod validation. Test with JavaScript disabled to verify the form still works as a standard POST.

8. Run a screen reader (VoiceOver on Mac, NVDA on Windows) and navigate the form. Fix any issues you find — missing labels, broken tab order, unannounced errors.

## Key Takeaways

- Combine `$state()` and `bind:value` to track form inputs reactively — each field gets its own reactive variable
- Use `$derived()` to create real-time validation rules that return `null` for valid and an error string for invalid
- Track "touched" fields with a `Set` to avoid showing errors before the user has interacted with a field
- Multi-step forms need validation gates: touch all fields in the current step and check validity before advancing
- File uploads require `onchange` events (not `bind:value`), `URL.createObjectURL()` for previews, and `URL.revokeObjectURL()` for cleanup
- Persist form drafts to `localStorage` with `$effect()` — but never persist sensitive data like passwords
- Accessibility is not optional: use `aria-required`, `aria-invalid`, `aria-describedby`, `role="alert"`, and focus management for every form
- Always validate on both client (for UX) and server (for security) — client validation can be bypassed
- `use:enhance` gives you progressive enhancement: forms work without JavaScript, and JavaScript enhances the experience
- The `autocomplete` attribute enables browser autofill and password managers — always include it
- Server-side validation with Zod mirrors client validation rules and returns structured errors with `fail()`
