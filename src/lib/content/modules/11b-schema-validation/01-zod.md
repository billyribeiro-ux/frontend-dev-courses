# Schema Validation with Zod

TypeScript just gave you compile-time type safety. Your editor catches wrong property names, mismatched argument types, and forgotten null checks before you even save the file. That is a massive productivity win — but it has a gap you need to understand before you build anything that touches external data.

**TypeScript types do not exist at runtime.** The compiler erases every type annotation, every interface, every generic parameter during the build step. What ships to the browser is plain JavaScript with zero knowledge of the types you so carefully wrote. This means every boundary where data enters your application — form submissions, API responses, `localStorage`, URL search params, WebSocket messages, third-party SDKs — is a point where reality can diverge from what TypeScript *thinks* is true.

Schema validation libraries close this gap. They give you runtime validation that matches your TypeScript types, so you can trust external data the same way you trust your own code. In this lesson you will learn Zod, the most popular schema validation library in the TypeScript ecosystem. Lesson 2 covers Valibot (a tree-shakeable alternative), and lesson 3 integrates both with SvelteKit form actions and remote functions.

## Why Schema Validation Matters

Consider this scenario. You have a TypeScript interface for a user profile:

```ts
interface UserProfile {
  name: string;
  email: string;
  age: number;
}
```

And you fetch that profile from an API:

```ts
const response = await fetch('/api/profile');
const profile: UserProfile = await response.json();
```

TypeScript is perfectly happy with this code. No red squiggles. But here is the problem: `response.json()` returns `any`. That type assertion `const profile: UserProfile` is a **lie**. You told TypeScript "trust me, this is a UserProfile" without verifying it. If the API returns `{ name: "Alice", email: null, age: "twenty-eight" }`, TypeScript will not catch it. Your app will crash somewhere downstream when code tries to call `.toLowerCase()` on a null email or do arithmetic on the string "twenty-eight".

This is not a contrived example. It happens constantly: a backend developer changes a field from required to optional, a user edits `localStorage` in DevTools, URL search params arrive as strings when you expect numbers, a third-party API changes its response format. Every one of these passes TypeScript's compiler without complaint.

Schema validation solves this by checking data **at runtime** against a schema you define. If the data matches, you get a properly typed value. If not, you get a structured error telling you exactly what went wrong.

### The WRONG Way vs The CORRECT Way

```ts
// WRONG: Trust the API blindly
// TypeScript thinks profile is UserProfile, but at runtime it could be anything.
// This is the most common source of "impossible" bugs in TypeScript applications.
const response = await fetch('/api/profile');
const profile: UserProfile = await response.json();
console.log(profile.email.toLowerCase()); // Runtime crash if email is null
```

```ts
// CORRECT: Validate at the boundary, then trust the result
import { z } from 'zod';

const UserProfileSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  age: z.number().int().positive()
});

type UserProfile = z.infer<typeof UserProfileSchema>;

const response = await fetch('/api/profile');
const raw = await response.json();
const profile = UserProfileSchema.parse(raw);
// profile is now verified at runtime AND typed as UserProfile at compile time
console.log(profile.email.toLowerCase()); // Safe — email is guaranteed to be a string
```

## Installing Zod

Zod has zero dependencies and weighs approximately 13KB minified and gzipped. Install it in your SvelteKit project:

```bash
npm install zod
```

One thing to know upfront: Zod does **not** tree-shake well. `import { z } from 'zod'` pulls in the entire library regardless of which methods you use. For most applications, 13KB is negligible. If bundle size is critical, lesson 2 covers Valibot, which tree-shakes down to only the functions you import.

## Zod Fundamentals

Every Zod schema starts with a type constructor on the `z` namespace. A schema is an object that knows how to validate a value and return either the parsed result or a structured error.

### Primitive Schemas

```ts
import { z } from 'zod';

// String
const nameSchema = z.string();
nameSchema.parse("Alice");     // Returns "Alice"
nameSchema.parse(42);          // Throws ZodError

// Number
const ageSchema = z.number();
ageSchema.parse(28);           // Returns 28
ageSchema.parse("28");         // Throws ZodError — no silent coercion

// Boolean
const activeSchema = z.boolean();
activeSchema.parse(true);      // Returns true
activeSchema.parse("true");    // Throws ZodError — "true" is not true

// Date
const createdSchema = z.date();
createdSchema.parse(new Date());       // Returns the Date object
createdSchema.parse("2024-01-15");     // Throws ZodError — a date string is not a Date

// Undefined and null
const undefinedSchema = z.undefined();
const nullSchema = z.null();
```

