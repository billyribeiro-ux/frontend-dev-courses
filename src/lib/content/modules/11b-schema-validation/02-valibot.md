# Valibot — The Tree-Shakable Alternative

In the previous lesson, you learned Zod: the most popular schema validation library in the TypeScript ecosystem. Zod's method-chaining API is elegant, its ecosystem is massive, and it has become the default choice for most projects. But Zod has a structural problem that cannot be fixed without a complete rewrite — its entire API surface ships to the browser whether you use it or not.

Valibot was designed from scratch to solve this problem. It provides the same runtime validation and type inference capabilities as Zod, but through a functional, pipe-based architecture that enables aggressive tree-shaking. If you only use `string()`, `object()`, and `email()`, you only pay for those three functions — not the 200+ others in the library.

This lesson teaches Valibot's API in depth, with constant comparison to the Zod patterns you already know. By the end, you will be able to choose the right tool for each project and migrate between the two libraries fluently.

## Why Valibot Exists

Zod bundles at approximately **13KB minified and gzipped**. That is the cost regardless of whether you use five methods or fifty. The reason is architectural: Zod uses method chaining on class instances. When you write `z.string().min(3).email()`, every method — `min()`, `max()`, `email()`, `url()`, `uuid()`, `regex()`, `trim()`, `startsWith()`, and dozens more — lives on the `ZodString` prototype. The bundler cannot remove `url()` just because you did not call it, because it is a method on the same object as `email()`. Prototypes are opaque to tree-shaking.

Valibot takes a fundamentally different approach. Every operation is a standalone, importable function:

```ts
import * as v from 'valibot';

// Each function is an independent module.
// If you never call v.url(), the bundler drops it entirely.
const EmailSchema = v.pipe(v.string(), v.email());
```

The result: **typical Valibot usage ships 1-3KB** to the browser. For a simple form with string, object, email, and minLength validators, you might ship under 1KB. The savings compound in applications that use validation on the client — form validation, API response validation, and URL parameter parsing all happen in the browser where every kilobyte matters.

### Bundle Size in Context

To understand why this matters, consider where validation code runs:

| Scenario | Runs on server? | Runs in browser? | Bundle size matters? |
|---|---|---|---|
| SvelteKit form action validation | Yes | No | No — server code is not bundled |
| Client-side form validation | No | Yes | **Yes** |
| Shared schema (client + server) | Yes | Yes | **Yes** — schema ships to browser |
| API response validation in load | Yes | No | No |
| API response validation in component | No | Yes | **Yes** |

If your validation only runs server-side, Zod's 13KB is irrelevant — it never reaches the browser. But the moment you share a schema between client and server (the recommended pattern for forms), or validate data inside a Svelte component, the library's size matters. Valibot was built for these cases.

### Not a Retrofit

Some libraries attempt to add tree-shaking after the fact by splitting their API into separate entry points. Valibot did not take this approach. Its functional composition model is the foundation, not an afterthought. Every schema, validator, and action is a pure function that takes data in and returns a result. There are no classes, no prototypes, no shared internal state. This is why the tree-shaking works — the bundler can analyze each function independently and eliminate anything unreachable.

## Core API Design Philosophy

Zod uses **method chaining**:

```ts
import { z } from 'zod';

const schema = z.string().min(3).max(100).email();
```

Valibot uses **functional composition with pipes**:

```ts
import * as v from 'valibot';

const schema = v.pipe(v.string(), v.minLength(3), v.maxLength(100), v.email());
```

The `v.pipe()` function takes a base schema as its first argument, followed by any number of validators and actions that refine the value. Think of it as a pipeline: data enters as `unknown`, gets validated as a `string`, then passes through `minLength`, `maxLength`, and `email` checks in order. If any step fails, the pipeline stops and returns the error.

### Why Pipes Enable Tree-Shaking

In Zod's method chain, `z.string()` returns a `ZodString` instance that carries every string method — `min`, `max`, `email`, `url`, `uuid`, `datetime`, `ip`, `emoji`, `includes`, `startsWith`, `endsWith`, `trim`, `toLowerCase`, `toUpperCase`, and more. The bundler sees a single object with all those methods and must include all of them.

In Valibot's pipe, each step is a separate function import:

```ts
// The bundler sees five independent function calls.
// If you remove v.email(), the bundler drops it.
// If you remove v.maxLength(), the bundler drops it.
v.pipe(
  v.string(),       // standalone function
  v.minLength(3),   // standalone function
  v.maxLength(100), // standalone function
  v.email()         // standalone function
);
```

This is the same principle that makes lodash-es tree-shakable while lodash is not. Standalone functions are transparent to static analysis. Method chains are not.

### Import Style Convention

The standard import for Valibot is the namespace import:

```ts
import * as v from 'valibot';
```

This gives you the `v.` prefix on every call, which is clean and readable. You can also use named imports if you prefer, but the namespace import is the community convention and what you will see in documentation and examples:

```ts
// Also valid, but less common in practice
import { pipe, string, minLength, email, object, parse } from 'valibot';
```

Both styles tree-shake identically. The namespace import does not prevent dead-code elimination — modern bundlers (Vite, Rollup, esbuild) analyze namespace imports and drop unused members.

## Primitive Schemas

Valibot provides schemas for every JavaScript primitive and several common types. Each schema is a function that returns a schema object:

```ts
import * as v from 'valibot';

// String
const Name = v.string();                    // any string
const Name2 = v.string('Name is required'); // custom error for non-string input

// Number
const Age = v.number();
const Age2 = v.number('Age must be a number');

// Boolean
const Active = v.boolean();

// BigInt
const BigId = v.bigint();

// Date — validates that the input is a Date instance
const CreatedAt = v.date();

// Symbol
const UniqueKey = v.symbol();

// Undefined and null
const Nope = v.undefined();
const Empty = v.null();
const Nullish = v.nullish();   // null | undefined

// Unknown — accepts anything, no validation
const Anything = v.unknown();

// Never — always fails (useful in unions for exhaustive checks)
const Impossible = v.never();
```

### Literal, Enum, and Picklist

```ts
// Literal — matches an exact value
const Admin = v.literal('admin');
const FortyTwo = v.literal(42);
const Yes = v.literal(true);

// Picklist — a union of literal strings (Valibot's recommended approach)
const Role = v.picklist(['admin', 'editor', 'viewer']);
// Equivalent to: v.union([v.literal('admin'), v.literal('editor'), v.literal('viewer')])
// but more ergonomic and produces better error messages

// Enum — validates against a TypeScript enum (not a string union)
enum Direction {
  North = 'NORTH',
  South = 'SOUTH',
  East = 'EAST',
  West = 'WEST'
}
const Dir = v.enum(Direction);
```

**Use `v.picklist()` for string unions** and `v.enum()` only when you have an actual TypeScript `enum`. Picklist is the Valibot equivalent of Zod's `z.enum()`.

### Parsing Values

Just like Zod, Valibot has two parsing functions — one that throws, one that returns a result:

```ts
import * as v from 'valibot';

const Email = v.pipe(v.string(), v.email());

// v.parse() — throws ValiError on failure
try {
  const email = v.parse(Email, 'alice@example.com'); // 'alice@example.com'
  const bad = v.parse(Email, 'not-an-email');        // throws ValiError
} catch (err) {
  if (err instanceof v.ValiError) {
    console.log(err.issues); // array of validation issues
  }
}

// v.safeParse() — never throws, returns a result object
const result = v.safeParse(Email, 'alice@example.com');
if (result.success) {
  console.log(result.output); // 'alice@example.com'
} else {
  console.log(result.issues); // array of validation issues
}
```

Notice the structural difference from Zod: in Zod, `parse` is a method on the schema (`schema.parse(data)`). In Valibot, `parse` is a standalone function that takes the schema as the first argument (`v.parse(schema, data)`). This is the functional style — the schema is data, not an object with methods.

### WRONG: Calling .parse() as a Method

```ts
// WRONG — Valibot schemas do not have methods
const schema = v.string();
schema.parse('hello'); // TypeError: schema.parse is not a function

// CORRECT — parse is a standalone function
const result = v.parse(schema, 'hello');
```

This is the most common mistake when switching from Zod to Valibot. Schemas are plain objects, not class instances. All operations are functions that take the schema as an argument.

## Pipes and Validators

The `v.pipe()` function is Valibot's core composition mechanism. It chains a base schema with validators (that check values) and actions (that transform values):

```ts
import * as v from 'valibot';

// Validators — check constraints, produce errors if violated
const Username = v.pipe(
  v.string(),
  v.minLength(3, 'Username must be at least 3 characters'),
  v.maxLength(20, 'Username must be at most 20 characters'),
  v.regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers, and underscores')
);

// Actions — transform the value as it passes through
const NormalizedEmail = v.pipe(
  v.string(),
  v.trim(),         // action: removes whitespace
  v.toLowerCase(),  // action: converts to lowercase
  v.email('Please enter a valid email')  // validator: checks format
);
```

### String Validators

```ts
v.pipe(v.string(),
  v.minLength(n),     // at least n characters
  v.maxLength(n),     // at most n characters
  v.length(n),        // exactly n characters
  v.email(),          // valid email format
  v.url(),            // valid URL format
  v.uuid(),           // valid UUID v4
  v.regex(pattern),   // matches a regular expression
  v.startsWith(str),  // starts with a specific string
  v.endsWith(str),    // ends with a specific string
  v.includes(str),    // contains a specific substring
  v.nonEmpty(),       // at least 1 character (alias for minLength(1))
);
```

### Number Validators

```ts
v.pipe(v.number(),
  v.minValue(n),      // >= n
  v.maxValue(n),      // <= n
  v.value(n),         // exactly n
  v.integer(),        // no decimal places
  v.finite(),         // not Infinity or -Infinity
  v.multipleOf(n),    // divisible by n
);
```

### Actions (Transforms)

Actions modify the value as it passes through the pipe. They come after validators or can be interspersed:

```ts
// v.transform() — arbitrary transformation
const CentsToDollars = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.transform((cents) => cents / 100) // output type changes to number
);

// v.trim(), v.toLowerCase(), v.toUpperCase() — string-specific actions
const CleanInput = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase()
);

// v.check() — custom validation logic (like Zod's .refine())
const EvenNumber = v.pipe(
  v.number(),
  v.integer(),
  v.check((n) => n % 2 === 0, 'Must be an even number')
);

// v.brand() — nominal typing (covered in Advanced Patterns)
const UserId = v.pipe(
  v.string(),
  v.uuid(),
  v.brand('UserId')
);
```

### Pipe Ordering Matters

Validators and actions execute left to right. Order them logically — validate before you transform, and validate the raw input before applying format-specific checks:

```ts
// WRONG — email() runs on untrimmed input, toLowerCase() runs after validation
const BadEmail = v.pipe(
  v.string(),
  v.email(),        // validates " Alice@EXAMPLE.com " — may fail due to spaces
  v.trim(),
  v.toLowerCase()
);

// CORRECT — clean the input, then validate the cleaned result
const GoodEmail = v.pipe(
  v.string(),
  v.trim(),         // " Alice@EXAMPLE.com " → "Alice@EXAMPLE.com"
  v.toLowerCase(),  // "Alice@EXAMPLE.com" → "alice@example.com"
  v.email()         // validates "alice@example.com" — clean input
);
```

## Object Schemas

Object schemas are where Valibot feels most similar to Zod. The `v.object()` function takes a shape definition:

```ts
import * as v from 'valibot';

const UserSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  email: v.pipe(v.string(), v.email()),
  age: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(150))
});

// Parse
const user = v.parse(UserSchema, {
  name: 'Alice',
  email: 'alice@example.com',
  age: 30
});
// user is typed as { name: string; email: string; age: number }
```

### Optional and Nullable Fields

```ts
const ProfileSchema = v.object({
  displayName: v.string(),
  bio: v.optional(v.string()),                // string | undefined
  website: v.optional(v.pipe(v.string(), v.url())), // string | undefined
  avatar: v.nullable(v.string()),             // string | null
  nickname: v.nullish(v.string()),            // string | null | undefined
  role: v.optional(v.picklist(['admin', 'user']), 'user') // defaults to 'user'
});
```

The second argument to `v.optional()` is a default value. When the field is `undefined`, the default is used in the output. This is Valibot's equivalent of Zod's `.default()`.

### Object Utilities

Valibot provides the same object manipulation utilities as Zod:

```ts
const FullUser = v.object({
  id: v.number(),
  name: v.string(),
  email: v.pipe(v.string(), v.email()),
  role: v.picklist(['admin', 'editor', 'viewer']),
  createdAt: v.date()
});

// Partial — all fields become optional
const UserPatch = v.partial(FullUser);

// Required — all fields become required
const StrictUser = v.required(UserPatch);

// Pick — select specific fields
const UserPreview = v.pick(FullUser, ['name', 'email']);

// Omit — remove specific fields
const NewUser = v.omit(FullUser, ['id', 'createdAt']);

// Merge — combine two object schemas
const WithTimestamps = v.object({
  createdAt: v.date(),
  updatedAt: v.date()
});
const TimestampedUser = v.merge([
  v.omit(FullUser, ['createdAt']),
  WithTimestamps
]);
```

### Nested Objects

```ts
const AddressSchema = v.object({
  street: v.pipe(v.string(), v.minLength(1)),
  city: v.pipe(v.string(), v.minLength(1)),
  state: v.pipe(v.string(), v.length(2)),
  zip: v.pipe(v.string(), v.regex(/^\d{5}(-\d{4})?$/))
});

const OrderSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  customer: v.object({
    name: v.string(),
    email: v.pipe(v.string(), v.email())
  }),
  shippingAddress: AddressSchema,
  billingAddress: v.optional(AddressSchema),
  items: v.pipe(
    v.array(
      v.object({
        productId: v.string(),
        quantity: v.pipe(v.number(), v.integer(), v.minValue(1)),
        price: v.pipe(v.number(), v.minValue(0))
      })
    ),
    v.minLength(1, 'Order must have at least one item')
  )
});
```

### User Registration Example (Comparison with Lesson 1)

In the Zod lesson, you wrote a registration schema. Here is the same schema in Valibot so you can see the direct mapping:

```ts
// Zod version (from lesson 1):
import { z } from 'zod';

const RegisterSchemaZod = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be under 100 characters'),
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Please enter a valid email')
    .toLowerCase(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must include an uppercase letter')
    .regex(/[0-9]/, 'Must include a number'),
  confirmPassword: z.string({ required_error: 'Please confirm your password' })
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
});
```

```ts
// Valibot version:
import * as v from 'valibot';

const RegisterSchemaValibot = v.pipe(
  v.object({
    name: v.pipe(
      v.string('Name is required'),
      v.trim(),
      v.minLength(2, 'Name must be at least 2 characters'),
      v.maxLength(100, 'Name must be under 100 characters')
    ),
    email: v.pipe(
      v.string('Email is required'),
      v.trim(),
      v.toLowerCase(),
      v.email('Please enter a valid email')
    ),
    password: v.pipe(
      v.string('Password is required'),
      v.minLength(8, 'Password must be at least 8 characters'),
      v.regex(/[A-Z]/, 'Must include an uppercase letter'),
      v.regex(/[0-9]/, 'Must include a number')
    ),
    confirmPassword: v.string('Please confirm your password')
  }),
  v.forward(
    v.check(
      (data) => data.password === data.confirmPassword,
      'Passwords do not match'
    ),
    ['confirmPassword']  // attach error to confirmPassword field
  )
);
```

Key differences to notice:

1. **Cross-field validation** uses `v.forward(v.check(...), ['path'])` instead of `.refine()`. The `v.forward()` function routes the error to a specific field path — without it, the error would be attached to the root object.
2. **Custom type error messages** are the first argument to the schema function (`v.string('Name is required')`) instead of an options object (`z.string({ required_error: '...' })`).
3. **The entire schema is wrapped in `v.pipe()`** because the cross-field check applies to the object as a whole. The outer pipe composes the object schema with the cross-field validation.
4. **Transforms like `v.trim()` and `v.toLowerCase()`** sit inside the field's pipe, just like validators.

## Arrays, Tuples, Records, and Maps

### Arrays

