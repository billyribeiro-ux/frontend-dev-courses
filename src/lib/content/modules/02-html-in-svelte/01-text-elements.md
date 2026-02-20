# Text Elements

The most fundamental part of any web page is text. Before you worry about colors, layouts, or animations, you need to know how to put words on the screen. HTML gives you a set of **elements** (also called "tags") specifically designed for different types of text.

In Svelte, you write HTML directly in your `.svelte` file — no extra setup needed. Everything you learn about HTML elements here works inside any Svelte component.

## Headings

HTML has six heading levels, from `<h1>` (the biggest and most important) to `<h6>` (the smallest). Think of them like a book outline — `<h1>` is the title, `<h2>` is a chapter, and so on.

```svelte
<h1>My Website</h1>
<h2>About Me</h2>
<h3>My Hobbies</h3>
<h4>Indoor Hobbies</h4>
<h5>Board Games</h5>
<h6>Chess Strategies</h6>
```

A good rule of thumb: every page should have exactly one `<h1>`, and you should not skip levels (don't jump from `<h2>` to `<h5>`).

## Paragraphs and Line Breaks

The `<p>` tag creates a paragraph — a block of text with automatic spacing above and below. If you need to force a line break inside a paragraph, use the `<br>` tag.

```svelte
<p>This is my first paragraph. It can be as long as you want.</p>

<p>
  This is another paragraph.<br>
  This line appears right below, without starting a new paragraph.
</p>
```

## Emphasis and Strong Text

To make text **bold** or *italic*, use `<strong>` and `<em>`:

```svelte
<p>
  This word is <strong>bold</strong> and this word is <em>italic</em>.
  You can even <strong><em>combine them</em></strong> for bold italic text.
</p>
```

- `<strong>` means the text is important — browsers display it in **bold**
- `<em>` means the text is emphasized — browsers display it in *italic*

## Other Useful Text Tags

HTML has a few more handy text elements worth knowing:

```svelte
<p>Use <mark>the mark tag</mark> to highlight text.</p>
<p>This is <small>smaller text</small> for fine print.</p>
<p>This is <del>deleted text</del> and this is <ins>inserted text</ins>.</p>
<p>Water is H<sub>2</sub>O and 10<sup>3</sup> is 1000.</p>
```

## Putting It All Together

Here is a simple "About Me" component using everything we have learned:

```svelte
<h1>About Me</h1>

<h2>Who I Am</h2>
<p>
  My name is <strong>Alex</strong> and I am learning
  <em>web development</em> with Svelte!
</p>

<h2>What I Am Building</h2>
<p>
  I am working on my <mark>first project</mark> — a personal portfolio site.<br>
  It is going to be awesome.
</p>
```

## Try It

Create an "About Me" Svelte component with:
- An `<h1>` with your name
- An `<h2>` section about your hobbies
- At least two paragraphs using `<p>` tags
- Use `<strong>` and `<em>` to emphasize key words

## Key Takeaways

- HTML headings go from `<h1>` (largest) to `<h6>` (smallest) — use them in order
- `<p>` creates paragraphs, `<br>` forces a line break
- `<strong>` makes text bold (important), `<em>` makes text italic (emphasis)
- Tags like `<mark>`, `<small>`, `<sub>`, and `<sup>` add extra formatting
- All HTML elements work directly inside a `.svelte` file
