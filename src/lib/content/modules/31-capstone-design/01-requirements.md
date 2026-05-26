# Requirements & Planning

Welcome to the capstone project. Over the next five modules you will build a complete **e-commerce store** from scratch — product catalog, shopping cart, checkout, payments, admin panel, and deployment. This is a real project you can put in your portfolio.

Before writing a single line of code, you need a plan. This is not bureaucratic overhead — it is leverage. Every hour spent on requirements saves roughly ten hours in development. That is not a platitude; it is a pattern I have watched play out on dozens of projects. Without requirements, you build the wrong thing, discover it late, and either ship something mediocre or rewrite half of it. With clear requirements, you make mistakes on paper (cheap) instead of in code (expensive).

Jumping straight into coding without requirements is like building a house without blueprints. You might end up with something, but it probably will not have a front door.

## The Mental Model: Requirements as Risk Reduction

Think of requirements gathering as systematically reducing uncertainty. At the start of a project, almost everything is unknown: what exactly are we building? Who is it for? What are the edge cases? How do the pieces connect? Each requirements activity — user stories, wireframes, data modeling, route planning — converts an unknown into a known. By the time you open your editor, most of the hard decisions are already made.

The cost curve of fixing mistakes looks like this: a requirement change costs 1x. A design change costs 5x. A code change costs 10x. A production bug costs 50x. Requirements are where you want to find and fix problems.

### The Three Questions

Every requirements process boils down to three questions:

1. **What are we building?** — Features, user stories, acceptance criteria
2. **How does it fit together?** — Data models, routes, component architecture, state management
3. **What are the constraints?** — Performance budgets, accessibility standards, browser support, timeline

If you can answer these three questions with specificity, you have a solid foundation. If any of them is vague, that vagueness will manifest as bugs, rewrites, or scope creep.

## Gathering and Documenting Requirements

Start by listing everything the project needs. Do not filter yet — brainstorm first, prioritize second. Talk to actual users if you can. If you are building for yourself, roleplay as the customer and ask: "What would make me stop using this and go to a competitor?"

```
Product Features:
- Product listing with images and prices
- Product detail pages
- Categories and filtering
- Search
- Product reviews and ratings

Shopping Features:
- Shopping cart (add, remove, update quantity)
- Wishlist
- Guest checkout
- User accounts and order history

Checkout Features:
- Address form with validation
- Payment processing (Stripe)
- Order confirmation page
- Email receipts

Admin Features:
- Product management (CRUD)
- Order management and fulfillment status
- Basic analytics dashboard
- Image upload and management

Technical Requirements:
- Authentication (sign up, sign in, sign out)
- Responsive design (mobile, tablet, desktop)
- SEO optimization (SSR, meta tags, structured data)
- Performance budget: LCP < 2.5s, CLS < 0.1
- Accessibility: WCAG 2.1 AA compliance
- Browser support: last 2 versions of Chrome, Firefox, Safari, Edge
```

Notice the "Technical Requirements" section. These are the constraints that shape every implementation decision. A performance budget of LCP under 2.5 seconds means you cannot lazy-load the hero image. WCAG AA compliance means every interactive element needs keyboard support and adequate color contrast. Browser support determines which CSS features you can use without fallbacks. These requirements are easy to ignore at the start and painful to retrofit later.

### Functional vs Non-Functional Requirements

Requirements fall into two categories, and neglecting either one leads to project failure:

**Functional requirements** describe what the system does: "A customer can add items to a cart," "An admin can create products." These are the features.

**Non-functional requirements** describe how the system behaves: "Pages load in under 2.5 seconds," "The store is accessible via screen reader," "The app handles 500 concurrent users." These are the quality attributes.

Most teams write functional requirements instinctively. Non-functional requirements are where projects silently fail. A store that works perfectly but takes 8 seconds to load on mobile will lose customers. A checkout flow that works with a mouse but is impossible to complete with a keyboard fails accessibility standards.