```ts
import * as v from 'valibot';

// Basic array
const Tags = v.array(v.string());

// Array with constraints (using pipe)
const Tags2 = v.pipe(
  v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(30))),
  v.minLength(1, 'At least one tag is required'),
  v.maxLength(10, 'No more than 10 tags')
);

// Array of objects
const Users = v.array(
  v.object({
    id: v.number(),
    name: v.string()
  })
);

const parsed = v.parse(Tags2, ['svelte', 'typescript']); // ['svelte', 'typescript']
```

Note that `v.minLength()` and `v.maxLength()` work on both strings and arrays when used inside a pipe. The validator checks `.length` on whatever value it receives.

### Tuples

```ts
// Fixed-length array with specific types per position
const Coordinate = v.tuple([v.number(), v.number()]);
// Validates: [40.7128, -74.0060]
// Rejects: [40.7128] or [40.7128, -74.0060, 0]

const Entry = v.tuple([v.string(), v.number(), v.boolean()]);
// Validates: ['Alice', 100, true]

// Tuple with rest element
const AtLeastTwoNumbers = v.tupleWithRest([v.number(), v.number()], v.number());
// Validates: [1, 2], [1, 2, 3], [1, 2, 3, 4, 5]
// Rejects: [1] (too few) or [1, 2, 'three'] (rest must be number)
```

### Records

```ts
// Record — object with dynamic keys
const Scores = v.record(v.string(), v.number());
// Validates: { alice: 100, bob: 85 }

// Record with key validation
const Config = v.record(
  v.pipe(v.string(), v.regex(/^[A-Z_]+$/)),  // keys must be UPPER_SNAKE_CASE
  v.string()
);
// Validates: { DATABASE_URL: 'sqlite://...', API_KEY: 'abc123' }
// Rejects: { databaseUrl: 'sqlite://...' }
```

### Maps and Sets

```ts
// Map
const UserMap = v.map(v.number(), v.string());
// Validates: new Map([[1, 'Alice'], [2, 'Bob']])

// Set
const UniqueIds = v.set(v.pipe(v.number(), v.integer()));
// Validates: new Set([1, 2, 3])
```

## Type Inference

Valibot provides two type inference utilities — and the distinction between them is important:

```ts
import * as v from 'valibot';

const UserSchema = v.pipe(
  v.object({
    name: v.pipe(v.string(), v.trim()),
    email: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email()),
    age: v.pipe(v.string(), v.transform(Number), v.number(), v.minValue(0))
  })
);

// InferInput — the type of data BEFORE parsing (what you pass in)
type UserInput = v.InferInput<typeof UserSchema>;
// { name: string; email: string; age: string }
//                                 ^^^ string — because the input is a string
//                                     that gets transformed to a number

// InferOutput — the type of data AFTER parsing (what you get out)
type UserOutput = v.InferOutput<typeof UserSchema>;
// { name: string; email: string; age: number }
//                                 ^^^ number — after the transform
```

### Why Input and Output Types Differ

