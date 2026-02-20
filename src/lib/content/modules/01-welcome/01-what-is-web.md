# What is a Web Page?

Every website you've ever visited — Google, YouTube, Amazon — is made of three things:

1. **HTML** — The structure (like the skeleton of a building)
2. **CSS** — The style (like paint, furniture, and decorations)
3. **JavaScript** — The behavior (like electricity and plumbing that make things work)

## How Does It Work?

When you type a URL into your browser and press Enter:

1. Your browser sends a request to a server (a computer that stores the website)
2. The server sends back HTML, CSS, and JavaScript files
3. Your browser reads those files and displays the page

That's it! Every website works this way.

## What is Svelte?

**Svelte** is a tool that makes writing HTML, CSS, and JavaScript much easier and more organized. Instead of writing these three languages in separate files, Svelte lets you write them all in one `.svelte` file.

Here's what a Svelte component looks like:

```svelte
<script>
  let name = "World";
</script>

<h1>Hello, {name}!</h1>

<style>
  h1 {
    color: #ff3e00;
  }
</style>
```

See how clean that is? The `<script>` tag is for JavaScript, the HTML goes in the middle, and the `<style>` tag is for CSS. All in one file!

## Why Svelte?

Most coding courses teach you JavaScript first, then make you re-learn everything when you switch to a framework. We're different:

- **Everything you learn is immediately useful** — no abstract exercises
- **One file, three languages** — less confusion, more building
- **The fastest framework** — Svelte produces tiny, fast websites

## Your First Exercise

In the editor below, change the text inside the `<h1>` tag to say your name. Then see the result in the preview!

## Key Takeaways

- Web pages are made of HTML (structure), CSS (style), and JavaScript (behavior)
- Browsers request files from servers and display them
- Svelte lets you write all three in one `.svelte` file
- You don't need to learn JavaScript separately — we'll learn it inside Svelte