```
WRONG: Only functional requirements
- User can view products ✓
- User can add to cart ✓
- User can checkout ✓
(No mention of performance, accessibility, security, or mobile support)

CORRECT: Functional + Non-functional
- User can view products ✓
  - Products load with LCP < 2.5s on 3G connection
  - Product images use responsive srcset
  - Product listings are navigable via keyboard
- User can add to cart ✓
  - Cart updates reflect in < 100ms (optimistic UI)
  - Cart state persists across page refresh (localStorage)
  - "Add to Cart" button is accessible (label, focus ring, keyboard)
- User can checkout ✓
  - Checkout form validates inline (not on submit)
  - Payment data never touches our server (Stripe client-side tokenization)
  - Checkout works on mobile viewports (320px minimum)
```

## User Stories and Acceptance Criteria

User stories describe features from the user's perspective. They follow the format: **As a [role], I want [action] so that [benefit]**. The "so that" clause is the most important part — it tells you WHY the feature matters, which helps you make tradeoff decisions later.

Good user stories include **acceptance criteria** — specific, testable conditions that define "done":

```
STORY: As a customer, I want to add items to my cart so I can purchase
multiple products at once.

Acceptance Criteria:
- [ ] Clicking "Add to Cart" on a product page adds 1 unit to the cart
- [ ] A cart count badge updates immediately in the header
- [ ] Adding the same product again increments the quantity (not duplicate)
- [ ] The cart persists across page navigations
- [ ] The cart persists if the user refreshes the page (localStorage)
- [ ] Maximum quantity per item is 99
- [ ] Out-of-stock products show a disabled "Add to Cart" button

---

STORY: As a customer, I want to check out as a guest so I do not have
to create an account just to make a purchase.

Acceptance Criteria:
- [ ] Checkout page is accessible without signing in
- [ ] Guest must provide email, shipping address, and payment info
- [ ] Order confirmation is shown after successful payment
- [ ] Guest receives a confirmation email with order details
- [ ] Guest can optionally create an account after checkout

---

STORY: As an admin, I want to add new products with images so I can
expand the catalog.

Acceptance Criteria:
- [ ] Admin form includes: title, description, price, category, images
- [ ] At least one image is required
- [ ] Images can be reordered via drag-and-drop
- [ ] Price must be a positive number with up to 2 decimal places
- [ ] Form validates all fields before submission
- [ ] Product is visible on the storefront immediately after creation

---

STORY: As an admin, I want to view all orders with their status so I
can fulfill them and track revenue.

Acceptance Criteria:
- [ ] Orders list shows date, customer, items, total, and status
- [ ] Orders can be filtered by status (pending, shipped, delivered)
- [ ] Clicking an order shows full details
- [ ] Admin can update order status
- [ ] Revenue totals are displayed at the top of the orders page
```

Acceptance criteria transform vague feature descriptions into concrete, testable checklists. When you finish implementing a feature, you run through the criteria. If they all pass, the feature is done. If they do not, you know exactly what is missing. This precision eliminates the "is this finished?" ambiguity that plagues projects without clear requirements.

### WRONG vs CORRECT: User Story Quality

```
WRONG: Vague, untestable user stories

"As a user, I want a good shopping experience."
→ What is "good"? How do you test "experience"? This is aspirational,
  not actionable.

"As a user, I want to search for products."
→ No acceptance criteria. What counts as "search"? Full-text? Fuzzy?
  Does it search descriptions or just titles? What happens with no results?

CORRECT: Specific, testable user stories

"As a customer, I want to search products by name so I can quickly
find what I am looking for."

Acceptance Criteria:
- [ ] Search input is visible in the header on all pages
- [ ] Results update as the user types (debounced at 300ms)
- [ ] Search matches against product title and description
- [ ] Results show product image, title, price, and category
- [ ] Empty results show "No products found" with a suggestion to browse
- [ ] Search query is preserved in the URL (?q=shoes) for shareability
- [ ] Pressing Enter or clicking a result navigates to the product page
```

### Edge Cases: The Requirements You Forget

The most valuable requirements are the edge cases — the scenarios nobody thinks about until they happen in production:

```
Cart Edge Cases:
- What happens if a product is deleted while it is in someone's cart?
  → Show "This product is no longer available" and allow removal
- What if the price changes between adding to cart and checkout?
  → Show updated price at checkout with a notice
- What if the user has 50 tabs open and adds to cart in each?
  → Use localStorage events to sync cart state across tabs
- What if the user's session expires during checkout?
  → Preserve cart in localStorage, prompt re-authentication

Checkout Edge Cases:
- What if Stripe is down?
  → Show "Payment service unavailable, please try again"
- What if the user double-clicks the "Pay" button?
  → Disable after first click, use idempotency key
- What if the connection drops mid-payment?
  → Use Stripe webhooks as source of truth, not client callback
- What if the shipping address is in a country you do not ship to?
  → Validate against allowed countries list before payment
```