Notice how strict Zod is. The string `"28"` fails a number schema, `"true"` fails a boolean schema. This is intentional — silent coercion causes bugs. If you need coercion, Zod has explicit tools for that (covered in Refinements & Transforms).

### String Validations

Zod ships with built-in validators for common string patterns:

```ts
const emailSchema = z.string().email();
const urlSchema = z.string().url();
const uuidSchema = z.string().uuid();
const cuidSchema = z.string().cuid();
const emojiSchema = z.string().emoji();

// Length constraints
const usernameSchema = z.string()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters");

// Regex patterns
const slugSchema = z.string().regex(
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  "Must be a valid URL slug (lowercase letters, numbers, hyphens)"
);

// Trimming and case transforms
const cleanedString = z.string().trim().toLowerCase();
cleanedString.parse("  Hello World  "); // Returns "hello world"

// startsWith, endsWith, includes
const prefixed = z.string().startsWith("https://");
const tagged = z.string().includes("@");
```

### Number Validations

```ts
const priceSchema = z.number()
  .positive("Price must be positive")
  .finite("Price must be finite"); // rejects Infinity and NaN

const quantitySchema = z.number()
  .int("Quantity must be a whole number")
  .min(1, "Minimum quantity is 1")
  .max(99, "Maximum quantity is 99");

const ratingSchema = z.number()
  .min(0)
  .max(5)
  .multipleOf(0.5); // 0, 0.5, 1, 1.5, ... 5
```

### Literal, Enum, and NativeEnum

When a value must be exactly one specific thing:

```ts
// Literal — exactly one value
const adminRole = z.literal("admin");
adminRole.parse("admin");  // Returns "admin"
adminRole.parse("user");   // Throws ZodError

// Enum — one of a fixed set of string values
const roleSchema = z.enum(["admin", "editor", "viewer"]);
roleSchema.parse("editor");   // Returns "editor"
roleSchema.parse("superuser"); // Throws ZodError

// Access the enum values programmatically
roleSchema.options; // ["admin", "editor", "viewer"]
roleSchema.enum.admin; // "admin" — useful for type-safe comparisons

// NativeEnum — wraps an existing TypeScript enum
enum Status {
  Active = "active",
  Inactive = "inactive",
  Pending = "pending"
}

const statusSchema = z.nativeEnum(Status);
statusSchema.parse("active");  // Returns "active"
statusSchema.parse("deleted"); // Throws ZodError
```

Prefer `z.enum()` over `z.nativeEnum()` in new code. TypeScript enums have well-known quirks, and `z.enum()` gives you the same type safety without them.

### `.parse()` vs `.safeParse()`

Every Zod schema has two parsing methods. Understanding when to use each is critical:

```ts
const schema = z.string().email();

// .parse() — throws on failure
// Use when invalid data is truly exceptional and you want the error to propagate
try {
  const email = schema.parse(input);
  // email is typed as string
} catch (error) {
  // error is a ZodError
}

// .safeParse() — returns a result object, never throws
// Use when you expect invalid data and want to handle it gracefully
const result = schema.safeParse(input);

if (result.success) {
  // result.data is typed as string
  console.log(result.data);
} else {
  // result.error is a ZodError with structured information
  console.log(result.error.issues);
}
```

**Rule of thumb:** Use `.safeParse()` for user input where invalid data is expected. Use `.parse()` for data you control where invalid data means something is genuinely broken.

## Object Schemas

Most real-world validation involves objects. Zod's `z.object()` is where the library truly shines.

### Basic Object Schema

```ts
const UserSchema = z.object({
  id: z.number(),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  age: z.number().int().min(13, "Must be at least 13 years old"),
  bio: z.string().max(500).optional() // .optional() makes the field not required
});

// TypeScript type is automatically inferred:
// {
//   id: number;
//   name: string;
//   email: string;
//   age: number;
//   bio?: string | undefined;
// }
type User = z.infer<typeof UserSchema>;
```

### Nested Objects

```ts
const AddressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2, "State must be a 2-letter code"),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/, "Invalid ZIP code")
});

const CustomerSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  shippingAddress: AddressSchema,
  billingAddress: AddressSchema.optional()
});

type Customer = z.infer<typeof CustomerSchema>;
```

