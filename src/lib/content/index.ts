import type { Module } from '$lib/types/index.js';

export const courseModules: Module[] = [
	// Phase 1: Foundations (In-browser editor)
	{
		slug: '01-welcome',
		number: 1,
		title: 'Welcome to the Web',
		description: 'What is HTML, how browsers work, and your first Svelte component.',
		phase: 1,
		lessons: [
			{ slug: '01-what-is-web', number: 1, title: 'What is a Web Page?', description: 'How the internet and browsers work.', hasEditor: true },
			{ slug: '02-your-first-component', number: 2, title: 'Your First Svelte Component', description: 'Create a greeting card in Svelte.', hasEditor: true }
		]
	},
	{
		slug: '02-html-in-svelte',
		number: 2,
		title: 'HTML in Svelte',
		description: 'Headings, paragraphs, lists, images, and links inside .svelte files.',
		phase: 1,
		lessons: [
			{ slug: '01-text-elements', number: 1, title: 'Text Elements', description: 'Headings, paragraphs, and text formatting.', hasEditor: true },
			{ slug: '02-links-images', number: 2, title: 'Links & Images', description: 'Adding links and images to your page.', hasEditor: true },
			{ slug: '03-lists-structure', number: 3, title: 'Lists & Structure', description: 'Ordered lists, unordered lists, and semantic HTML.', hasEditor: true }
		]
	},
	{
		slug: '03-styling-css',
		number: 3,
		title: 'Styling with CSS',
		description: 'Scoped CSS in Svelte, colors, fonts, spacing, and the box model.',
		phase: 1,
		lessons: [
			{ slug: '01-css-basics', number: 1, title: 'CSS Basics', description: 'Colors, fonts, and your first styles.', hasEditor: true },
			{ slug: '02-box-model', number: 2, title: 'The Box Model', description: 'Padding, margin, borders, and sizing.', hasEditor: true },
			{ slug: '03-layout-basics', number: 3, title: 'Layout Basics', description: 'Display, positioning, and basic layout.', hasEditor: true }
		]
	},
	{
		slug: '04-interactivity',
		number: 4,
		title: 'Making Things Interactive',
		description: 'JavaScript basics, $state(), text interpolation, and click events.',
		phase: 1,
		lessons: [
			{ slug: '01-variables-state', number: 1, title: 'Variables & $state()', description: 'Declaring reactive state in Svelte 5.', hasEditor: true },
			{ slug: '02-text-interpolation', number: 2, title: 'Dynamic Text', description: 'Using {expressions} in your markup.', hasEditor: true },
			{ slug: '03-events', number: 3, title: 'Handling Events', description: 'Button clicks and user interactions.', hasEditor: true }
		]
	},
	{
		slug: '05-layouts',
		number: 5,
		title: 'Layouts & Responsive Design',
		description: 'Flexbox, CSS Grid, media queries, and responsive patterns.',
		phase: 1,
		lessons: [
			{ slug: '01-flexbox', number: 1, title: 'Flexbox', description: 'Flexible layouts with Flexbox.', hasEditor: true },
			{ slug: '02-css-grid', number: 2, title: 'CSS Grid', description: 'Two-dimensional layouts with Grid.', hasEditor: true },
			{ slug: '03-responsive', number: 3, title: 'Responsive Design', description: 'Media queries and mobile-first design.', hasEditor: true }
		]
	},
	{
		slug: '06-conditions-lists',
		number: 6,
		title: 'Conditions & Lists',
		description: '{#if}, {#each}, arrays, objects, and $derived().',
		phase: 1,
		lessons: [
			{ slug: '01-if-blocks', number: 1, title: 'Conditional Rendering', description: 'Show and hide content with {#if}.', hasEditor: true },
			{ slug: '02-each-blocks', number: 2, title: 'Rendering Lists', description: 'Loop through data with {#each}.', hasEditor: true },
			{ slug: '03-derived-state', number: 3, title: 'Derived State', description: 'Computed values with $derived().', hasEditor: true }
		]
	},
	{
		slug: '07-components',
		number: 7,
		title: 'Components & Props',
		description: 'Creating reusable components, $props(), and Phosphor Icons.',
		phase: 1,
		lessons: [
			{ slug: '01-creating-components', number: 1, title: 'Creating Components', description: 'Break your UI into reusable pieces.', hasEditor: true },
			{ slug: '02-props', number: 2, title: 'Component Props', description: 'Pass data with $props().', hasEditor: true },
			{ slug: '03-icons', number: 3, title: 'Using Phosphor Icons', description: 'Add beautiful icons to your components.', hasEditor: true }
		]
	},
	{
		slug: '08-forms',
		number: 8,
		title: 'Forms & User Input',
		description: 'Form elements, bind:value, $bindable(), and form events.',
		phase: 1,
		lessons: [
			{ slug: '01-inputs', number: 1, title: 'Input Elements', description: 'Text inputs, selects, and checkboxes.', hasEditor: true },
			{ slug: '02-binding', number: 2, title: 'Two-Way Binding', description: 'Bind values with bind:value and $bindable().', hasEditor: true },
			{ slug: '03-form-project', number: 3, title: 'Contact Form Project', description: 'Build a complete contact form with live preview.', hasEditor: true }
		]
	},

	// Phase 2: Intermediate
	{
		slug: '09-dev-environment',
		number: 9,
		title: 'Setting Up VS Code',
		description: 'Install VS Code, Node.js, and create your first local SvelteKit project.',
		phase: 2,
		lessons: [
			{ slug: '01-install-tools', number: 1, title: 'Installing Your Tools', description: 'VS Code, Node.js, and npm.', hasEditor: false },
			{ slug: '02-create-project', number: 2, title: 'Creating a SvelteKit Project', description: 'Using npx sv create.', hasEditor: false },
			{ slug: '03-project-tour', number: 3, title: 'Project Tour', description: 'Understanding the file structure.', hasEditor: false }
		]
	},
	{
		slug: '10-routing',
		number: 10,
		title: 'Pages & Routing',
		description: 'File-based routing, pages, layouts, and navigation.',
		phase: 2,
		lessons: [
			{ slug: '01-file-routing', number: 1, title: 'File-Based Routing', description: 'How SvelteKit routes work.', hasEditor: false },
			{ slug: '02-layouts', number: 2, title: 'Layouts', description: 'Shared layouts across pages.', hasEditor: false },
			{ slug: '03-navigation', number: 3, title: 'Navigation', description: 'Links and page transitions.', hasEditor: false }
		]
	},
	// Modules 11-16 (structure only — content will be written iteratively)
	{ slug: '11-typescript', number: 11, title: 'TypeScript Essentials', description: 'Types, interfaces, and type-safe Svelte.', phase: 2, lessons: [] },
	{ slug: '12-css-tokens', number: 12, title: 'CSS Custom Properties & Tokens', description: 'Design tokens and theming systems.', phase: 2, lessons: [] },
	{ slug: '13-tailwind', number: 13, title: 'Intro to Tailwind CSS v4', description: 'Utility-first CSS with Tailwind.', phase: 2, lessons: [] },
	{ slug: '14-gsap', number: 14, title: 'Animations with GSAP', description: 'GSAP basics and ScrollTrigger.', phase: 2, lessons: [] },
	{ slug: '15-data-loading', number: 15, title: 'Data Loading & SSR', description: 'Server load functions and SSR.', phase: 2, lessons: [] },
	{ slug: '16-snippets', number: 16, title: 'Snippets & Advanced Components', description: 'Snippets, shared state, and advanced patterns.', phase: 2, lessons: [] },

	// Phase 3: Full-Stack
	{ slug: '17-apis', number: 17, title: 'Working with APIs', description: 'Fetch, async/await, and consuming APIs.', phase: 3, lessons: [] },
	{ slug: '18-databases', number: 18, title: 'Databases with Drizzle', description: 'SQLite, Drizzle ORM, and CRUD.', phase: 3, lessons: [] },
	{ slug: '19-form-actions', number: 19, title: 'Form Actions', description: 'SvelteKit form actions and progressive enhancement.', phase: 3, lessons: [] },
	{ slug: '20-authentication', number: 20, title: 'Authentication', description: 'Sessions, cookies, and protected routes.', phase: 3, lessons: [] },
	{ slug: '21-advanced-tailwind', number: 21, title: 'Advanced Tailwind & Theming', description: 'Dark mode, custom themes, and responsive tokens.', phase: 3, lessons: [] },
	{ slug: '22-seo', number: 22, title: 'SEO & Performance', description: 'Meta tags, JSON-LD, and Core Web Vitals.', phase: 3, lessons: [] },
	{ slug: '23-advanced-gsap', number: 23, title: 'Advanced GSAP', description: 'Timelines, parallax, and page transitions.', phase: 3, lessons: [] },
	{ slug: '24-stripe', number: 24, title: 'Payments with Stripe', description: 'Stripe Checkout and webhooks.', phase: 3, lessons: [] },

	// Phase 4: Advanced
	{ slug: '25-api-routes', number: 25, title: 'API Routes & REST Design', description: 'Building REST APIs with SvelteKit.', phase: 4, lessons: [] },
	{ slug: '26-state-management', number: 26, title: 'State Management at Scale', description: 'Global state, context, and state machines.', phase: 4, lessons: [] },
	{ slug: '27-realtime', number: 27, title: 'Real-Time Features', description: 'SSE, WebSockets, and live updates.', phase: 4, lessons: [] },
	{ slug: '28-testing', number: 28, title: 'Testing & Quality', description: 'Vitest, Playwright, and CI pipelines.', phase: 4, lessons: [] },
	{ slug: '29-accessibility', number: 29, title: 'Accessibility & i18n', description: 'ARIA, keyboard nav, and internationalization.', phase: 4, lessons: [] },
	{ slug: '30-performance', number: 30, title: 'Performance & Optimization', description: 'Code splitting, caching, and Lighthouse 95+.', phase: 4, lessons: [] },

	// Phase 5: Capstone
	{ slug: '31-capstone-design', number: 31, title: 'Capstone: Architecture & Design', description: 'System design and project scaffolding.', phase: 5, lessons: [] },
	{ slug: '32-capstone-catalog', number: 32, title: 'Capstone: Product Catalog', description: 'Product listing, filtering, and search.', phase: 5, lessons: [] },
	{ slug: '33-capstone-checkout', number: 33, title: 'Capstone: Cart & Checkout', description: 'Shopping cart, auth, and Stripe payments.', phase: 5, lessons: [] },
	{ slug: '34-capstone-admin', number: 34, title: 'Capstone: Admin Dashboard', description: 'Product management and analytics.', phase: 5, lessons: [] },
	{ slug: '35-capstone-deploy', number: 35, title: 'Capstone: Deploy & Launch', description: 'Production deployment and monitoring.', phase: 5, lessons: [] }
];

export function getModule(slug: string): Module | undefined {
	return courseModules.find((m) => m.slug === slug);
}

export function getModuleByNumber(num: number): Module | undefined {
	return courseModules.find((m) => m.number === num);
}
