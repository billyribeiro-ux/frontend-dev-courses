# Requirements & Planning

Welcome to the capstone project. Over the next five modules you will build a complete **e-commerce store** from scratch — product catalog, shopping cart, checkout, payments, admin panel, and deployment. This is a real project you can put in your portfolio.

Before writing a single line of code, you need a plan. This is not bureaucratic overhead — it is leverage. Every hour spent on requirements saves roughly ten hours in development. That is not a platitude; it is a pattern I have watched play out on dozens of projects. Without requirements, you build the wrong thing, discover it late, and either ship something mediocre or rewrite half of it. With clear requirements, you make mistakes on paper (cheap) instead of in code (expensive).

Jumping straight into coding without requirements is like building a house without blueprints. You might end up with something, but it probably will not have a front door.

## The Mental Model: Requirements as Risk Reduction

Think of requirements gathering as systematically reducing uncertainty. At the start of a project, almost everything is unknown: what exactly are we building? Who is it for? What are the edge cases? How do the pieces connect? Each requirements activity — user stories, wireframes, data modeling, route planning — converts an unknown into a known. By the time you open your editor, most of the hard decisions are already made.

The cost curve of fixing mistakes looks like this: a requirement change costs 1x. A design change costs 5x. A code change costs 10x. A production bug costs 50x. Requirements are where you want to find and fix problems.

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

## The MVP Mindset

You cannot build everything at once. The Minimum Viable Product is the smallest thing you can ship that delivers real value. The emphasis is on "viable" — it has to actually work end-to-end. A product listing without a cart is not viable. A cart without checkout is not viable. But a store without wishlists, reviews, or email receipts? That is viable.

The MVP is not a bad version of the full product. It is the core of the product, with everything non-essential stripped away. You ship it, learn from real usage, and iterate. Features you thought were essential might not matter. Features you did not think of might be critical.

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

## Try It

Write user stories with acceptance criteria for one additional feature not listed above — such as a coupon/discount system, a product comparison page, or a "recently viewed" section. For your chosen feature, define: (1) the MVP version with 3-5 acceptance criteria, (2) the full version with additional criteria, (3) which MoSCoW category it belongs in and why, and (4) what data model changes it requires.

## Key Takeaways

- Time spent on requirements saves 10x in development time — find mistakes on paper, not in code
- User stories with acceptance criteria transform vague features into testable checklists
- The MVP is the smallest viable product, not a bad version of the full product — ship it, learn, iterate
- MoSCoW prioritization makes scope decisions explicit, and the "Won't Have" list is your shield against scope creep
- Data modeling before coding prevents painful structural refactors — pay attention to details like `price_at_purchase` vs current price
- Route planning doubles as architecture planning in SvelteKit — your URLs reveal your access control, data loading, and navigation structure
- Component architecture identifies shared pieces early — the question is always "where does state live, and who needs it?"
- Wireframes should be ugly on purpose — if they look polished, people argue about colors instead of structure
- A good requirements document is short enough that everyone reads it and specific enough to guide decisions