### Object Manipulation Methods

Zod provides methods that mirror TypeScript's utility types but work at the runtime validation level:

```ts
const FullUserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["admin", "editor", "viewer"]),
  createdAt: z.date()
});

// .partial() — all fields become optional (like Partial<T>). Useful for PATCH operations.
const UpdateUserSchema = FullUserSchema.partial();

// .required() — all fields become required (undoes .partial())
const RequiredUserSchema = UpdateUserSchema.required();

// .pick() — select specific fields (like Pick<T, K>)
const UserCredentialsSchema = FullUserSchema.pick({ email: true, password: true });

// .omit() — exclude specific fields (like Omit<T, K>)
const PublicUserSchema = FullUserSchema.omit({ password: true });

// .extend() — add new fields to an existing schema
const AdminUserSchema = FullUserSchema.extend({
  permissions: z.array(z.string()),
  lastLogin: z.date().optional()
});

// .merge() — combine two object schemas
const TimestampSchema = z.object({
  createdAt: z.date(),
  updatedAt: z.date()
});

const ProductSchema = z.object({
  name: z.string(),
  price: z.number().positive()
});

const TimestampedProductSchema = ProductSchema.merge(TimestampSchema);
// { name: string; price: number; createdAt: Date; updatedAt: Date }
```

### Real-World Example: User Registration

```ts
const RegistrationSchema = z.object({
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, and underscores"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[0-9]/, "Must contain a number"),
  confirmPassword: z.string(),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: "You must accept the terms and conditions" })
  })
}).refine(
  (data) => data.password === data.confirmPassword,
  { message: "Passwords do not match", path: ["confirmPassword"] }
);

type Registration = z.infer<typeof RegistrationSchema>;
```

### Strict, Strip, and Passthrough

By default, Zod **strips** unknown properties from objects. This is usually what you want — it means extra fields in the input are silently removed. But you can change this behavior:

```ts
const PersonSchema = z.object({
  name: z.string(),
  age: z.number()
});

const input = { name: "Alice", age: 28, favoriteColor: "blue" };

// Default behavior: strip unknown keys
PersonSchema.parse(input);
// Returns { name: "Alice", age: 28 } — favoriteColor is removed

// .passthrough() — keep unknown keys
PersonSchema.passthrough().parse(input);
// Returns { name: "Alice", age: 28, favoriteColor: "blue" }

// .strict() — reject unknown keys
PersonSchema.strict().parse(input);
// Throws ZodError: Unrecognized key(s) in object: 'favoriteColor'
```

Use `.strict()` when you want to catch typos in configuration objects or form fields. Use `.passthrough()` when you are validating a subset of a larger object and want to preserve the rest.

## Arrays, Tuples, Records, and Maps

### Arrays

```ts
// Basic array
const tagsSchema = z.array(z.string());
tagsSchema.parse(["svelte", "typescript"]); // OK
tagsSchema.parse([1, 2, 3]);               // Throws — not strings

// Constrained arrays
const itemsSchema = z.array(z.string())
  .min(1, "At least one item required")
  .max(10, "No more than 10 items")
  .nonempty("Cannot be empty"); // nonempty() also narrows the type to [string, ...string[]]

// Array of objects
const OrderItemsSchema = z.array(
  z.object({
    productId: z.number(),
    quantity: z.number().int().positive(),
    price: z.number().positive()
  })
).nonempty("Order must contain at least one item");

type OrderItems = z.infer<typeof OrderItemsSchema>;
// [{ productId: number; quantity: number; price: number }, ...same[]]
// Note: nonempty() guarantees at least one element in the type
```

### Tuples

Tuples are fixed-length arrays where each position has a specific type:

```ts
// A coordinate pair
const coordinateSchema = z.tuple([z.number(), z.number()]);
coordinateSchema.parse([40.7128, -74.006]); // OK
coordinateSchema.parse([40.7128]);           // Throws — needs exactly 2 elements

// A mixed-type row (like a CSV row with known structure)
const rowSchema = z.tuple([
  z.string(),   // name
  z.number(),   // age
  z.boolean()   // active
]);
rowSchema.parse(["Alice", 28, true]); // OK

// Tuple with rest elements
const argsSchema = z.tuple([z.string()]).rest(z.number());
argsSchema.parse(["sum", 1, 2, 3]); // OK — first element string, rest are numbers
```

