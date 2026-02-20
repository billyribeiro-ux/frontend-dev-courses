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
	// Modules 11-16
	{
		slug: '11-typescript',
		number: 11,
		title: 'TypeScript Essentials',
		description: 'Types, interfaces, and type-safe Svelte.',
		phase: 2,
		lessons: [
			{ slug: '01-type-basics', number: 1, title: 'Type Basics', description: 'Type annotations, basic types, and why TypeScript.', hasEditor: false },
			{ slug: '02-interfaces', number: 2, title: 'Interfaces & Types', description: 'Defining interfaces, type aliases, and optional properties.', hasEditor: false },
			{ slug: '03-typing-svelte', number: 3, title: 'TypeScript in Svelte', description: 'Typing $props(), $state, and event handlers.', hasEditor: false }
		]
	},
	{
		slug: '12-css-tokens',
		number: 12,
		title: 'CSS Custom Properties & Tokens',
		description: 'Design tokens and theming systems.',
		phase: 2,
		lessons: [
			{ slug: '01-custom-properties', number: 1, title: 'CSS Custom Properties', description: 'var() and --variable syntax.', hasEditor: false },
			{ slug: '02-design-tokens', number: 2, title: 'Design Tokens', description: 'Building a token system for colors, spacing, and typography.', hasEditor: false },
			{ slug: '03-theming', number: 3, title: 'Theming', description: 'Light/dark themes with CSS custom properties.', hasEditor: false }
		]
	},
	{
		slug: '13-tailwind',
		number: 13,
		title: 'Intro to Tailwind CSS v4',
		description: 'Utility-first CSS with Tailwind.',
		phase: 2,
		lessons: [
			{ slug: '01-utility-first', number: 1, title: 'Utility-First CSS', description: 'What is utility-first and basic Tailwind classes.', hasEditor: false },
			{ slug: '02-tailwind-setup', number: 2, title: 'Setting Up Tailwind v4', description: 'Installing and configuring Tailwind with SvelteKit.', hasEditor: false },
			{ slug: '03-tailwind-patterns', number: 3, title: 'Tailwind Patterns', description: 'Building components with Tailwind utilities.', hasEditor: false }
		]
	},
	{
		slug: '14-gsap',
		number: 14,
		title: 'Animations with GSAP',
		description: 'GSAP basics and ScrollTrigger.',
		phase: 2,
		lessons: [
			{ slug: '01-gsap-basics', number: 1, title: 'GSAP Basics', description: 'gsap.to(), gsap.from(), and animation properties.', hasEditor: false },
			{ slug: '02-scroll-trigger', number: 2, title: 'ScrollTrigger', description: 'Scroll-based animations and pinning.', hasEditor: false },
			{ slug: '03-gsap-svelte', number: 3, title: 'GSAP in Svelte', description: 'Using $effect() for lifecycle and cleanup.', hasEditor: false }
		]
	},
	{
		slug: '15-data-loading',
		number: 15,
		title: 'Data Loading & SSR',
		description: 'Server load functions and SSR.',
		phase: 2,
		lessons: [
			{ slug: '01-server-load', number: 1, title: 'Server Load Functions', description: '+page.server.ts load() and returning data.', hasEditor: false },
			{ slug: '02-universal-load', number: 2, title: 'Universal Load Functions', description: '+page.ts load and shared layout data.', hasEditor: false },
			{ slug: '03-ssr-seo', number: 3, title: 'SSR & SEO Basics', description: 'Server rendering and svelte:head for meta tags.', hasEditor: false }
		]
	},
	{
		slug: '16-snippets',
		number: 16,
		title: 'Snippets & Advanced Components',
		description: 'Snippets, shared state, and advanced patterns.',
		phase: 2,
		lessons: [
			{ slug: '01-snippets-basics', number: 1, title: 'Snippets Basics', description: '{#snippet} and {@render} syntax.', hasEditor: false },
			{ slug: '02-shared-state', number: 2, title: 'Shared State', description: 'Reactive state in .svelte.ts files.', hasEditor: false },
			{ slug: '03-html-rendering', number: 3, title: 'Dynamic HTML', description: '{@html} for rendering HTML strings safely.', hasEditor: false }
		]
	},

	// Phase 3: Full-Stack
	{
		slug: '17-apis',
		number: 17,
		title: 'Working with APIs',
		description: 'Fetch, async/await, and consuming APIs.',
		phase: 3,
		lessons: [
			{ slug: '01-fetch-basics', number: 1, title: 'Fetch Basics', description: 'The fetch() API and async/await.', hasEditor: false },
			{ slug: '02-api-data', number: 2, title: 'Working with API Data', description: 'Fetching and displaying data from APIs.', hasEditor: false },
			{ slug: '03-api-project', number: 3, title: 'Weather Dashboard', description: 'Build a weather app with API data.', hasEditor: false }
		]
	},
	{
		slug: '18-databases',
		number: 18,
		title: 'Databases with Drizzle',
		description: 'SQLite, Drizzle ORM, and CRUD.',
		phase: 3,
		lessons: [
			{ slug: '01-database-intro', number: 1, title: 'Database Introduction', description: 'SQL basics and SQLite setup.', hasEditor: false },
			{ slug: '02-drizzle-setup', number: 2, title: 'Drizzle ORM', description: 'Setting up Drizzle with SvelteKit.', hasEditor: false },
			{ slug: '03-crud', number: 3, title: 'CRUD Operations', description: 'Create, read, update, delete with Drizzle.', hasEditor: false }
		]
	},
	{
		slug: '19-form-actions',
		number: 19,
		title: 'Form Actions',
		description: 'SvelteKit form actions and progressive enhancement.',
		phase: 3,
		lessons: [
			{ slug: '01-actions-basics', number: 1, title: 'Form Actions Basics', description: 'Default and named actions in SvelteKit.', hasEditor: false },
			{ slug: '02-progressive-enhancement', number: 2, title: 'Progressive Enhancement', description: 'use:enhance and optimistic UI.', hasEditor: false },
			{ slug: '03-validation', number: 3, title: 'Form Validation', description: 'Server-side validation and error display.', hasEditor: false }
		]
	},
	{
		slug: '20-authentication',
		number: 20,
		title: 'Authentication',
		description: 'Sessions, cookies, and protected routes.',
		phase: 3,
		lessons: [
			{ slug: '01-auth-concepts', number: 1, title: 'Auth Concepts', description: 'Authentication, sessions, and password hashing.', hasEditor: false },
			{ slug: '02-auth-implementation', number: 2, title: 'Building Auth', description: 'Registration, login, and session management.', hasEditor: false },
			{ slug: '03-protected-routes', number: 3, title: 'Protected Routes', description: 'Auth guards and redirects.', hasEditor: false }
		]
	},
	{
		slug: '21-advanced-tailwind',
		number: 21,
		title: 'Advanced Tailwind & Theming',
		description: 'Dark mode, custom themes, and responsive tokens.',
		phase: 3,
		lessons: [
			{ slug: '01-theme-customization', number: 1, title: 'Theme Customization', description: 'Tailwind v4 @theme and custom values.', hasEditor: false },
			{ slug: '02-dark-mode', number: 2, title: 'Dark Mode', description: 'Implementing dark mode with Tailwind.', hasEditor: false },
			{ slug: '03-responsive-patterns', number: 3, title: 'Responsive Patterns', description: 'Advanced responsive layouts and utilities.', hasEditor: false }
		]
	},
	{
		slug: '22-seo',
		number: 22,
		title: 'SEO & Performance',
		description: 'Meta tags, JSON-LD, and Core Web Vitals.',
		phase: 3,
		lessons: [
			{ slug: '01-meta-tags', number: 1, title: 'Meta Tags & Open Graph', description: 'Title, description, and social tags.', hasEditor: false },
			{ slug: '02-structured-data', number: 2, title: 'Structured Data', description: 'JSON-LD and schema.org vocabulary.', hasEditor: false },
			{ slug: '03-core-web-vitals', number: 3, title: 'Core Web Vitals', description: 'LCP, INP, CLS, and Lighthouse.', hasEditor: false }
		]
	},
	{
		slug: '23-advanced-gsap',
		number: 23,
		title: 'Advanced GSAP',
		description: 'Timelines, parallax, and page transitions.',
		phase: 3,
		lessons: [
			{ slug: '01-timelines', number: 1, title: 'GSAP Timelines', description: 'Sequencing and controlling animations.', hasEditor: false },
			{ slug: '02-parallax', number: 2, title: 'Parallax Effects', description: 'Scroll-driven parallax with GSAP.', hasEditor: false },
			{ slug: '03-page-transitions', number: 3, title: 'Page Transitions', description: 'Animating route changes in SvelteKit.', hasEditor: false }
		]
	},
	{
		slug: '24-stripe',
		number: 24,
		title: 'Payments with Stripe',
		description: 'Stripe Checkout and webhooks.',
		phase: 3,
		lessons: [
			{ slug: '01-stripe-concepts', number: 1, title: 'Stripe Concepts', description: 'Payment Intents, Products, and test mode.', hasEditor: false },
			{ slug: '02-checkout-flow', number: 2, title: 'Building Checkout', description: 'PaymentElement and confirming payments.', hasEditor: false },
			{ slug: '03-webhooks', number: 3, title: 'Webhooks & Fulfillment', description: 'Handling payment events server-side.', hasEditor: false }
		]
	},

	// Phase 4: Advanced
	{
		slug: '25-api-routes',
		number: 25,
		title: 'API Routes & REST Design',
		description: 'Building REST APIs with SvelteKit.',
		phase: 4,
		lessons: [
			{ slug: '01-server-routes', number: 1, title: 'Server Routes', description: '+server.ts handlers and JSON responses.', hasEditor: false },
			{ slug: '02-rest-patterns', number: 2, title: 'REST API Patterns', description: 'RESTful design and CRUD endpoints.', hasEditor: false },
			{ slug: '03-api-project', number: 3, title: 'Building a REST API', description: 'Complete REST API for a notes app.', hasEditor: false }
		]
	},
	{
		slug: '26-state-management',
		number: 26,
		title: 'State Management at Scale',
		description: 'Global state, context, and state machines.',
		phase: 4,
		lessons: [
			{ slug: '01-global-state', number: 1, title: 'Global State', description: 'Shared reactive state with .svelte.ts files.', hasEditor: false },
			{ slug: '02-context-api', number: 2, title: 'Context API', description: 'setContext/getContext for component trees.', hasEditor: false },
			{ slug: '03-state-patterns', number: 3, title: 'State Patterns', description: 'State machines and advanced patterns.', hasEditor: false }
		]
	},
	{
		slug: '27-realtime',
		number: 27,
		title: 'Real-Time Features',
		description: 'SSE, WebSockets, and live updates.',
		phase: 4,
		lessons: [
			{ slug: '01-sse', number: 1, title: 'Server-Sent Events', description: 'Streaming updates with SSE.', hasEditor: false },
			{ slug: '02-websockets', number: 2, title: 'WebSocket Basics', description: 'Bi-directional real-time communication.', hasEditor: false },
			{ slug: '03-live-updates', number: 3, title: 'Live Updates', description: 'Building a live notification system.', hasEditor: false }
		]
	},
	{
		slug: '28-testing',
		number: 28,
		title: 'Testing & Quality',
		description: 'Vitest, Playwright, and CI pipelines.',
		phase: 4,
		lessons: [
			{ slug: '01-unit-testing', number: 1, title: 'Unit Testing with Vitest', description: 'Writing and running unit tests.', hasEditor: false },
			{ slug: '02-component-testing', number: 2, title: 'Component Testing', description: 'Testing Svelte components with Testing Library.', hasEditor: false },
			{ slug: '03-e2e-testing', number: 3, title: 'E2E Testing with Playwright', description: 'End-to-end testing and CI.', hasEditor: false }
		]
	},
	{
		slug: '29-accessibility',
		number: 29,
		title: 'Accessibility & i18n',
		description: 'ARIA, keyboard nav, and internationalization.',
		phase: 4,
		lessons: [
			{ slug: '01-a11y-basics', number: 1, title: 'Accessibility Basics', description: 'WCAG, ARIA, and semantic HTML.', hasEditor: false },
			{ slug: '02-keyboard-nav', number: 2, title: 'Keyboard Navigation', description: 'Focus management and keyboard handlers.', hasEditor: false },
			{ slug: '03-testing-a11y', number: 3, title: 'Testing Accessibility', description: 'Lighthouse, axe-core, and auditing.', hasEditor: false }
		]
	},
	{
		slug: '30-performance',
		number: 30,
		title: 'Performance & Optimization',
		description: 'Code splitting, caching, and Lighthouse 95+.',
		phase: 4,
		lessons: [
			{ slug: '01-code-splitting', number: 1, title: 'Code Splitting', description: 'Dynamic imports and lazy loading.', hasEditor: false },
			{ slug: '02-caching', number: 2, title: 'Caching Strategies', description: 'HTTP cache, prerendering, and CDN caching.', hasEditor: false },
			{ slug: '03-optimization', number: 3, title: 'Performance Optimization', description: 'Image optimization and Lighthouse audits.', hasEditor: false }
		]
	},

	// Phase 5: Capstone
	{
		slug: '31-capstone-design',
		number: 31,
		title: 'Capstone: Architecture & Design',
		description: 'System design and project scaffolding.',
		phase: 5,
		lessons: [
			{ slug: '01-requirements', number: 1, title: 'Requirements & Planning', description: 'Defining features and user stories.', hasEditor: false },
			{ slug: '02-database-design', number: 2, title: 'Database Design', description: 'Schema design for e-commerce.', hasEditor: false },
			{ slug: '03-project-setup', number: 3, title: 'Project Setup', description: 'Scaffolding the capstone project.', hasEditor: false }
		]
	},
	{
		slug: '32-capstone-catalog',
		number: 32,
		title: 'Capstone: Product Catalog',
		description: 'Product listing, filtering, and search.',
		phase: 5,
		lessons: [
			{ slug: '01-product-pages', number: 1, title: 'Product Pages', description: 'Listing and detail pages.', hasEditor: false },
			{ slug: '02-filtering-search', number: 2, title: 'Filtering & Search', description: 'Server-side filtering and pagination.', hasEditor: false },
			{ slug: '03-catalog-polish', number: 3, title: 'Catalog Polish', description: 'Animations and responsive design.', hasEditor: false }
		]
	},
	{
		slug: '33-capstone-checkout',
		number: 33,
		title: 'Capstone: Cart & Checkout',
		description: 'Shopping cart, auth, and Stripe payments.',
		phase: 5,
		lessons: [
			{ slug: '01-shopping-cart', number: 1, title: 'Shopping Cart', description: 'Cart state and persistence.', hasEditor: false },
			{ slug: '02-checkout-auth', number: 2, title: 'Checkout & Auth', description: 'Address form and order summary.', hasEditor: false },
			{ slug: '03-payment', number: 3, title: 'Payment Integration', description: 'Stripe checkout and order creation.', hasEditor: false }
		]
	},
	{
		slug: '34-capstone-admin',
		number: 34,
		title: 'Capstone: Admin Dashboard',
		description: 'Product management and analytics.',
		phase: 5,
		lessons: [
			{ slug: '01-admin-layout', number: 1, title: 'Admin Layout', description: 'Protected admin routes and navigation.', hasEditor: false },
			{ slug: '02-product-management', number: 2, title: 'Product Management', description: 'CRUD for products and categories.', hasEditor: false },
			{ slug: '03-order-management', number: 3, title: 'Order Management', description: 'Orders, status updates, and analytics.', hasEditor: false }
		]
	},
	{
		slug: '35-capstone-deploy',
		number: 35,
		title: 'Capstone: Deploy & Launch',
		description: 'Production deployment and monitoring.',
		phase: 5,
		lessons: [
			{ slug: '01-pre-deploy', number: 1, title: 'Pre-Deploy Checklist', description: 'Security review and final checks.', hasEditor: false },
			{ slug: '02-vercel-deploy', number: 2, title: 'Deploying to Vercel', description: 'Production deployment and custom domain.', hasEditor: false },
			{ slug: '03-post-launch', number: 3, title: 'Post-Launch', description: 'Monitoring, analytics, and next steps.', hasEditor: false }
		]
	}
];

export function getModule(slug: string): Module | undefined {
	return courseModules.find((m) => m.slug === slug);
}

export function getModuleByNumber(num: number): Module | undefined {
	return courseModules.find((m) => m.number === num);
}