Documenting edge cases upfront does not mean you implement them all immediately. But knowing they exist lets you design data structures and APIs that can handle them later without rewriting.

## The MVP Mindset

You cannot build everything at once. The Minimum Viable Product is the smallest thing you can ship that delivers real value. The emphasis is on "viable" — it has to actually work end-to-end. A product listing without a cart is not viable. A cart without checkout is not viable. But a store without wishlists, reviews, or email receipts? That is viable.

The MVP is not a bad version of the full product. It is the core of the product, with everything non-essential stripped away. You ship it, learn from real usage, and iterate. Features you thought were essential might not matter. Features you did not think of might be critical.

### The MVP Test

Ask yourself: **Can a customer complete the core transaction?** For an e-commerce store, the core transaction is: browse → add to cart → pay → receive confirmation. If every step in this chain works, you have an MVP. Everything else — search, reviews, wishlists, admin analytics — enhances the experience but does not enable it.

```
MVP: The Straight Line
  Browse products → View product → Add to cart → Checkout → Pay → Confirmation
  (Everything else is a future iteration)

NOT MVP: Everything at Once
  Browse + Search + Filter + Sort + Wishlist + Reviews + Recommendations
  + Cart + Guest checkout + Account checkout + Multiple payment methods
  + Order tracking + Email receipts + Admin dashboard + Analytics
  (You will never ship this. It will take 6 months and be full of bugs.)
```

### Iterative Development: The Build-Measure-Learn Loop

The MVP is not the end — it is the beginning of a feedback loop:

1. **Build** the smallest viable version
2. **Measure** how people actually use it (analytics, feedback, support tickets)
3. **Learn** what matters and what does not
4. **Repeat** — build the next most impactful feature

This loop is why you start with requirements and prioritization. If you build everything at once, you cannot tell which features matter. If you build incrementally, each iteration teaches you something.

## Feature Prioritization: MoSCoW

MoSCoW is a prioritization framework that sorts features into four buckets: **Must have**, **Should have**, **Could have**, and **Won't have** (this time). The "Won't have" category is the most important — it is your explicit decision about what you are NOT building, which frees you to focus.

| Priority | Feature | Reason |
|----------|---------|--------|
| **Must Have** | Product listing and detail pages | Core of any store |
| **Must Have** | Shopping cart | Cannot sell without it |
| **Must Have** | Checkout with Stripe | Must accept payment |
| **Must Have** | User authentication | Required for order history |
| **Must Have** | Admin product CRUD | Must manage inventory |
| **Should Have** | Category filtering | Significantly improves browsing |
| **Should Have** | Order management | Needed for fulfillment |
| **Should Have** | Search | Users expect it in any catalog |
| **Could Have** | Wishlist | Nice enhancement, not essential |
| **Could Have** | Reviews and ratings | Adds social proof |
| **Could Have** | Email receipts | Professional polish |
| **Won't Have** | Multi-currency support | Out of scope for MVP |
| **Won't Have** | Inventory tracking | Manual management is fine initially |
| **Won't Have** | Coupon/discount system | Can add post-launch |

Focus on "Must Have" items first. Ship those, validate they work, then tackle "Should Have." The "Won't Have" list is your shield against scope creep — when someone says "what about coupons?" you can point to the list and say "post-launch."

### The Prioritization Trap

```
WRONG: Prioritizing by what is fun to build

  1. Admin analytics dashboard with charts (fun, visual)
  2. Product image gallery with zoom (fun, interactive)
  3. Email notification system (fun, backend challenge)
  4. Shopping cart (boring, but... the entire business depends on it)

CORRECT: Prioritizing by user value and business impact

  1. Shopping cart and checkout (enables revenue)
  2. Product listing and detail pages (enables browsing)
  3. User authentication (enables order history, security)
  4. Admin product CRUD (enables catalog management)
  5. Search and filtering (improves browsing)
  6. Admin analytics (nice to have, manual reports work for now)
```