### Records and Maps

Records validate objects with dynamic keys. Use `z.record()` when you know key/value types but not key names:

```ts
const scoresSchema = z.record(z.string(), z.number());
scoresSchema.parse({ alice: 95, bob: 87 }); // OK
scoresSchema.parse({ alice: "A+" });         // Throws — value must be number

// Constrain keys with z.enum
const themeSchema = z.record(
  z.enum(["light", "dark"]),
  z.object({ background: z.string(), foreground: z.string() })
);
```

`z.map()` validates actual `Map` objects. Use `z.record()` for plain objects with dynamic keys.

## Refinements and Transforms

Built-in validators cover common cases, but real applications always have custom rules. Refinements add custom validation logic; transforms change the parsed value.

### `.refine()` — Custom Validation

```ts
// Validate that a number is even
const evenNumber = z.number().refine(
  (n) => n % 2 === 0,
  { message: "Number must be even" }
);

evenNumber.parse(4);  // Returns 4
evenNumber.parse(3);  // Throws: "Number must be even"

// Async refinements are also supported (e.g., checking database uniqueness)
const uniqueEmail = z.string().email().refine(
  async (email) => !(await checkEmailExists(email)),
  { message: "Email already registered" }
);
// Async schemas must use parseAsync / safeParseAsync
const result = await uniqueEmail.safeParseAsync("alice@example.com");
```

### `.superRefine()` — Multiple Errors at Once

`.refine()` adds one error at a time. `.superRefine()` lets you add multiple issues in a single pass:

```ts
const passwordSchema = z.string().superRefine((val, ctx) => {
  if (val.length < 8) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Must be at least 8 characters" });
  }
  if (!/[A-Z]/.test(val)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Must contain an uppercase letter" });
  }
  if (!/[0-9]/.test(val)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Must contain a number" });
  }
});

// When "abc" is parsed, ALL three issues are reported — not just the first one.
// This is critical for form UX: users should see every problem at once.
```

### `.transform()` — Change the Output Type

Transforms let you parse input in one type and return a different type:

```ts
// Parse a string, return a number
const numericString = z.string().transform((val) => parseInt(val, 10));
numericString.parse("42"); // Returns the number 42 (not the string "42")

// Slug generation from a title
const titleToSlug = z.string()
  .min(1, "Title is required")
  .transform((title) =>
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  );

titleToSlug.parse("My Blog Post!"); // Returns "my-blog-post"

// Parse date strings into Date objects
const dateString = z.string()
  .datetime() // validates ISO 8601 format
  .transform((str) => new Date(str));

// Transform object shapes (e.g., snake_case API response to camelCase)
const RawApiSchema = z.object({
  first_name: z.string(),
  last_name: z.string()
}).transform((raw) => ({
  firstName: raw.first_name,
  lastName: raw.last_name
}));

type ApiUser = z.infer<typeof RawApiSchema>;
// { firstName: string; lastName: string }
```

### `.pipe()` — Chain Schemas Together

`.pipe()` sends the output of one schema into another schema for further validation. This is particularly useful when a transform produces a value that needs additional validation:

```ts
// Parse a string to a number, then validate the number
const positiveIntString = z.string()
  .transform((val) => parseInt(val, 10))
  .pipe(z.number().int().positive());

positiveIntString.parse("42");   // Returns 42
positiveIntString.parse("-5");   // Throws — negative number
positiveIntString.parse("abc");  // Throws — NaN is not a positive integer
```

### `.preprocess()` and Coercion

`.preprocess()` transforms input *before* validation (unlike `.transform()` which runs after):

```ts
const booleanFromString = z.preprocess(
  (val) => val === "true" ? true : val === "false" ? false : val,
  z.boolean()
);
booleanFromString.parse("true");  // Returns true (boolean)
booleanFromString.parse("yes");   // Throws — "yes" is not a boolean
```

### Coercion Shorthand

For common coercions, Zod provides `z.coerce` which calls the appropriate JavaScript constructor before validating:

```ts
// z.coerce.number() calls Number(input) before validating
z.coerce.number().parse("42");     // Returns 42
z.coerce.number().parse("");       // Returns 0 — Number("") is 0, be careful!

// z.coerce.boolean() calls Boolean(input) before validating
z.coerce.boolean().parse("true");  // Returns true
z.coerce.boolean().parse("");      // Returns false — Boolean("") is false

// z.coerce.date() calls new Date(input) before validating
z.coerce.date().parse("2024-01-15"); // Returns a Date object

// z.coerce.string() calls String(input) before validating
z.coerce.string().parse(42);        // Returns "42"
```

Be cautious with `z.coerce` — it uses JavaScript's built-in coercion rules, which are famously quirky (`Number("")` is `0`, `Boolean("false")` is `true`). If you need precise control, use `.preprocess()` or `.transform()` instead.

## Type Inference — The Killer Feature

This is the single most important concept in this lesson. Zod schemas are not just validators — they are **type generators**. `z.infer` extracts the TypeScript type from any schema, so you define the shape once and get both runtime validation and compile-time types from the same source of truth.

### The WRONG Pattern: Manual Duplication

```ts
// WRONG: Define the type manually, then write validation separately.
// These two definitions WILL drift apart over time.

interface CreateProduct {
  name: string;
  price: number;
  category: "electronics" | "clothing" | "food";
  tags: string[];
}

function validateProduct(data: unknown): CreateProduct {
  const obj = data as Record<string, unknown>;
  if (typeof obj.name !== "string") throw new Error("Name is required");
  if (typeof obj.price !== "number" || obj.price <= 0) throw new Error("Price must be positive");
  // Forgot to validate 'tags'? TypeScript won't warn you.
  // Added a new field to the interface? The validator won't know.
  return data as CreateProduct; // unsafe assertion
}
```

Three problems: (1) the interface and validator are separate sources of truth that drift apart, (2) manual validation is incomplete — notice the missing `tags` check, (3) the `as CreateProduct` cast defeats the purpose of validation.

### The CORRECT Pattern: Single Source of Truth

```ts
// CORRECT: Define the schema once. Derive the type from it.
const CreateProductSchema = z.object({
  name: z.string().min(1, "Name is required"),
  price: z.number().positive("Price must be positive"),
  category: z.enum(["electronics", "clothing", "food"]),
  tags: z.array(z.string())
});

// Derive the type — always in sync, zero maintenance
type CreateProduct = z.infer<typeof CreateProductSchema>;
// { name: string; price: number; category: "electronics" | "clothing" | "food"; tags: string[] }

function validateProduct(data: unknown): CreateProduct {
  return CreateProductSchema.parse(data);
  // If parse succeeds, the return type is CreateProduct — guaranteed.
  // If parse fails, it throws a ZodError with detailed field-level messages.
}
```

### Type Inference with Transforms

When a schema includes `.transform()`, the input and output types differ. Zod provides both:

```ts
const ApiProductSchema = z.object({
  product_name: z.string(),
  unit_price: z.string().transform((val) => parseFloat(val)),
  is_available: z.string().transform((val) => val === "true")
});

// z.infer gives you the OUTPUT type (after transforms)
type ApiProduct = z.infer<typeof ApiProductSchema>;
// { product_name: string; unit_price: number; is_available: boolean }

// z.input gives you the INPUT type (before transforms)
type ApiProductInput = z.input<typeof ApiProductSchema>;
// { product_name: string; unit_price: string; is_available: string }
```

`z.input` is useful when you need to type the raw data before it enters the schema — for example, when building a form where all values start as strings.

## Error Handling

When validation fails, Zod does not give you a single error message. It gives you a structured `ZodError` object that contains every issue found during parsing. This is essential for building good form experiences where users need to see all field errors at once.

### ZodError Structure

```ts
const LoginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters")
});

const result = LoginSchema.safeParse({
  email: "not-an-email",
  password: "short"
});

if (!result.success) {
  console.log(result.error.issues);
  // [
  //   {
  //     code: "invalid_string",
  //     validation: "email",
  //     message: "Invalid email",
  //     path: ["email"]
  //   },
  //   {
  //     code: "too_small",
  //     type: "string",
  //     minimum: 8,
  //     message: "Password must be at least 8 characters",
  //     path: ["password"]
  //   }
  // ]
}
```

Each issue has a `path` array that tells you exactly which field (including nested fields) caused the problem.

### `.flatten()` — Simple Field Error Map

`.flatten()` gives you a flat object mapping field names to error message arrays. This is the most common format for form validation:

