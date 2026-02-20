<script lang="ts">
	import { enhance } from '$app/forms';
	import { Envelope, Lock, User } from 'phosphor-svelte';

	let { form } = $props();
</script>

<svelte:head>
	<title>Sign Up | Svelte 5 Bootcamp</title>
	<meta name="description" content="Create your account and start learning Svelte 5 from scratch." />
</svelte:head>

<div class="auth-page">
	<div class="auth-card">
		<h1>Create Your Account</h1>
		<p class="subtitle">Start your journey to becoming a Svelte developer.</p>

		{#if form?.error}
			<div class="error-message">{form.error}</div>
		{/if}

		<form method="POST" use:enhance>
			<div class="field">
				<label for="name">
					<User size={18} />
					Full Name
				</label>
				<input
					type="text"
					id="name"
					name="name"
					value={form?.name ?? ''}
					placeholder="Your name"
					required
				/>
			</div>

			<div class="field">
				<label for="email">
					<Envelope size={18} />
					Email
				</label>
				<input
					type="email"
					id="email"
					name="email"
					value={form?.email ?? ''}
					placeholder="you@example.com"
					required
				/>
			</div>

			<div class="field">
				<label for="password">
					<Lock size={18} />
					Password
				</label>
				<input
					type="password"
					id="password"
					name="password"
					placeholder="At least 8 characters"
					minlength="8"
					required
				/>
			</div>

			<button type="submit" class="btn-primary">Create Account</button>
		</form>

		<p class="switch-auth">
			Already have an account? <a href="/login">Log in</a>
		</p>
	</div>
</div>

<style>
	.auth-page {
		min-height: 80vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-xl);
	}

	.auth-card {
		width: 100%;
		max-width: 420px;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		padding: var(--space-2xl);
		box-shadow: var(--shadow-lg);
	}

	h1 {
		font-size: var(--text-2xl);
		margin: 0 0 var(--space-xs);
	}

	.subtitle {
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-xl);
	}

	.error-message {
		background: #fef2f2;
		color: var(--color-error);
		padding: var(--space-sm) var(--space-md);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-md);
		font-size: var(--text-sm);
	}

	.field {
		margin-bottom: var(--space-md);
	}

	label {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		font-size: var(--text-sm);
		font-weight: 500;
		margin-bottom: var(--space-xs);
		color: var(--color-text-secondary);
	}

	input {
		width: 100%;
		padding: var(--space-sm) var(--space-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: var(--text-base);
		font-family: inherit;
		transition: border-color var(--transition-fast);
	}

	input:focus {
		outline: none;
		border-color: var(--color-brand);
		box-shadow: 0 0 0 3px rgba(255, 62, 0, 0.1);
	}

	.btn-primary {
		width: 100%;
		padding: var(--space-sm) var(--space-md);
		background: var(--color-brand);
		color: white;
		border: none;
		border-radius: var(--radius-md);
		font-size: var(--text-base);
		font-weight: 600;
		cursor: pointer;
		transition: background var(--transition-fast);
		margin-top: var(--space-sm);
	}

	.btn-primary:hover {
		background: var(--color-brand-dark);
	}

	.switch-auth {
		text-align: center;
		margin-top: var(--space-lg);
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}
</style>