Build the boring, essential things first. The fun, flashy features are only valuable when they sit on top of a working foundation.

## Data Modeling: Entities and Relationships

Before writing database schemas or TypeScript types, sketch the data model. Identify the core entities (nouns) and their relationships. This exercise prevents you from designing yourself into a corner:

```
Entities:
─────────
User
  - id, email, password_hash, name, role (customer | admin)
  - has many: Orders, Addresses

Product
  - id, title, description, price, category_id, images[], created_at
  - belongs to: Category
  - has many: CartItems, OrderItems, Reviews

Category
  - id, name, slug, description
  - has many: Products

Cart
  - id, user_id (nullable for guests), session_id, updated_at
  - has many: CartItems

CartItem
  - id, cart_id, product_id, quantity
  - belongs to: Cart, Product

Order
  - id, user_id, email, status, shipping_address, total, created_at
  - belongs to: User
  - has many: OrderItems

OrderItem
  - id, order_id, product_id, quantity, price_at_purchase
  - belongs to: Order, Product

Review (Could Have)
  - id, product_id, user_id, rating, comment, created_at
  - belongs to: Product, User
```

Two things to notice. First, `OrderItem` stores `price_at_purchase`, not a reference to the current product price. This is critical — if you raise the price of a product, historical orders should still show what the customer actually paid. Second, `Cart` has both `user_id` (nullable) and `session_id` to support both authenticated and guest carts. These are the kinds of decisions that are easy to make in a data model and painful to retrofit in code.

### Data Modeling Decisions That Matter

Every data model contains hidden design decisions. Let's make them explicit:

```
DECISION: Should product images be a separate table or a JSON array?

Option A: Separate table (ProductImage)
  + Can query images independently
  + Can add metadata (alt text, sort order, dimensions)
  + Normalized, no data duplication
  - Extra join on every product query
  - More complex CRUD

Option B: JSON array on Product (images: string[])
  + Simple queries
  + One table to manage
  - Cannot query images independently
  - Harder to add metadata per image
  - JSON arrays have limited indexing in most databases

RECOMMENDATION for MVP: JSON array. Simplicity wins early.
  Add a ProductImage table later if you need per-image metadata.

---

DECISION: How to handle product variants (size, color)?

Option A: Separate SKU table
  + Each variant has its own stock, price, and attributes
  + Proper e-commerce pattern
  - Significantly more complex CRUD and cart logic

Option B: No variants (single product = single item)
  + Simple data model
  + Simple cart logic
  - Cannot sell "Blue T-Shirt, Size M" as distinct from "Red T-Shirt, Size L"

RECOMMENDATION for MVP: No variants. Add them post-MVP if needed.
  This is a "Won't Have" that reduces complexity dramatically.
```

### TypeScript Types from Data Model

Your data model translates directly into TypeScript types. Define these early — they become the contract for your entire application:

```typescript
// src/lib/types.ts

export type UserRole = 'customer' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface Product {
  id: string;
  title: string;
  slug: string;
  description: string;
  price: number;         // Stored in cents (integer) to avoid floating point
  category_id: string;
  images: string[];      // URLs
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
}

export interface CartItem {
  product_id: string;
  quantity: number;
  product: Product;      // Denormalized for display convenience
}

export interface Cart {
  items: CartItem[];
  total: number;         // Computed, in cents
}

export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export interface OrderItem {
  product_id: string;
  product_title: string;    // Snapshot — product might be deleted later
  product_image: string;    // Snapshot
  quantity: number;
  price_at_purchase: number; // In cents — frozen at time of order
}

export interface Order {
  id: string;
  user_id: string | null;
  email: string;
  status: OrderStatus;
  items: OrderItem[];
  shipping_address: Address;
  total: number;          // In cents
  created_at: string;
}

export interface Address {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}
```

Note that prices are stored in **cents** (integers). This avoids floating-point arithmetic issues. `$29.99` is stored as `2999`. Display formatting happens at the presentation layer: `(price / 100).toFixed(2)`. This is a universal best practice in financial software.

## Route Planning: URLs as Architecture

SvelteKit's file-based routing means your URL structure IS your file structure. Plan your routes before creating files — it forces you to think about navigation, access control, and data loading:

```
Public Routes:
  /                         → Home page (featured products, hero)
  /products                 → Product listing with filters
  /products/[slug]          → Product detail page
  /cart                     → Shopping cart
  /checkout                 → Checkout flow (address → payment → confirm)
  /order/[id]/confirmation  → Order confirmation (post-checkout)

Auth Routes:
  /login                    → Sign in
  /register                 → Sign up
  /account                  → Account overview (protected)
  /account/orders           → Order history (protected)
  /account/orders/[id]      → Order detail (protected)

Admin Routes:
  /admin                    → Dashboard with stats (protected, admin only)
  /admin/products           → Product list (protected, admin only)
  /admin/products/new       → Create product (protected, admin only)
  /admin/products/[id]/edit → Edit product (protected, admin only)
  /admin/orders             → Order management (protected, admin only)
  /admin/orders/[id]        → Order detail (protected, admin only)
```

This route map tells you several things immediately: you need a layout group for admin routes with role-based access control, the checkout flow might be a multi-step form within a single route or separate routes (a design decision to make), and product pages use slugs (not IDs) for SEO-friendly URLs.

### Route Architecture Decisions

```
DECISION: Multi-step checkout — one route or many?

Option A: Single route /checkout with internal steps
  /checkout (step 1: address → step 2: payment → step 3: confirm)
  + State stays in one component
  + No intermediate URL bookmarks (user cannot bookmark half-completed checkout)
  + Simpler navigation logic
  - Larger single component
  - No browser back button between steps (unless you manage it manually)

Option B: Separate routes per step
  /checkout/address → /checkout/payment → /checkout/confirm
  + Each step is a separate, focused component
  + Browser back button works naturally
  + Each step can have its own load function
  - State must be shared across routes (server-side session or URL params)
  - User could bookmark /checkout/payment without completing address

RECOMMENDATION: Single route with internal step state for MVP.
  It is simpler, and checkout state is inherently ephemeral.

---

DECISION: Product URLs — ID or slug?

Option A: /products/abc123 (ID-based)
  + Guaranteed unique
  + Simple database lookup
  - Ugly, non-descriptive URLs
  - Bad for SEO

Option B: /products/svelte-5-course (slug-based)
  + Human-readable, descriptive
  + Good for SEO
  + Shareable
  - Must enforce uniqueness
  - Must handle slug changes (redirect old → new)

RECOMMENDATION: Slug-based. The SEO and usability benefits outweigh
  the complexity of slug management.
```

### File Structure from Routes

Your route plan directly maps to your SvelteKit file structure:

```
src/routes/
├── +page.svelte                        # Home page
├── +layout.svelte                      # Root layout (header, footer)
├── products/
│   ├── +page.svelte                    # Product listing
│   ├── +page.server.ts                 # Load products from DB
│   └── [slug]/
│       ├── +page.svelte                # Product detail
│       └── +page.server.ts             # Load single product
├── cart/
│   └── +page.svelte                    # Cart (client-side state)
├── checkout/
│   ├── +page.svelte                    # Checkout flow
│   └── +page.server.ts                 # Process order (form action)
├── order/[id]/confirmation/
│   ├── +page.svelte                    # Order confirmation
│   └── +page.server.ts                 # Load order details
├── login/
│   ├── +page.svelte                    # Login form
│   └── +page.server.ts                 # Auth action
├── register/
│   ├── +page.svelte                    # Register form
│   └── +page.server.ts                 # Create account action
├── account/
│   ├── +layout.server.ts              # Auth guard for all /account routes
│   ├── +page.svelte                    # Account overview
│   └── orders/
│       ├── +page.svelte                # Order history
│       └── [id]/+page.svelte           # Order detail
└── admin/
    ├── +layout.server.ts              # Admin auth guard
    ├── +page.svelte                    # Dashboard
    ├── products/
    │   ├── +page.svelte                # Product list
    │   ├── new/+page.svelte            # Create product
    │   └── [id]/edit/+page.svelte      # Edit product
    └── orders/
        ├── +page.svelte                # Order management
        └── [id]/+page.svelte           # Order detail
```

## Component Architecture

Before building, identify the reusable components, shared state, and data flow patterns. This is not about designing every component in advance — it is about spotting the big shared pieces:

```
Shared Layout Components:
  - Header (logo, nav, cart badge, user menu)
  - Footer (links, copyright)
  - AdminLayout (sidebar nav, content area)
  - MobileMenu (slide-out navigation)

Product Components:
  - ProductCard (image, title, price, add-to-cart)
  - ProductGrid (responsive grid of ProductCards)
  - ProductGallery (image carousel on detail page)
  - CategoryFilter (sidebar filter controls)
  - SearchInput (search with debounce)

Cart & Checkout Components:
  - CartDrawer or CartPage (item list, quantities, totals)
  - CartItem (single item with quantity controls)
  - AddressForm (reusable address input)
  - OrderSummary (line items + totals, used in cart and checkout)
  - StripePaymentForm (Stripe Elements integration)

Admin Components:
  - StatsCard (metric display)
  - DataTable (sortable, paginated table)
  - ProductForm (create/edit product)
  - ImageUploader (drag-and-drop image upload)

Shared State:
  - Cart state (Svelte store or context, persisted to localStorage)
  - Auth state (current user, loaded from session)
  - Toast/notification state (global feedback messages)
```

The key question for each piece of state: where does it live, and who needs access? Cart state is needed across many pages (header badge, cart page, checkout), so it should be a global store. Product data is route-specific, so it loads via SvelteKit's `load` functions. Admin auth is a layout-level concern, checked once in the admin layout's server load.

### State Management Strategy

```
State Type          | Where It Lives              | Why
──────────────────────────────────────────────────────────
Product list        | +page.server.ts load()      | Server data, SEO, no client state
Single product      | +page.server.ts load()      | Server data, SEO
Cart                | $state + localStorage       | Client-only, persists across pages
Current user        | +layout.server.ts load()    | Server session, available everywhere
Toast messages      | $state in root layout       | Ephemeral, client-only
Search query        | URL search params (?q=)     | Shareable, bookmarkable
Filter selections   | URL search params           | Shareable, bookmarkable
Checkout form data  | $state in checkout page     | Ephemeral, single-page scope
Admin form data     | $state in form component    | Ephemeral, single-page scope
```

Notice the pattern: **server data uses load functions, client interaction state uses $state, shareable state uses URL params.** This is not arbitrary — each state type has different persistence, scope, and sharing requirements.

## Wireframing: Low-Fidelity First

Wireframes are disposable sketches that validate layout and flow before you invest time in code. They should be ugly on purpose — if they look polished, people argue about colors instead of structure.

Sketch these key pages at mobile and desktop widths:

```
Home Page (Desktop):
┌──────────────────────────────────────────────┐
│  Logo    [Products]  [Cart(3)]  [Sign In]    │
├──────────────────────────────────────────────┤
│                                              │
│           HERO BANNER / CTA                  │
│                                              │
├──────────────────────────────────────────────┤
│  Featured Products                           │
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐        │
│  │ IMG │  │ IMG │  │ IMG │  │ IMG │         │
│  │Name │  │Name │  │Name │  │Name │         │
│  │$29  │  │$49  │  │$19  │  │$39  │         │
│  └─────┘  └─────┘  └─────┘  └─────┘        │
├──────────────────────────────────────────────┤
│  Shop by Category                            │
│  [Electronics]  [Clothing]  [Home]  [Books]  │
├──────────────────────────────────────────────┤
│  Footer: Links | Social | Copyright          │
└──────────────────────────────────────────────┘

Home Page (Mobile):
┌──────────────────┐
│ Logo    [≡] [🛒3] │
├──────────────────┤
│                  │
│   HERO BANNER    │
│     [Shop →]     │
│                  │
├──────────────────┤
│ Featured         │
│ ┌──────────────┐ │
│ │ IMG  Name    │ │
│ │      $29     │ │
│ └──────────────┘ │
│ ┌──────────────┐ │
│ │ IMG  Name    │ │
│ │      $49     │ │
│ └──────────────┘ │
├──────────────────┤
│ Categories       │
│ [Electronics]    │
│ [Clothing]       │
│ [Home] [Books]   │
├──────────────────┤
│ Footer           │
└──────────────────┘

Product Listing (Desktop):
┌──────────────────────────────────────────────┐
│  Logo    [Products]  [Cart(3)]  [Sign In]    │
├──────────┬───────────────────────────────────┤
│ Filters  │  "24 products"   [Sort: Price ▼]  │
│          │                                   │
│ Category │  ┌─────┐  ┌─────┐  ┌─────┐       │
│ ☑ Elec.  │  │ IMG │  │ IMG │  │ IMG │       │
│ ☐ Home   │  │Name │  │Name │  │Name │       │
│          │  │$29  │  │$49  │  │$19  │       │
│ Price    │  └─────┘  └─────┘  └─────┘       │
│ $0—$100  │                                   │
│          │  ┌─────┐  ┌─────┐  ┌─────┐       │
│          │  │ IMG │  │ IMG │  │ IMG │       │
│          │  │Name │  │Name │  │Name │       │
│          │  │$59  │  │$79  │  │$25  │       │
│          │  └─────┘  └─────┘  └─────┘       │
├──────────┴───────────────────────────────────┤
│  [1] [2] [3] ... [Next →]                    │
└──────────────────────────────────────────────┘

Shopping Cart:
┌──────────────────────────────────────────────┐
│  Logo    [Products]  [Cart(3)]  [Sign In]    │
├──────────────────────────────────────────────┤
│  Shopping Cart (3 items)                     │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │ [IMG]  Product Name       [-] 2 [+]  │    │
│  │        $29.99 each        $59.98     │    │
│  │                          [Remove]    │    │
│  ├──────────────────────────────────────┤    │
│  │ [IMG]  Another Product    [-] 1 [+]  │    │
│  │        $49.99 each        $49.99     │    │
│  │                          [Remove]    │    │
│  └──────────────────────────────────────┘    │
│                                              │
│              Subtotal:    $109.97             │
│              Shipping:    $5.99              │
│              Total:       $115.96             │
│                                              │
│              [  Proceed to Checkout  ]       │
└──────────────────────────────────────────────┘

Checkout Flow:
┌──────────────────────────────────────────────┐
│  Logo                          [Back to Cart]│
├──────────────────────────────────────────────┤
│  Step: [1 Address] → [2 Payment] → [3 Done] │
├─────────────────────┬────────────────────────┤
│                     │                        │
│  Shipping Address   │  Order Summary         │
│                     │                        │
│  Name  [__________] │  Product A × 2  $59.98 │
│  Line1 [__________] │  Product B × 1  $49.99 │
│  Line2 [__________] │  ─────────────────     │
│  City  [__________] │  Subtotal      $109.97 │
│  State [__] Zip [__]│  Shipping        $5.99 │
│  Country [________] │  ─────────────────     │
│                     │  Total         $115.96 │
│  [Continue to       │                        │
│   Payment →]        │                        │
│                     │                        │
└─────────────────────┴────────────────────────┘
```

For each wireframe, identify the components you need (these feed directly into your component architecture above) and the data each component requires (these feed into your data model and load functions).

## Real Example: Capstone Requirements Document

Here is a condensed version of what a real requirements document looks like for this capstone project. In a professional setting, this would live in your project wiki or a Notion doc, reviewed and signed off by stakeholders:

```markdown
# Acme Store — Requirements Document

## Project Overview
An e-commerce store built with SvelteKit, Tailwind CSS, and Stripe.
Target launch: 4 weeks from project start.

## Target Users
- Customers: browsing and purchasing products online
- Admins: managing product catalog and fulfilling orders

## MVP Scope (Must Have)
1. Product catalog with category browsing
2. Shopping cart with quantity management
3. Stripe checkout (guest and authenticated)
4. User authentication (register, login, logout)
5. Admin CRUD for products
6. Responsive design (mobile + desktop)

## Post-MVP (Should/Could Have)
- Search with autocomplete
- Order management for admins
- Wishlist for customers
- Product reviews and ratings
- Email notifications

## Technical Constraints
- Performance: LCP < 2.5s, TBT < 200ms
- Accessibility: WCAG 2.1 AA
- SEO: SSR for all public pages, structured data for products
- Browser support: Chrome, Firefox, Safari, Edge (last 2 versions)

## Success Criteria
- A customer can browse, add to cart, and purchase a product
- An admin can add, edit, and delete products
- The store works on mobile and desktop
- Lighthouse scores: Performance > 90, Accessibility > 95
```