When a pipe includes transforms (`v.transform()`, `v.trim()`, `v.toLowerCase()`), the output type can differ from the input type. The `age` field above accepts a `string` (from a form's FormData, for example) and outputs a `number` (after `v.transform(Number)`). This is precisely the same concept as Zod's `z.infer` (output) and `z.input` (input), but with more explicit naming:

| Zod | Valibot | Description |
|---|---|---|
| `z.infer<typeof schema>` | `v.InferOutput<typeof schema>` | Type after parsing/transforms |
| `z.input<typeof schema>` | `v.InferInput<typeof schema>` | Type before parsing |

### WRONG: Using InferOutput When You Mean InferInput

```ts
const FormSchema = v.object({
  age: v.pipe(v.string(), v.transform(Number), v.number(), v.integer())
});

// WRONG — trying to use the output type for the raw form data
type FormData = v.InferOutput<typeof FormSchema>;
// { age: number } — but FormData gives you strings!

function handleForm(data: FormData) {
  v.parse(FormSchema, data);
  // TypeScript says data.age is number, but at runtime it is a string.
  // The parse succeeds because the transform handles it,
  // but the type annotation lies about the input shape.
}

// CORRECT — use InferInput for the raw data, InferOutput for the parsed result
type FormInput = v.InferInput<typeof FormSchema>;
// { age: string } — matches what FormData actually gives you

type FormOutput = v.InferOutput<typeof FormSchema>;
// { age: number } — matches what v.parse() returns
```

This distinction is particularly important in SvelteKit form actions where `FormData` values are always strings, but your schema might transform them to numbers, dates, or booleans.

## Error Handling

When validation fails, `v.parse()` throws a `ValiError` and `v.safeParse()` returns an object with `success: false` and an `issues` array. Each issue contains detailed information about what went wrong:

```ts
import * as v from 'valibot';

const UserSchema = v.object({
  name: v.pipe(v.string(), v.minLength(2)),
  email: v.pipe(v.string(), v.email()),
  age: v.pipe(v.number(), v.minValue(0))
});

const result = v.safeParse(UserSchema, {
  name: '',
  email: 'not-an-email',
  age: -5
});

if (!result.success) {
  for (const issue of result.issues) {
    console.log({
      message: issue.message,       // human-readable error message
      path: issue.path,             // array of path segments to the field
      expected: issue.expected,     // what was expected
      received: issue.received,     // what was received
    });
  }
}
```

### Flattening Errors

Valibot provides `v.flatten()` to convert the issues array into a structured error object — this is extremely useful for form validation:

```ts
const result = v.safeParse(UserSchema, {
  name: '',
  email: 'bad',
  age: -1
});

if (!result.success) {
  const flat = v.flatten(result.issues);

  console.log(flat.root);    // string[] — errors on the root object (cross-field)
  console.log(flat.nested);  // Record<string, string[]> — errors keyed by field path

  // flat.nested looks like:
  // {
  //   'name': ['Invalid length: Expected >=2 but received 0'],
  //   'email': ['Invalid email: Received "bad"'],
  //   'age': ['Invalid value: Expected >=0 but received -1']
  // }
}
```

### Building a Field Error Map (Same Pattern as Lesson 1)

In the Zod lesson, you built a helper that transforms validation errors into a `Record<string, string>` for form display. Here is the same pattern with Valibot:

```ts
// Zod version (from lesson 1):
function getFieldErrors(result: z.SafeParseReturnType<any, any>): Record<string, string> {
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as string;
    if (!errors[field]) errors[field] = issue.message;
  }
  return errors;
}
```

```ts
// Valibot version:
import * as v from 'valibot';

function getFieldErrors(
  result: v.SafeParseResult<typeof schema>
): Record<string, string> {
  if (result.success) return {};

  const errors: Record<string, string> = {};
  for (const issue of result.issues) {
    // Valibot paths use a different structure than Zod
    const field = issue.path?.[0]?.key;
    if (field && typeof field === 'string' && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

// Even simpler with v.flatten():
function getFieldErrorsFlat(issues: v.BaseIssue<unknown>[]): Record<string, string> {
  const flat = v.flatten(issues);
  const errors: Record<string, string> = {};

  if (flat.nested) {
    for (const [field, messages] of Object.entries(flat.nested)) {
      if (messages && messages.length > 0) {
        errors[field] = messages[0]; // first error per field
      }
    }
  }

  return errors;
}
```

### WRONG: Accessing Valibot Errors Like Zod Errors

```ts
const result = v.safeParse(schema, data);

// WRONG — Valibot uses .issues, not .error.issues
if (!result.success) {
  for (const issue of result.error.issues) { // TypeError: result.error is undefined
    // ...
  }
}

// CORRECT — issues are directly on the result
if (!result.success) {
  for (const issue of result.issues) {
    // ...
  }
}
```

```ts
// WRONG — Valibot path segments have .key, not raw values
const field = issue.path[0]; // This is an object, not a string!
console.log(`Error on field: ${field}`); // "Error on field: [object Object]"

// CORRECT — access .key on the path segment
const field = issue.path?.[0]?.key;
console.log(`Error on field: ${field}`); // "Error on field: name"
```

### Deeply Nested Error Access

For nested objects, the path contains multiple segments:

```ts
const Schema = v.object({
  address: v.object({
    street: v.pipe(v.string(), v.minLength(1, 'Street is required')),
    zip: v.pipe(v.string(), v.regex(/^\d{5}$/, 'Invalid ZIP'))
  })
});

const result = v.safeParse(Schema, { address: { street: '', zip: 'abc' } });

if (!result.success) {
  for (const issue of result.issues) {
    // For nested fields, the path has multiple segments
    const fullPath = issue.path?.map((p) => p.key).join('.');
    console.log(`${fullPath}: ${issue.message}`);
    // "address.street: Street is required"
    // "address.zip: Invalid ZIP"
  }
}
```

## Unions and Variants

### Basic Unions

`v.union()` tries each schema in order and returns the first match:

```ts
import * as v from 'valibot';

const StringOrNumber = v.union([v.string(), v.number()]);

v.parse(StringOrNumber, 'hello'); // 'hello'
v.parse(StringOrNumber, 42);      // 42
v.parse(StringOrNumber, true);    // throws ValiError
```

### Discriminated Unions with v.variant()

When each variant has a discriminant field (a field whose literal value identifies the variant), use `v.variant()` instead of `v.union()`. It is faster because it checks the discriminant first instead of trying every schema:

```ts
// Same event-type example from lesson 1, now in Valibot:

const ClickEvent = v.object({
  type: v.literal('click'),
  x: v.number(),
  y: v.number(),
  button: v.picklist(['left', 'right', 'middle'])
});

const KeyEvent = v.object({
  type: v.literal('keypress'),
  key: v.string(),
  ctrlKey: v.boolean(),
  shiftKey: v.boolean()
});

const ScrollEvent = v.object({
  type: v.literal('scroll'),
  deltaX: v.number(),
  deltaY: v.number()
});

// v.variant() — discriminated union (checks "type" field first)
const InputEvent = v.variant('type', [ClickEvent, KeyEvent, ScrollEvent]);

// Parse
const event = v.parse(InputEvent, {
  type: 'click',
  x: 100,
  y: 200,
  button: 'left'
});
// event is typed as the union of all three event types.
// TypeScript narrows based on event.type.
```

### WRONG: Using union() When variant() Is Appropriate

```ts
// WRONG — union() tries each schema sequentially, which is slower
// and produces worse error messages when all variants fail
const Event = v.union([ClickEvent, KeyEvent, ScrollEvent]);

// CORRECT — variant() uses the discriminant field for fast lookup
// and produces an error like "Invalid type: Expected 'click' | 'keypress' | 'scroll'"
const Event = v.variant('type', [ClickEvent, KeyEvent, ScrollEvent]);
```

`v.variant()` is Valibot's equivalent of Zod's `z.discriminatedUnion()`. Use it whenever your union has a common discriminant field.

### Intersections

```ts
const WithId = v.object({ id: v.pipe(v.string(), v.uuid()) });
const WithTimestamps = v.object({
  createdAt: v.date(),
  updatedAt: v.date()
});
const UserFields = v.object({ name: v.string(), email: v.string() });

// intersect — combine multiple object schemas
const FullUser = v.intersect([WithId, UserFields, WithTimestamps]);
// Equivalent to an object with all fields from all three schemas
```

## Advanced Patterns

### Recursive Schemas with v.lazy()

Some data structures reference themselves — trees, linked lists, comment threads. Use `v.lazy()` to create recursive schemas:

```ts
import * as v from 'valibot';

// A comment that can have nested replies
type Comment = {
  id: string;
  text: string;
  author: string;
  replies: Comment[];
};

const CommentSchema: v.GenericSchema<Comment> = v.object({
  id: v.pipe(v.string(), v.uuid()),
  text: v.pipe(v.string(), v.minLength(1)),
  author: v.string(),
  replies: v.array(v.lazy(() => CommentSchema))
});

// A file system tree
type FsNode = {
  name: string;
  type: 'file' | 'directory';
  children?: FsNode[];
};

const FsNodeSchema: v.GenericSchema<FsNode> = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  type: v.picklist(['file', 'directory']),
  children: v.optional(v.array(v.lazy(() => FsNodeSchema)))
});
```

Note that you must explicitly type the schema variable (`: v.GenericSchema<Comment>`) when using `v.lazy()`, because TypeScript cannot infer recursive types.

### Branded Types with v.brand()

Branded types prevent accidentally mixing values that are structurally identical but semantically different:

```ts
import * as v from 'valibot';

// Without branding: UserId and PostId are both strings — easy to mix up
const UserId = v.pipe(v.string(), v.uuid());
const PostId = v.pipe(v.string(), v.uuid());

// With branding: they are distinct types at compile time
const UserId = v.pipe(v.string(), v.uuid(), v.brand('UserId'));
const PostId = v.pipe(v.string(), v.uuid(), v.brand('PostId'));

type UserId = v.InferOutput<typeof UserId>;
type PostId = v.InferOutput<typeof PostId>;

function getUser(id: UserId) { /* ... */ }
function getPost(id: PostId) { /* ... */ }

const userId = v.parse(UserId, '550e8400-e29b-41d4-a716-446655440000');
const postId = v.parse(PostId, 'f47ac10b-58cc-4372-a567-0e02b2c3d479');

getUser(userId); // OK
getUser(postId); // TypeScript error! PostId is not assignable to UserId
```

Brands exist only at the type level — they add zero runtime cost. The parsed value is still a plain string. But TypeScript treats branded values as distinct types, preventing the class of bugs where you accidentally pass a post ID to a function that expects a user ID.

### Fallback Values with v.fallback()

`v.fallback()` provides a default value when parsing fails, instead of throwing an error:

```ts
import * as v from 'valibot';

// If the value is not a valid string, use 'anonymous' instead of failing
const Username = v.fallback(v.string(), 'anonymous');

v.parse(Username, 'alice');   // 'alice'
v.parse(Username, 42);       // 'anonymous' (fallback — no error thrown)
v.parse(Username, undefined); // 'anonymous'

// Fallback with a function (called on each failure)
const RequestId = v.fallback(
  v.pipe(v.string(), v.uuid()),
  () => crypto.randomUUID()  // generate a new UUID if the input is invalid
);

// Fallback on complex schemas
const UserSettings = v.fallback(
  v.object({
    theme: v.picklist(['light', 'dark']),
    fontSize: v.pipe(v.number(), v.minValue(12), v.maxValue(24))
  }),
  { theme: 'light', fontSize: 16 }
);
```

`v.fallback()` is different from `v.optional()` with a default. `v.optional()` only fills in the default when the value is `undefined`. `v.fallback()` fills in the default when validation fails for any reason — wrong type, constraint violation, anything.

### Optional with Defaults

```ts
const SettingsSchema = v.object({
  // v.optional(schema, default) — uses default when value is undefined
  theme: v.optional(v.picklist(['light', 'dark', 'system']), 'system'),
  notifications: v.optional(v.boolean(), true),
  pageSize: v.optional(v.pipe(v.number(), v.integer(), v.minValue(10), v.maxValue(100)), 25)
});

const defaults = v.parse(SettingsSchema, {});
// { theme: 'system', notifications: true, pageSize: 25 }

const custom = v.parse(SettingsSchema, { theme: 'dark', pageSize: 50 });
// { theme: 'dark', notifications: true, pageSize: 50 }
```

### Nullable and Nullish

```ts
// v.nullable() — accepts the type or null
const MaybeString = v.nullable(v.string());
v.parse(MaybeString, 'hello'); // 'hello'
v.parse(MaybeString, null);    // null
v.parse(MaybeString, undefined); // throws

// v.nullish() — accepts the type, null, or undefined
const MaybeString2 = v.nullish(v.string());
v.parse(MaybeString2, 'hello');    // 'hello'
v.parse(MaybeString2, null);       // null
v.parse(MaybeString2, undefined);  // undefined

// v.nullable() with default — replaces null with the default
const WithDefault = v.nullable(v.string(), 'N/A');
v.parse(WithDefault, null); // 'N/A'
```

## Zod-to-Valibot Migration Cheatsheet

This table maps the 20 most common Zod operations to their Valibot equivalents. Bookmark this section — you will reference it every time you migrate a schema.

| Operation | Zod | Valibot |
|---|---|---|
| String | `z.string()` | `v.string()` |
| Number | `z.number()` | `v.number()` |
| Boolean | `z.boolean()` | `v.boolean()` |
| Date | `z.date()` | `v.date()` |
| Literal | `z.literal('admin')` | `v.literal('admin')` |
| String enum | `z.enum(['a', 'b'])` | `v.picklist(['a', 'b'])` |
| Object | `z.object({ ... })` | `v.object({ ... })` |
| Array | `z.array(z.string())` | `v.array(v.string())` |
| Optional | `z.string().optional()` | `v.optional(v.string())` |
| Nullable | `z.string().nullable()` | `v.nullable(v.string())` |
| Default | `z.string().default('x')` | `v.optional(v.string(), 'x')` |
| Min length | `z.string().min(3)` | `v.pipe(v.string(), v.minLength(3))` |
| Max length | `z.string().max(100)` | `v.pipe(v.string(), v.maxLength(100))` |
| Email | `z.string().email()` | `v.pipe(v.string(), v.email())` |
| URL | `z.string().url()` | `v.pipe(v.string(), v.url())` |
| Regex | `z.string().regex(/x/)` | `v.pipe(v.string(), v.regex(/x/))` |
| Trim | `z.string().trim()` | `v.pipe(v.string(), v.trim())` |
| Min value | `z.number().min(0)` | `v.pipe(v.number(), v.minValue(0))` |
| Max value | `z.number().max(100)` | `v.pipe(v.number(), v.maxValue(100))` |
| Integer | `z.number().int()` | `v.pipe(v.number(), v.integer())` |
| Positive | `z.number().positive()` | `v.pipe(v.number(), v.minValue(1))` |
| Nonnegative | `z.number().nonnegative()` | `v.pipe(v.number(), v.minValue(0))` |
| Transform | `z.string().transform(fn)` | `v.pipe(v.string(), v.transform(fn))` |
| Refine | `.refine(fn, msg)` | `v.pipe(..., v.check(fn, msg))` |
| Superrefine | `.superRefine(fn)` | `v.pipe(..., v.rawCheck(fn))` |
| Cross-field refine | `.refine(fn, {path})` | `v.pipe(..., v.forward(v.check(fn, msg), [path]))` |
| Parse (throws) | `schema.parse(data)` | `v.parse(schema, data)` |
| Safe parse | `schema.safeParse(data)` | `v.safeParse(schema, data)` |
| Infer output type | `z.infer<typeof schema>` | `v.InferOutput<typeof schema>` |
| Infer input type | `z.input<typeof schema>` | `v.InferInput<typeof schema>` |
| Partial | `schema.partial()` | `v.partial(schema)` |
| Pick | `schema.pick({ a: true })` | `v.pick(schema, ['a'])` |
| Omit | `schema.omit({ a: true })` | `v.omit(schema, ['a'])` |
| Merge | `schema.merge(other)` | `v.merge([schema, other])` |
| Discriminated union | `z.discriminatedUnion('type', [...])` | `v.variant('type', [...])` |
| Union | `z.union([a, b])` | `v.union([a, b])` |
| Intersection | `z.intersection(a, b)` | `v.intersect([a, b])` |
| Lazy (recursive) | `z.lazy(() => schema)` | `v.lazy(() => schema)` |
| Record | `z.record(z.string())` | `v.record(v.string(), v.string())` |
| Tuple | `z.tuple([z.string()])` | `v.tuple([v.string()])` |
| Coerce | `z.coerce.number()` | `v.pipe(v.unknown(), v.transform(Number))` |
| Flatten errors | `error.flatten()` | `v.flatten(issues)` |
| Brand | `z.string().brand<'UserId'>()` | `v.pipe(v.string(), v.brand('UserId'))` |

### Key Migration Patterns

The biggest mental shift when migrating is converting method chains to pipes. Here is the mechanical process:

```ts
// Step 1: Identify the Zod chain
z.string().trim().min(3).max(50).email()

// Step 2: Convert to pipe — base schema first, then validators/actions in order
v.pipe(v.string(), v.trim(), v.minLength(3), v.maxLength(50), v.email())

// Step 3: For objects, the structure is nearly identical
z.object({ name: z.string() })
v.object({ name: v.string() })

// Step 4: For .refine(), wrap the whole pipe with v.forward(v.check())
// Zod:
schema.refine(fn, { message: 'msg', path: ['field'] })
// Valibot:
v.pipe(schema, v.forward(v.check(fn, 'msg'), ['field']))

// Step 5: For .optional() and .nullable(), wrap instead of chain
// Zod:
z.string().optional()
// Valibot:
v.optional(v.string())
```

## When to Choose Valibot vs Zod

Neither library is universally better. The choice depends on your specific constraints:

### Choose Zod When

- **Ecosystem support is critical.** Libraries like tRPC, react-hook-form (via `@hookform/resolvers`), and many SvelteKit community tools have first-class Zod adapters. Valibot support is growing but not as comprehensive.
- **Team familiarity matters.** Zod's method-chaining API is more familiar to developers coming from jQuery, Mongoose, or Joi. The learning curve is lower for most teams.
- **Bundle size is irrelevant.** If your validation only runs on the server (SvelteKit form actions, API routes), the 13KB never reaches the browser. There is no benefit to tree-shaking code that is not bundled for the client.
- **You want the largest community.** Zod has more Stack Overflow answers, more blog posts, more tutorials, and more edge cases documented. When you hit a weird issue, you are more likely to find someone who has solved it.

### Choose Valibot When

- **Bundle size is a priority.** Client-side form validation, SPAs, mobile web, or any context where you are aggressively optimizing bundle size. The 1-3KB vs 13KB difference is significant for Core Web Vitals.
- **You share schemas between client and server.** This is the common SvelteKit pattern: define a schema in `$lib/schemas/`, import it in both the form action and the component. With Valibot, the client only pays for the validators it actually uses.
- **You are building a library.** If you author an npm package that depends on a validation library, Valibot's tree-shakability means your users only pay for the subset you use — not the entire library.
- **You prefer functional composition.** If your team is comfortable with `pipe()` and `compose()` patterns (common in functional programming, RxJS, or Ramda), Valibot's API will feel natural.

### The Decision Framework

```
Is validation purely server-side?
├─ Yes → Use Zod (bundle size irrelevant, better ecosystem)
└─ No → Does the project have strict bundle budgets?
         ├─ Yes → Use Valibot
         └─ No → Do you need tRPC/react-hook-form/other Zod-only integrations?
                  ├─ Yes → Use Zod
                  └─ No → Either works. Choose based on team preference.
```

In practice, both libraries are excellent. Zod dominates in ecosystem and community. Valibot wins on bundle efficiency. For SvelteKit projects that share schemas between client and server, Valibot is often the better fit because of SvelteKit's emphasis on progressive enhancement and minimal client-side JavaScript.

## Try It Exercises

### Exercise 1: Product Catalog Schema

Build a product catalog validation schema in Valibot:

1. Create a `ProductSchema` with: `id` (UUID string), `name` (3-200 characters, trimmed), `description` (optional, max 2000 characters), `price` (positive number with at most 2 decimal places — use `v.check()` to verify `price === Math.round(price * 100) / 100`), `currency` (picklist of `'USD'`, `'EUR'`, `'GBP'`), `tags` (array of 1-10 non-empty strings), and `status` (picklist of `'draft'`, `'active'`, `'archived'`).

2. Create a `ProductFilterSchema` for query parameters: `minPrice` (optional number, >= 0), `maxPrice` (optional number), `status` (optional picklist), `search` (optional trimmed string). Add a cross-field check that `maxPrice` must be greater than `minPrice` when both are present.

3. Infer both input and output types. Parse a valid product and a valid filter. Deliberately pass invalid data and use `v.flatten()` to get a field error map.

### Exercise 2: Migrate a Zod Schema

Take this Zod schema and rewrite it in Valibot. Verify that both produce the same output types and accept/reject the same inputs:

```ts
import { z } from 'zod';

const EventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('concert'),
    artist: z.string().min(1),
    venue: z.string().min(1),
    date: z.string().datetime(),
    ticketPrice: z.number().positive(),
    capacity: z.number().int().min(1)
  }),
  z.object({
    type: z.literal('conference'),
    name: z.string().min(1),
    topics: z.array(z.string()).min(1),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    isVirtual: z.boolean()
  }),
  z.object({
    type: z.literal('meetup'),
    title: z.string().min(1),
    location: z.string().optional(),
    date: z.string().datetime(),
    maxAttendees: z.number().int().positive().optional()
  })
]);
```

### Exercise 3: Recursive Schema with Error Handling

Build a schema for a nested category tree (like a website navigation or product category hierarchy):

1. Each category has: `id` (positive integer), `name` (1-100 characters), `slug` (lowercase alphanumeric with hyphens, validated via regex), and `children` (an array of categories, recursive with `v.lazy()`).

2. Write a function `validateCategoryTree(data: unknown)` that returns either the parsed tree or a flat error map showing every invalid field path (e.g., `children.0.children.2.slug: "Invalid slug format"`).

3. Test with a three-level-deep category tree that has intentional errors at different levels. Verify that the error paths correctly identify the location of each problem.

## Key Takeaways

- **Valibot exists to solve Zod's bundle size problem** — Zod ships ~13KB regardless of usage, Valibot tree-shakes to 1-3KB for typical schemas, because every function is an independent import
- **The pipe-based API is the key architectural difference** — `v.pipe(v.string(), v.minLength(3), v.email())` uses functional composition instead of method chaining, which is what enables dead-code elimination
- **`v.parse()` and `v.safeParse()` are standalone functions**, not methods on the schema — `v.parse(schema, data)` instead of `schema.parse(data)`
- **`v.InferInput` and `v.InferOutput` distinguish pre- and post-transform types** — essential when transforms change the shape (e.g., string input to number output)
- **Use `v.pipe()` for all validation chains** — base schema first, then validators and actions in logical order (clean before validate, validate before transform)
- **Use `v.variant()` for discriminated unions** instead of `v.union()` — it is faster and produces better error messages by checking the discriminant field first
- **`v.flatten()` converts issues into a field error map** — the most practical way to display validation errors in forms
- **`v.forward()` routes cross-field errors to specific fields** — the Valibot equivalent of Zod's `.refine({ path: [...] })`
- **`v.fallback()` provides defaults on parse failure**, while `v.optional()` with a second argument provides defaults only for `undefined` values — know the difference
- **`v.brand()` creates nominal types at zero runtime cost** — prevents mixing structurally identical but semantically different values like UserId and PostId
- **Neither library is universally better** — use Zod when ecosystem support and team familiarity matter most, use Valibot when bundle size and tree-shaking matter most
- **In SvelteKit, Valibot often wins** because shared client/server schemas mean the validation library ships to the browser, where Valibot's smaller footprint matters