```ts
if (!result.success) {
  const flat = result.error.flatten();
  console.log(flat);
  // {
  //   formErrors: [],           // errors not tied to a specific field
  //   fieldErrors: {
  //     email: ["Invalid email"],
  //     password: ["Password must be at least 8 characters"]
  //   }
  // }
}
```

### `.format()` — Nested Error Map

`.format()` preserves the nesting structure, useful for deeply nested schemas:

```ts
if (!result.success) {
  const formatted = result.error.format();
  // Access nested errors through the object path:
  // formatted.customer?.name?._errors  -> ["String must contain at least 1 character(s)"]
  // formatted.customer?.email?._errors  -> ["Invalid email"]
  // formatted.items?.[0]?.quantity?._errors -> ["Number must be greater than 0"]
}
```

### Building a Form Error Helper

Here is a reusable pattern you will use heavily with SvelteKit form actions (lesson 3):

```ts
type FieldErrors<T> = Partial<Record<keyof T, string[]>>;

function validateForm<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: FieldErrors<T> } {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };

  const flat = result.error.flatten();
  return { success: false, errors: flat.fieldErrors as FieldErrors<T> };
}
```

## Unions, Discriminated Unions, and Intersections

### Union — One of Several Types

`z.union()` validates that a value matches at least one of the provided schemas. Zod tries each schema in order and returns the result of the first one that succeeds:

```ts
const stringOrNumber = z.union([z.string(), z.number()]);
stringOrNumber.parse("hello"); // Returns "hello"
stringOrNumber.parse(42);      // Returns 42
stringOrNumber.parse(true);    // Throws ZodError

// Shorthand using .or()
const same = z.string().or(z.number());
```

### Discriminated Union — The Right Way to Model Variants

When you have objects that share a common "type" field but differ in their remaining fields, use `z.discriminatedUnion()`. This is the runtime equivalent of TypeScript's discriminated union pattern:

```ts
// WRONG: z.union() with objects tries each schema sequentially — confusing errors
const EventSchemaWrong = z.union([
  z.object({ type: z.literal("click"), x: z.number(), y: z.number() }),
  z.object({ type: z.literal("scroll"), direction: z.enum(["up", "down"]) }),
  z.object({ type: z.literal("submit"), formId: z.string() })
]);

// CORRECT: z.discriminatedUnion() checks the discriminant first, then validates
// only the matching schema. Faster and clearer errors.
const EventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("click"), x: z.number(), y: z.number() }),
  z.object({ type: z.literal("scroll"), direction: z.enum(["up", "down"]), distance: z.number() }),
  z.object({ type: z.literal("submit"), formId: z.string(), fields: z.record(z.string()) })
]);

type AppEvent = z.infer<typeof EventSchema>;
// | { type: "click"; x: number; y: number }
// | { type: "scroll"; direction: "up" | "down"; distance: number }
// | { type: "submit"; formId: string; fields: Record<string, string> }

// Exhaustive narrowing works just like TypeScript discriminated unions:
function handleEvent(event: AppEvent) {
  switch (event.type) {
    case "click":   console.log(`Clicked at (${event.x}, ${event.y})`); break;
    case "scroll":  console.log(`Scrolled ${event.direction}`); break;
    case "submit":  console.log(`Form ${event.formId} submitted`); break;
  }
}
```

`z.discriminatedUnion()` is always preferred over `z.union()` for object variants: it is faster (Zod reads the discriminant and jumps to the right schema) and error messages are better (field-specific errors instead of "failed all variants").

### Intersections

`z.intersection()` (or the `.and()` shorthand) combines two schemas — a value must satisfy both:

```ts
const WithId = z.object({ id: z.number() });
const WithTimestamps = z.object({ createdAt: z.date(), updatedAt: z.date() });

const EntitySchema = z.intersection(WithId, WithTimestamps);
// Equivalent to: { id: number; createdAt: Date; updatedAt: Date }
```

In practice, `.merge()` is usually preferred over `.intersection()` for combining object schemas because `.merge()` returns a `ZodObject` that supports `.pick()`, `.omit()`, and other object methods.

## Advanced Patterns

### Recursive Schemas with `z.lazy()`

Some data structures reference themselves — comment threads, file trees, organizational hierarchies. Zod handles these with `z.lazy()`:

