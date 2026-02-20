<script lang="ts">
	import Nav from '$lib/components/layout/Nav.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';
	import '../app.css';

	let { children, data } = $props();
</script>

<Nav user={data.user} />

<main>
	{@render children()}
</main>

<Footer />

<style>
	main {
		min-height: calc(100vh - 120px);
	}
</style>
