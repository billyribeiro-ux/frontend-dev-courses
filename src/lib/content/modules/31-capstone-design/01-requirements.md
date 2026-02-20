# Requirements & Planning

Welcome to the capstone project. Over the next five modules you will build a complete **e-commerce store** from scratch — product catalog, shopping cart, checkout, payments, admin panel, and deployment. This is a real project you can put in your portfolio.

Before writing a single line of code, you need a plan. Jumping straight into coding without requirements is like building a house without blueprints. You might end up with something, but it probably will not have a front door. In this lesson you will define features, write user stories, prioritize your MVP, and sketch wireframes.

## Defining Features for the E-Commerce Store

Start by listing everything an e-commerce store needs. Do not filter yet — just brainstorm:

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
- Address form
- Payment processing (Stripe)
- Order confirmation
- Email receipts

Admin Features:
- Product management (CRUD)
- Order management
- Basic analytics dashboard
- Image upload

Technical Features:
- Authentication (sign up, sign in, sign out)
- Responsive design
- SEO optimization
- Performance optimization
```

## User Stories

User stories describe features from the user's perspective. They follow the format: **As a [role], I want [action] so that [benefit]**.

```
Customer Stories:
- As a customer, I want to browse products by category so I can find what I need
- As a customer, I want to search for products so I can quickly find specific items
- As a customer, I want to add items to my cart so I can purchase multiple products
- As a customer, I want to check out as a guest so I do not have to create an account
- As a customer, I want to pay with my credit card so I can complete my purchase
- As a customer, I want to see my order history so I can track past purchases

Admin Stories:
- As an admin, I want to add new products so I can expand the catalog
- As an admin, I want to update product details so I can fix errors and change prices
- As an admin, I want to view all orders so I can fulfill them
- As an admin, I want to see revenue totals so I can track business performance
```

## Prioritizing MVP Features

You cannot build everything at once. Identify the **Minimum Viable Product (MVP)** — the smallest set of features that make the store functional:

| Priority | Feature | Reason |
|----------|---------|--------|
| **Must Have** | Product listing and detail pages | Core of any store |
| **Must Have** | Shopping cart | Cannot sell without it |
| **Must Have** | Checkout with Stripe | Must accept payment |
| **Must Have** | User authentication | Required for orders |
| **Must Have** | Admin product CRUD | Must manage inventory |
| **Should Have** | Category filtering | Improves browsing |
| **Should Have** | Order management | Needed for fulfillment |
| **Should Have** | Search | Convenience feature |
| **Nice to Have** | Wishlist | Enhancement |
| **Nice to Have** | Reviews and ratings | Enhancement |
| **Nice to Have** | Email receipts | Enhancement |

Focus on "Must Have" items first. Ship those, then iterate.

## Sketching Wireframes

You do not need design software. Pen and paper or a simple tool like Excalidraw works perfectly. Sketch these key pages:

```
Pages to wireframe:
1. Home page — Hero banner, featured products, categories
2. Product listing — Grid of product cards, filter sidebar, pagination
3. Product detail — Image gallery, title, price, description, "Add to Cart" button
4. Shopping cart — List of items, quantities, subtotal, "Checkout" button
5. Checkout — Address form, order summary, payment section
6. Admin dashboard — Sidebar nav, stats cards, recent orders
7. Admin product form — Title, description, price, images, category select
```

For each wireframe, identify the main components:

```
Product Card Component:
  ┌─────────────────┐
  │    [Image]       │
  │                  │
  │  Product Name    │
  │  $29.99          │
  │  [Add to Cart]   │
  └─────────────────┘
```

## Try It

Write user stories and wireframes for one additional feature not listed above — such as a coupon/discount system, a product comparison page, or a "recently viewed" section. Define what the MVP version looks like versus the full version.

## Key Takeaways

- Always define requirements before coding to avoid building the wrong thing
- User stories keep features grounded in real user needs, not developer assumptions
- MVP prioritization ensures you ship a working product instead of an unfinished feature list
- Wireframes do not need to be pretty — they need to communicate layout and component structure
- The capstone store will include: catalog, cart, checkout with Stripe, authentication, and an admin panel