This document is short enough that everyone will read it and specific enough to guide decisions. It is not a 50-page specification — it is a shared understanding of what "done" looks like.

### The Anti-Patterns of Requirements Documents

```
ANTI-PATTERN 1: The 200-Page Specification
Nobody reads it. Requirements are stale before development starts.
By the time you build feature 47, requirements 1-20 have changed.

ANTI-PATTERN 2: No Document At All
"We'll figure it out as we go." You will figure it out, but at 10x
the cost, with 3x the rewrites, and constant scope debates.

ANTI-PATTERN 3: Requirements Without Priorities
A flat list of 50 features with no priority. Everything seems
equally important, so the team works on whatever is most fun
instead of what is most valuable.

THE SWEET SPOT: A concise document (2-5 pages) with:
- Clear scope (what is in, what is out)
- Prioritized features (Must/Should/Could/Won't)
- Acceptance criteria for Must Have items
- Technical constraints stated upfront
- Success criteria that everyone agrees on
```

## Project Timeline and Milestones

Break the project into weekly milestones so you can track progress and catch slips early:

```
Week 1: Foundation
  - Project setup (SvelteKit, Tailwind, database)
  - Data model and TypeScript types
  - Product listing page with mock data
  - Product detail page
  - Basic layout (header, footer, navigation)

Week 2: Commerce
  - Shopping cart (client-side state, localStorage persistence)
  - Cart page with quantity controls
  - Checkout page (address form)
  - Stripe integration (payment form)
  - Order creation and confirmation

Week 3: Users & Admin
  - Authentication (register, login, logout)
  - Protected routes (/account, /admin)
  - Admin product CRUD (create, edit, delete)
  - Order history for customers
  - Image upload for products

Week 4: Polish & Deploy
  - Responsive design pass (mobile, tablet, desktop)
  - Accessibility audit and fixes
  - Performance optimization (images, SSR, caching)
  - Error handling and edge cases
  - Deployment to Vercel/Netlify
  - Final testing against acceptance criteria
```

Each milestone has a concrete deliverable. At the end of each week, you can demo something working. If you fall behind, you know exactly which features to cut — the MoSCoW prioritization tells you.

## Try It

Write user stories with acceptance criteria for one additional feature not listed above — such as a coupon/discount system, a product comparison page, or a "recently viewed" section. For your chosen feature, define:

1. The MVP version with 3-5 acceptance criteria
2. The full version with additional criteria
3. Which MoSCoW category it belongs in and why
4. What data model changes it requires (new entities, new fields)
5. What route changes are needed
6. At least 3 edge cases the feature introduces

Then, for the core capstone project, create a personal requirements document. Even if you follow the provided architecture, writing it yourself forces you to think through every decision. Include: project overview, target users, MVP scope, prioritized features, technical constraints, data model, route plan, and weekly milestones.

## Key Takeaways

- Time spent on requirements saves 10x in development time — find mistakes on paper, not in code
- Requirements answer three questions: what are we building, how does it fit together, and what are the constraints
- Functional requirements describe what the system does; non-functional requirements (performance, accessibility, security) describe how well it does it — neglecting either leads to failure
- User stories with acceptance criteria transform vague features into testable checklists
- Edge cases are the most valuable requirements — document them even if you do not implement them all immediately
- The MVP is the smallest viable product, not a bad version of the full product — ship it, learn, iterate
- MoSCoW prioritization makes scope decisions explicit, and the "Won't Have" list is your shield against scope creep
- Store prices in cents (integers) to avoid floating-point arithmetic issues — format for display at the presentation layer
- Data modeling before coding prevents painful structural refactors — pay attention to details like `price_at_purchase` vs current price
- Route planning doubles as architecture planning in SvelteKit — your URLs reveal your access control, data loading, and navigation structure
- Server data uses load functions, client interaction state uses `$state`, shareable state uses URL params — each type has different persistence and scope requirements
- Component architecture identifies shared pieces early — the question is always "where does state live, and who needs it?"
- Wireframes should be ugly on purpose — if they look polished, people argue about colors instead of structure
- A good requirements document is short enough that everyone reads it and specific enough to guide decisions — aim for 2-5 pages, not 200
- Break the project into weekly milestones with concrete deliverables so you can track progress and catch slips early
