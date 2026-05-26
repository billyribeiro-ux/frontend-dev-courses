# What is a Web Page?

Every website you have ever visited — Google, YouTube, Amazon, your bank, that recipe blog with too many ads — is built from the same three materials:

1. **HTML** — The structure (the skeleton, the bones of the page)
2. **CSS** — The presentation (the skin, the colors, the layout)
3. **JavaScript** — The behavior (the muscles, the reactions, the interactivity)

That is it. Three languages. Every single website. The fanciest web application you have ever used is, at the end of the day, HTML elements styled with CSS and wired up with JavaScript. Understanding this is your first superpower, because it means nothing on the web is magic — it is all built from parts you can learn.

## What Actually Happens When You Type a URL

Let's trace what happens when you type `https://example.com` and press Enter. This is worth understanding because every problem you will ever debug on the web lives somewhere in this chain.

### Step 1: DNS Lookup — Finding the Address

Your browser does not know what `example.com` means. It needs an actual address — an IP address like `93.184.216.34`. So it asks a **DNS server** (think of it as the internet's phone book): "Hey, what is the address for `example.com`?"

The DNS server responds with the IP address, and now your browser knows which computer to talk to.

> **Mental model:** Domain names are for humans. IP addresses are for computers. DNS translates between the two.

### Step 2: TCP Connection — Establishing a Line

Your browser opens a connection to the server at that IP address. This uses a protocol called **TCP**, which is just an agreement about how two computers will exchange data reliably. Think of it like a phone call — before you can talk, someone has to pick up.

If the URL starts with `https://` (and it should), there is an extra step here called a **TLS handshake** where your browser and the server agree on how to encrypt everything. This is why you see the little lock icon in your address bar.

### Step 3: HTTP Request — Asking for the Page

Now your browser sends an **HTTP request**. This is surprisingly simple. It looks something like this:

```
GET /index.html HTTP/1.1
Host: example.com
```

That is it. "GET me the file at `/index.html` from the host `example.com`." HTTP is just a structured way to ask for things and get responses back.

### Step 4: Server Response — Getting the Goods

The server is just a program — running on someone else's computer — that listens for these requests and sends back responses. It might read a file from disk, or query a database, or run some code to generate the HTML on the fly. Either way, it sends back something like:

```
HTTP/1.1 200 OK
Content-Type: text/html

<!DOCTYPE html>
<html>
  <head>
    <title>Example</title>
    <link rel="stylesheet" href="/style.css">
  </head>
  <body>
    <h1>Hello, World!</h1>
    <script src="/app.js"></script>
  </body>
</html>
```

That `200 OK` means "here you go, everything went fine." You have probably seen `404 Not Found` — that is the server saying "I don't have what you're asking for."

> **Key insight:** A server is not mysterious. It is just a program that listens on a port, receives requests, and sends responses. When you run SvelteKit in development mode, *your computer* is the server.

### Step 5: Parsing and Rendering — Building What You See

This is where the real magic happens. Your browser receives that HTML and:

1. **Parses the HTML** into a tree structure called the **DOM** (Document Object Model)
2. **Discovers** the `<link>` and `<script>` tags, then sends more HTTP requests to fetch `style.css` and `app.js`
3. **Parses the CSS** and figures out which styles apply to which elements
4. **Combines the DOM and CSS** into a "render tree" — the actual visual representation
5. **Calculates layout** — where does each element go on screen? How big is it?
6. **Paints pixels** to your screen

This all happens in milliseconds. Every time. It is extraordinary engineering.

## HTML: The Tree You Need to See

Here is the most important mental model in this entire course: **HTML is a tree**.

```html
<html>
  <body>
    <div class="card">
      <h1>Welcome</h1>
      <p>This is a paragraph.</p>
    </div>
    <div class="footer">
      <p>Copyright 2026</p>
    </div>
  </body>
</html>
```

If you squint at the indentation, you can see the tree:

```
html
└── body
    ├── div.card
    │   ├── h1
    │   └── p
    └── div.footer
        └── p
```

Every HTML element is a **node** in this tree. Every node has a parent (except `<html>`, which is the root). Nodes can have children. This tree — the DOM — is the data structure your browser actually works with.

Why does this matter? Because:
- **CSS** targets nodes in this tree (and uses the tree structure to resolve conflicts)
- **JavaScript** reads and modifies this tree to change what you see
- **Svelte components** compile down to efficient code that manipulates this tree
- **Accessibility tools** (screen readers) navigate this tree to describe your page to users

Every framework you will ever use — Svelte, React, Vue, Angular — is ultimately a fancy way to build and update this tree. The closer your mental model is to the tree, the fewer bugs you will write.

## CSS: Styling the Tree

CSS is a separate language that **targets nodes in the DOM tree** and applies visual properties to them.

```css
h1 {
  color: #ff3e00;
  font-size: 2rem;
}

.card {
  padding: 24px;
  border-radius: 8px;
  background: white;
}
```

The first rule says: "Find every `<h1>` node in the tree and make it orange and large." The second says: "Find every node with the class `card` and give it padding, rounded corners, and a white background."

The word **cascade** in "Cascading Style Sheets" refers to the set of rules that determine which style wins when multiple rules target the same element. The specificity system can be confusing at first, but the core idea is simple: more specific selectors override less specific ones, and later rules override earlier ones.

> **Why this matters for Svelte:** Svelte automatically scopes your CSS to the component. That means styles you write in one component cannot accidentally break another component. This eliminates an entire category of bugs that has plagued web development for decades. But understanding the cascade still matters — it is how the browser resolves conflicts within your component.

## JavaScript: Behavior and Interactivity

HTML gives you structure. CSS gives you presentation. JavaScript gives you **behavior** — the ability to respond to user actions, fetch data, update the page, and make your application feel alive.

```html
<button id="counter">Clicked 0 times</button>

<script>
  let count = 0;
  const button = document.getElementById('counter');

  button.addEventListener('click', () => {
    count += 1;
    button.textContent = `Clicked ${count} times`;
  });
</script>
```

This is **vanilla JavaScript** — no framework, no library. You manually find the element in the DOM, manually attach an event listener, and manually update the text. It works, but notice the problem: you have to keep the DOM in sync with your data (`count`) by hand. For a single button, that is fine. For a full application with hundreds of interactive elements, it becomes a nightmare.

This is the exact problem frameworks solve.

## Why Frameworks Exist (and Why Svelte is Different)

Frameworks like React, Vue, and Svelte all exist to solve the same core problem: **keeping the UI in sync with your data without manually manipulating the DOM.**

Here is how the same counter looks in Svelte:

```svelte
<script>
  let count = $state(0);
</script>

<button onclick={() => count++}>
  Clicked {count} times
</button>
```

No `getElementById`. No `addEventListener`. No manual text updates. You just declare that the button should display `count`, and Svelte keeps it in sync. When `count` changes, the button text updates automatically.

But here is what makes Svelte different from React and Vue: **Svelte is a compiler.** React ships a runtime library to your user's browser that does the work of syncing the DOM at runtime (using a "virtual DOM"). Svelte does that work at **build time** — it reads your `.svelte` file and generates tiny, efficient vanilla JavaScript that updates only the exact DOM nodes that need to change. No virtual DOM. No runtime diffing. Just surgical updates.

> **Mental model:** React is like hiring a translator who sits in the room during every conversation. Svelte is like translating the document ahead of time so nobody needs a translator at runtime.

The result? Smaller bundles, faster updates, less memory usage. But for you, as a developer, the experience is almost the same — you write declarative UI code and the framework handles the DOM.

## From "Pages" to "Apps"

The early web was simple: you clicked a link, the browser requested a new HTML page from the server, and the whole screen refreshed. Every page was independent. This is called a **Multi-Page Application (MPA)**.

Then developers realized you could use JavaScript to update the page *without* a full reload. Click a navigation link, and JavaScript fetches new data and swaps out part of the page. This is a **Single-Page Application (SPA)**, and it is what made the web feel as fast and responsive as a native app.

But SPAs have downsides: the first load is slow (you have to download all the JavaScript before you see anything), search engines have trouble indexing them, and you lose the simplicity of plain links and forms.

**SvelteKit bridges both worlds.** It gives you:
- **Server-side rendering (SSR):** The first page load is real HTML, rendered on the server — fast and SEO-friendly
- **Client-side navigation:** After the first load, clicking links feels instant because SvelteKit handles them with JavaScript
- **The simplicity of pages AND the power of apps**

You do not need to understand all of this right now. Just know that SvelteKit is designed so you get the best of both approaches without having to choose.

## All Three Layers Together

Here is a simple but complete example showing HTML, CSS, and JavaScript working together in Svelte:

```svelte
<script>
  let name = $state('World');
  let color = $state('#ff3e00');
</script>

<div class="greeting">
  <h1>Hello, {name}!</h1>
  <label>
    Your name:
    <input type="text" bind:value={name} />
  </label>
  <label>
    Pick a color:
    <input type="color" bind:value={color} />
  </label>
</div>

<style>
  .greeting {
    max-width: 400px;
    padding: 32px;
    border-radius: 12px;
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    font-family: system-ui, sans-serif;
  }

  h1 {
    color: var(--accent, #ff3e00);
    margin: 0 0 16px;
  }

  label {
    display: block;
    margin-top: 12px;
    color: #555;
  }

  input[type="text"] {
    width: 100%;
    padding: 8px;
    margin-top: 4px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 1rem;
  }
</style>
```

Notice what is happening:
- **HTML** defines the structure — a div containing a heading, a text input, and a color input
- **CSS** styles everything — scoped to this component so it cannot leak elsewhere
- **JavaScript** holds the data (`name` and `color`) and Svelte keeps the DOM in sync automatically

Type in the text input and the heading updates instantly. No `getElementById`. No manual DOM manipulation. Svelte compiled all of that away for you.

## Why This All Matters

You might be thinking: "If Svelte handles all the DOM manipulation, why do I need to understand HTML, CSS, and the browser?"

Because **the abstraction is not the reality.** Svelte generates HTML, CSS, and JavaScript. When something goes wrong — and it will — you need to understand what is actually happening underneath. When your layout breaks, you need to think in CSS. When performance is slow, you need to understand how the browser renders. When your app does not load, you need to understand HTTP requests.

The best framework developers are the ones who understand the platform the framework runs on. That is what this course is building from the beginning.

## Key Takeaways

- When you visit a URL, your browser does a DNS lookup, opens a TCP connection, sends an HTTP request, and receives HTML/CSS/JS in response
- A server is just a program that listens for requests and sends responses — nothing more
- HTML is a tree (the DOM), and everything in web development — CSS, JavaScript, accessibility, frameworks — operates on that tree
- CSS targets nodes in the tree and applies styles, with the cascade resolving conflicts
- JavaScript adds behavior, but manually keeping the DOM in sync with your data does not scale
- Svelte is a compiler that generates efficient vanilla JS at build time — no virtual DOM, no heavy runtime
- SvelteKit gives you server-rendered pages with client-side app behavior — the best of both worlds
- Understanding the underlying platform makes you a better framework developer, not a slower one

## Try It

1. **Trace a request:** Open your browser's developer tools (F12 or Cmd+Shift+I), go to the **Network** tab, and visit any website. Watch the requests fly by. Find the initial HTML request. Click on it and read the response headers. You are seeing exactly the process we described above.

2. **Inspect the tree:** On any webpage, right-click an element and choose "Inspect." You are looking at the DOM tree. Expand and collapse nodes. Notice the parent-child relationships. Click on different elements and look at the styles panel on the right — you are seeing which CSS rules target that node and how the cascade resolved conflicts.

3. **Modify the example:** Take the Svelte greeting example above and add a third input that controls the font size of the heading. You will need a new `$state` variable, a new `<input>`, and an inline `style` attribute on the `<h1>`. If you get stuck, that is normal — figuring it out is where the learning happens.