```ts
// A comment that can have nested replies
interface Comment {
  id: string;
  text: string;
  author: string;
  replies: Comment[];
}

const CommentSchema: z.ZodType<Comment> = z.object({
  id: z.string().uuid(),
  text: z.string().min(1),
  author: z.string(),
  replies: z.lazy(() => z.array(CommentSchema))
});

```

Note the explicit type annotation `: z.ZodType<Comment>`. Without it, TypeScript cannot infer the recursive type. You must define the interface separately and tell Zod what the resulting type should be.

### Branded Types with `.brand()`

TypeScript's structural typing means a `string` is a `string`, whether it represents an email, a UUID, or a user ID. This can lead to bugs where you pass the wrong string to the wrong function. Zod's `.brand()` creates **nominal types** — types that look like strings but are not interchangeable:

```ts
const EmailSchema = z.string().email().brand<"Email">();
const UserIdSchema = z.string().uuid().brand<"UserId">();

type Email = z.infer<typeof EmailSchema>;   // string & { __brand: "Email" }
type UserId = z.infer<typeof UserIdSchema>; // string & { __brand: "UserId" }

function sendEmail(to: Email, subject: string) { /* ... */ }

const email = EmailSchema.parse("alice@example.com");
const userId = UserIdSchema.parse("550e8400-e29b-41d4-a716-446655440000");

sendEmail(email, "Welcome!");  // OK
sendEmail(userId, "Welcome!"); // TypeScript error! UserId is not assignable to Email

const rawString = "alice@example.com";
sendEmail(rawString, "Hello"); // TypeScript error! string is not assignable to Email
```

Branded types ensure validated values cannot be confused with unvalidated ones and that different identifier types cannot be mixed up.

### Custom Schemas with `z.custom()`

For types Zod does not have built-in support for:

```ts
const fileSchema = z.custom<File>(
  (val) => val instanceof File,
  { message: "Expected a File object" }
);
```

### Optional, Nullable, and Default

These modifiers are used constantly and worth understanding precisely:

```ts
const schema = z.object({
  // .optional() — field can be missing or undefined
  nickname: z.string().optional(),
  // Inferred type: string | undefined

  // .nullable() — field can be null
  deletedAt: z.date().nullable(),
  // Inferred type: Date | null

  // .nullish() — field can be missing, undefined, or null
  middleName: z.string().nullish(),
  // Inferred type: string | null | undefined

  // .default() — if missing/undefined, use this value
  role: z.enum(["user", "admin"]).default("user"),
  // Input type: "user" | "admin" | undefined
  // Output type: "user" | "admin" (never undefined)

  // .catch() — if validation fails, use this fallback instead of throwing
  theme: z.enum(["light", "dark"]).catch("light"),
  // Any invalid value silently becomes "light"
});
```

`.default()` fills in a value when the input is `undefined`. `.catch()` replaces the value when validation *fails*. Use `.default()` for sensible defaults; use `.catch()` for fault tolerance with external data.

## Performance Considerations

Zod is fast enough for the vast majority of use cases, but there are patterns to understand if you are performance-conscious.

### Create Schemas Once, Reuse Everywhere

```ts
// WRONG: Creating a new schema on every function call
function validateUser(data: unknown) {
  // This creates a new schema object with every call — unnecessary allocation
  const schema = z.object({
    name: z.string(),
    email: z.string().email()
  });
  return schema.parse(data);
}

// CORRECT: Create the schema once at module level, reuse it
const UserSchema = z.object({
  name: z.string(),
  email: z.string().email()
});

function validateUser(data: unknown) {
  return UserSchema.parse(data);
}
```

Define schemas at the module level (outside functions) and import them where needed.

### `.safeParse()` in Hot Paths

In tight loops (processing a large CSV, validating WebSocket messages), prefer `.safeParse()` — it returns a result object without creating an `Error` or capturing a stack trace, which matters when most data is invalid:

```ts
const results = rawItems.map((item) => {
  const result = ItemSchema.safeParse(item);
  return result.success ? result.data : null;
}).filter(Boolean);
```

### Zod vs Hand-Written Validation

For simple checks (`typeof x === "string"`), hand-written code is faster. For complex cases (nested objects, arrays, cross-field rules), Zod is comparable to well-written manual validation and far less error-prone. The performance cost is almost never the bottleneck — network latency, database queries, and DOM rendering dwarf it.

Where Zod's cost matters more is **bundle size**. At approximately 13KB gzipped, it is the largest runtime dependency many frontend apps carry for validation. If your application is extremely size-sensitive, lesson 2 covers Valibot, which tree-shakes to as little as 1-2KB for typical usage.

## Try It

These exercises build on each other. Work through them in order.

### Exercise 1: E-Commerce Product Schema

Create a Zod schema for an e-commerce product with the following requirements:

- `name` — non-empty string, max 100 characters
- `description` — string, max 2000 characters, optional
- `price` — positive number with at most 2 decimal places (hint: use `.multipleOf(0.01)`)
- `compareAtPrice` — optional positive number (the "original" price for showing discounts)
- `sku` — string matching the pattern `XXX-NNNN` (3 uppercase letters, dash, 4 digits)
- `category` — one of `"electronics"`, `"clothing"`, `"home"`, `"sports"`, `"books"`
- `tags` — array of 1-5 lowercase strings
- `variants` — array of objects, each with `size` (string), `color` (string), and `stock` (non-negative integer)

Add a refinement that ensures `compareAtPrice` (when present) is greater than `price`. Derive the TypeScript type from the schema. Validate a sample object and handle errors using `.flatten()`.

### Exercise 2: API Response Validator

Build a generic API response wrapper schema that handles three cases using a discriminated union on a `status` field:

- `"success"` — has a `data` field (use a generic-like pattern by making this a function that accepts a data schema)
- `"error"` — has `code` (number) and `message` (string)
- `"paginated"` — has `data` (array), `page` (positive integer), `pageSize` (positive integer), and `total` (non-negative integer)

Then create a specific instance for a list of users, and validate this sample response:

```ts
const response = {
  status: "paginated",
  data: [{ id: 1, name: "Alice", email: "alice@example.com" }],
  page: 1,
  pageSize: 20,
  total: 1
};
```

Hint: You cannot use `z.discriminatedUnion()` with a generic data field directly. Write a factory function like `createApiResponseSchema(dataSchema: ZodSchema)` that builds the discriminated union with the provided data schema.

### Exercise 3: Form Validation with Error Display

Write a contact form schema with `name`, `email`, `subject` (one of `"general"`, `"support"`, `"billing"`), and `message` (min 20 characters). Then write a `validateContactForm` function that:

1. Takes a `FormData` object
2. Extracts the fields using `.get()`
3. Validates against the schema using `.safeParse()`
4. Returns either `{ success: true, data }` or `{ success: false, fieldErrors }` where `fieldErrors` is an object mapping field names to their first error message (a single string, not an array)

This is the exact pattern you will use with SvelteKit form actions in lesson 3.

## Key Takeaways

- TypeScript types are **erased at build time**. They cannot protect you from invalid data arriving at runtime from forms, APIs, localStorage, or URL params. Schema validation fills this gap.
- Zod schemas serve **dual duty**: runtime validation AND compile-time type generation through `z.infer<typeof schema>`. Define the shape once, get both for free.
- Use `.safeParse()` for user input where invalid data is expected and normal. Use `.parse()` for data you control where invalid data means something is broken.
- Zod object schemas support `.partial()`, `.pick()`, `.omit()`, `.extend()`, and `.merge()` — mirroring TypeScript utility types but working at runtime. Derive related schemas from a single base definition.
- `.refine()` and `.superRefine()` handle custom cross-field validation. `.superRefine()` can report multiple errors in one pass, which is critical for good form UX.
- `.transform()` changes the output type of a schema (string to number, snake_case to camelCase). Use `z.infer` for the output type and `z.input` for the input type.
- `z.discriminatedUnion()` is always preferred over `z.union()` for object variants — it is faster and produces better error messages.
- `ZodError.flatten()` gives you a `{ formErrors, fieldErrors }` structure that maps directly to form field error displays.
- `z.lazy()` handles recursive data structures. `.brand()` creates nominal types that prevent mixing up different string identifiers.
- Create schemas at **module level** and reuse them. Schema construction is not expensive, but recreating them in hot paths is wasteful.
- Zod is approximately **13KB minified and gzipped** and does not tree-shake. For most applications this is fine. If bundle size is critical, the next lesson covers Valibot as a tree-shakeable alternative.
- **Do not validate everywhere.** Validate at the boundaries — where external data enters your application. Once data passes validation, trust the types throughout your internal code.
