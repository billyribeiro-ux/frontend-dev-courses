# Custom Transitions

Svelte's built-in transitions cover the most common animations, but every project eventually needs something unique — a typewriter effect for text, a circular reveal for images, a flip-card rotation for a quiz app, or a staggered wipe for a gallery. Svelte lets you build custom transitions that plug into the same `transition:`, `in:`, and `out:` system you already know. You also get access to `crossfade` for morphing elements between positions (the FLIP technique applied at the framework level), deferred transitions for coordinating cross-component animations, and transition events for orchestrating complex sequences.

This lesson teaches you to write your own CSS and JavaScript transitions from scratch, understand the full transition contract, animate SVG paths with `draw`, pair elements with `crossfade` using `send` and `receive`, and react to transition lifecycle events. By the end you will have built a typewriter, a flip-card, a circular-reveal, and a text-scramble transition, and you will understand the performance implications of every design decision.

## The Transition Contract

Every custom transition is a function with this signature:

```typescript
function myTransition(
  node: HTMLElement,
  params: Record<string, any>,
  options: { direction: 'in' | 'out' | 'both' }
): {
  delay?: number;
  duration?: number;
  easing?: (t: number) => number;
  css?: (t: number, u: number) => string;
  tick?: (t: number, u: number) => void;
}
```

The function receives three arguments:

1. **`node`** — the actual DOM element. You can read its dimensions with `getBoundingClientRect()`, its computed styles with `getComputedStyle(node)`, its text content, its child count — anything you need to calculate the animation.
2. **`params`** — whatever the template passes: `transition:myTransition={{ duration: 400, color: 'red' }}` means `params` is `{ duration: 400, color: 'red' }`.
3. **`options`** — contains a `direction` field: `'in'` when used as `in:`, `'out'` when used as `out:`, or `'both'` when used as `transition:`. This lets a single function behave differently for intros vs outros.

The returned object describes the animation:

| Property | Type | Purpose |
|----------|------|---------|
| `delay` | `number` | Milliseconds before the animation starts |
| `duration` | `number` | Total animation length in ms |
| `easing` | `(t: number) => number` | Easing function (from `svelte/easing` or custom) |
| `css` | `(t, u) => string` | Returns a CSS string applied at each keyframe — runs on the compositor |
| `tick` | `(t, u) => void` | Called on every animation frame — runs on the main thread |

The `t` parameter goes from 0 to 1 during intro and from 1 to 0 during outro. The `u` parameter is always `1 - t` — it saves you from writing `1 - t` repeatedly in your animation math. During intro: `t` starts at 0 (invisible) and ends at 1 (fully visible). During outro: `t` starts at 1 (fully visible) and ends at 0 (invisible).

### The `t` and `u` Mental Model

Visualizing `t` and `u` during an intro animation:

```
Time:  0%   25%   50%   75%   100%
t:     0    0.25  0.50  0.75  1.0
u:     1    0.75  0.50  0.25  0.0

During outro, t goes 1→0, u goes 0→1.

t = "how visible the element is"
u = "how invisible the element is"
```

Use `t` for properties that should increase (opacity, scale). Use `u` for properties that should decrease (blur, offset, displacement). This mental model makes your animation math intuitive: `opacity: ${t}` means "fully visible when done," and `translateY(${u * 30}px)` means "30px offset at start, 0px when done."

### Why Two Callback Types? CSS vs Tick

This is the most important performance decision you will make when writing custom transitions.

**`css` transitions** work by generating CSS `@keyframes` at the start of the animation. Svelte samples your `css` function at multiple points, builds a keyframe animation, injects it into a `<style>` tag, and applies it to the element. The browser's compositor thread runs the animation. The main JavaScript thread is free to handle user input, run other code, or idle. CSS transitions can animate `transform`, `opacity`, `filter`, and `clip-path` without triggering layout or paint.

**`tick` transitions** call your function on every single animation frame (approximately 60 times per second). Your code runs on the main JavaScript thread. If your tick function is slow, the entire page janks. If another script is busy, your animation stutters. Use `tick` only when you need imperative DOM manipulation that CSS cannot express — canvas rendering, WebGL, manipulating `textContent`, or driving third-party animation libraries.

```
CSS path:
  1. Svelte calls css(0), css(0.1), ..., css(1) → builds @keyframes
  2. Browser compositor runs keyframes on GPU
  3. Main thread is FREE

Tick path:
  1. requestAnimationFrame fires
  2. Svelte calls tick(currentT) on main thread
  3. Your code mutates the DOM
  4. Browser repaints
  5. Repeat 60 times per second
```

Rule of thumb: if you can express your animation with CSS properties, always use `css`. Only reach for `tick` when CSS genuinely cannot do what you need.

### Which CSS Properties Are Compositor-Friendly?

Not all CSS properties are equal for animation performance:

```
COMPOSITOR (GPU, smooth, use these):
  ✓ transform (translate, scale, rotate, skew)
  ✓ opacity
  ✓ filter (blur, brightness, contrast, etc.)
  ✓ clip-path

PAINT (CPU, moderate cost):
  ⚠ background-color
  ⚠ color
  ⚠ box-shadow
  ⚠ border-color

LAYOUT (CPU, expensive, avoid animating):
  ✗ width, height
  ✗ padding, margin
  ✗ top, left, right, bottom
  ✗ font-size
  ✗ border-width
```

When writing a CSS transition function, stick to compositor-friendly properties whenever possible. Instead of animating `width`, animate `transform: scaleX()`. Instead of animating `top`, animate `transform: translateY()`.

## Custom CSS Transitions

A custom transition is a function that returns an object describing the animation. For CSS transitions, you provide a `css` function that receives `t` (a value from 0 to 1) and `u` (which is `1 - t`) and returns a CSS string:

```svelte
<script>
  function whoosh(node, { duration = 400, direction = "left" }) {
    const xOffset = direction === "left" ? -100 : 100;

    return {
      duration,
      css: (t) => `
        transform: translateX(${(1 - t) * xOffset}px) scale(${0.5 + t * 0.5});
        opacity: ${t};
      `
    };
  }

  let show = $state(true);
</script>

<button onclick={() => show = !show}>Toggle</button>

{#if show}
  <div transition:whoosh={{ duration: 500, direction: "left" }}>
    <p>I whoosh in from the left!</p>
  </div>
{/if}
```

The function reads `node` if needed (for measuring dimensions), destructures parameters from the template, and returns the animation descriptor. Svelte generates CSS keyframes from the `css` function and applies them to the element.

### Reading the Node for Dynamic Animations

One of the most powerful aspects of custom transitions is access to the actual DOM element. You can measure it, inspect its styles, and adapt the animation accordingly:

```svelte
<script>
  function expandFromCenter(node, { duration = 500 }) {
    const { width, height } = node.getBoundingClientRect();
    const computedStyle = getComputedStyle(node);
    const existingTransform = computedStyle.transform;

    return {
      duration,
      css: (t, u) => `
        transform: scale(${t});
        opacity: ${t};
        clip-path: inset(${u * 50}% ${u * 50}% ${u * 50}% ${u * 50}%);
      `
    };
  }

  let show = $state(true);
</script>

<button onclick={() => show = !show}>Toggle</button>

{#if show}
  <div class="card" transition:expandFromCenter={{ duration: 600 }}>
    <h3>Dynamic Card</h3>
    <p>This card expands from its center point.</p>
  </div>
{/if}

<style>
  .card {
    padding: 24px;
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    border-radius: 12px;
    max-width: 400px;
  }
</style>
```

### Adapting to Element Content

A truly dynamic transition adapts to whatever element it is applied to:

```svelte
<script>
  function adaptiveSlide(node, { duration = 500 }) {
    const rect = node.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    // Determine which side the element is closer to
    const centerX = rect.left + rect.width / 2;
    const slideFromRight = centerX > viewportWidth / 2;

    // Calculate distance to edge of viewport
    const distance = slideFromRight
      ? viewportWidth - rect.left
      : rect.right;

    return {
      duration,
      css: (t, u) => `
        transform: translateX(${u * (slideFromRight ? distance : -distance)}px);
        opacity: ${t};
      `
    };
  }

  let show = $state(true);
</script>

<button onclick={() => show = !show}>Toggle</button>

{#if show}
  <div class="left-card" transition:adaptiveSlide>
    <p>I slide from the left (because I am on the left side of the viewport).</p>
  </div>
  <div class="right-card" transition:adaptiveSlide>
    <p>I slide from the right (because I am on the right side).</p>
  </div>
{/if}

<style>
  .left-card, .right-card {
    padding: 24px;
    margin: 8px;
    border-radius: 12px;
    max-width: 300px;
  }
  .left-card { background: #dbeafe; }
  .right-card { background: #fef3c7; margin-left: auto; }
</style>
```

### Using the `u` Parameter

The `u` parameter (`1 - t`) is a convenience that eliminates arithmetic in your CSS function. Compare:

```typescript
// Without u — repetitive
css: (t) => `
  opacity: ${t};
  transform: translateY(${(1 - t) * 30}px) rotate(${(1 - t) * 15}deg);
  filter: blur(${(1 - t) * 4}px);
`

// With u — cleaner
css: (t, u) => `
  opacity: ${t};
  transform: translateY(${u * 30}px) rotate(${u * 15}deg);
  filter: blur(${u * 4}px);
`
```

Both produce identical results, but `u` makes the code easier to read and reason about.

### Passing Custom Easing

Your transition can accept an `easing` parameter and pass it through. Or you can hardcode an easing function for a specific feel:

```svelte
<script>
  import { elasticOut, bounceOut } from "svelte/easing";

  function popIn(node, { duration = 500, easing = elasticOut }) {
    return {
      duration,
      easing,
      css: (t) => `
        transform: scale(${t});
        opacity: ${t};
      `
    };
  }

  let show = $state(true);
</script>

<button onclick={() => show = !show}>Toggle</button>

{#if show}
  <div class="box" transition:popIn={{ duration: 800, easing: bounceOut }}>
    <p>I pop in with a bounce!</p>
  </div>
{/if}

<style>
  .box {
    padding: 24px;
    background: #fef3c7;
    border-radius: 12px;
    text-align: center;
  }
</style>
```

When you supply an `easing` function in the returned object, Svelte applies it to `t` before passing it to your `css` or `tick` function. This means your function always receives a value between 0 and 1, but the progression is shaped by the easing curve — elastic, bounce, cubic, or any custom function you write.

### Writing a Custom Easing Function

Easing functions take a number from 0 to 1 and return a number (usually also 0 to 1, but overshooting is fine for bounce/elastic effects):

```typescript
// Linear — no easing
const linear = (t) => t;

// Ease-in quadratic — slow start
const easeInQuad = (t) => t * t;

// Ease-out quadratic — slow end
const easeOutQuad = (t) => t * (2 - t);

// Custom: overshoot then settle
const overshoot = (t) => {
  const s = 1.70158;
  return t * t * ((s + 1) * t - s);
};

// Custom: steps (like a clock ticking)
const steps = (n) => (t) => Math.floor(t * n) / n;
```

Use these with any transition:

```svelte
<div transition:popIn={{ duration: 600, easing: steps(8) }}>
  I appear in 8 discrete steps
</div>
```

### Direction-Aware Transitions

The `options.direction` parameter lets a single transition function behave differently for `in:`, `out:`, and `transition:`:

```svelte
<script>
  function directional(node, params, { direction }) {
    const { duration = 400 } = params;

    if (direction === 'in') {
      // Intro: slide down and fade in
      return {
        duration,
        css: (t, u) => `
          transform: translateY(${-u * 20}px);
          opacity: ${t};
        `
      };
    } else {
      // Outro: scale down and fade out
      return {
        duration: duration * 0.6,  // Outros are faster
        css: (t) => `
          transform: scale(${0.8 + t * 0.2});
          opacity: ${t};
        `
      };
    }
  }

  let show = $state(true);
</script>

{#if show}
  <div transition:directional={{ duration: 500 }}>
    Slides in from above, scales out when leaving.
  </div>
{/if}
```

This is useful when the intro and outro should feel distinctly different — the intro draws attention (slower, more dramatic), while the outro gets out of the way (faster, subtler).

## Example: Typewriter Transition

A typewriter effect reveals text character by character. This uses `clip-path` to progressively reveal content. The key insight is computing the duration from the text length, so longer strings take proportionally longer:

```svelte
<script>
  function typewriter(node, { speed = 30 }) {
    const text = node.textContent;
    const duration = text.length * speed;

    return {
      duration,
      css: (t) => {
        const chars = Math.floor(text.length * t);
        return `
          clip-path: inset(0 ${100 - (chars / text.length) * 100}% 0 0);
        `;
      }
    };
  }

  let show = $state(true);
</script>

<button onclick={() => show = !show}>Toggle</button>

{#if show}
  <p transition:typewriter={{ speed: 40 }}>
    Welcome to Svelte transitions! This text appears one character at a time.
  </p>
{/if}

<style>
  p {
    font-family: monospace;
    font-size: 1.2rem;
    white-space: nowrap;
  }
</style>
```

The `speed` parameter controls milliseconds per character. Svelte generates the CSS keyframes and runs the animation on the compositor thread for smooth performance.

**Limitation**: The `clip-path` approach works visually but does not actually add characters one by one — it reveals a pre-rendered block of text. For a true character-by-character effect where text reflows, you need a `tick`-based transition:

```svelte
<script>
  function typewriterTick(node, { speed = 30 }) {
    const text = node.textContent;
    const duration = text.length * speed;

    return {
      duration,
      tick: (t) => {
        const charCount = Math.floor(text.length * t);
        node.textContent = text.slice(0, charCount);
      }
    };
  }

  let show = $state(true);
</script>

<button onclick={() => show = !show}>Toggle</button>

{#if show}
  <p transition:typewriterTick={{ speed: 50 }}>
    Each character appears individually, with real text reflow.
  </p>
{/if}
```

This version mutates `textContent` on every frame. It is more authentic but runs on the main thread. For short strings (under 200 characters), the performance difference is negligible. For long paragraphs, prefer the CSS clip-path approach.

### WRONG vs CORRECT: Typewriter Performance

```typescript
// WRONG: Manipulating innerHTML in tick (security risk + expensive)
function badTypewriter(node, { speed = 30 }) {
  const html = node.innerHTML;  // Captures HTML tags
  const duration = html.length * speed;

  return {
    duration,
    tick: (t) => {
      const chars = Math.floor(html.length * t);
      node.innerHTML = html.slice(0, chars);  // XSS risk + parser invoked every frame
    }
  };
}

// CORRECT: Use textContent (safe, lightweight)
function goodTypewriter(node, { speed = 30 }) {
  const text = node.textContent;
  const duration = text.length * speed;

  return {
    duration,
    tick: (t) => {
      node.textContent = text.slice(0, Math.floor(text.length * t));
    }
  };
}
```

Never use `innerHTML` in a tick function — it triggers the HTML parser 60 times per second and opens XSS vulnerabilities if the content includes user input.

## Example: Flip-Card Transition

A flip-card rotates an element around the Y-axis, giving a 3D card-flip effect. This requires `perspective` on the parent and `backface-visibility` on the element:

```svelte
<script>
  function flipCard(node, { duration = 600, direction = "horizontal" }) {
    const axis = direction === "horizontal" ? "Y" : "X";

    return {
      duration,
      css: (t, u) => `
        transform: perspective(600px) rotate${axis}(${u * 180}deg);
        opacity: ${t < 0.5 ? t * 2 : 1};
        backface-visibility: hidden;
      `
    };
  }

  let showFront = $state(true);
</script>

<div class="card-container">
  <button onclick={() => showFront = !showFront}>Flip Card</button>

  {#if showFront}
    <div class="card front" transition:flipCard={{ duration: 600 }}>
      <h3>Front Side</h3>
      <p>Click to see the back</p>
    </div>
  {:else}
    <div class="card back" transition:flipCard={{ duration: 600, direction: "horizontal" }}>
      <h3>Back Side</h3>
      <p>Here is the answer!</p>
    </div>
  {/if}
</div>

<style>
  .card-container {
    perspective: 1000px;
    max-width: 300px;
  }

  .card {
    padding: 32px;
    border-radius: 12px;
    text-align: center;
    min-height: 150px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .front {
    background: #dbeafe;
    border: 2px solid #3b82f6;
  }

  .back {
    background: #dcfce7;
    border: 2px solid #16a34a;
  }
</style>
```

The `perspective(600px)` in the transform gives depth to the rotation. Without it, the rotation looks flat. The `backface-visibility: hidden` prevents the element from showing its mirror image at rotation angles past 90 degrees. The opacity trick (`t < 0.5 ? t * 2 : 1`) fades in quickly during the first half of the animation and stays fully opaque for the second half, preventing the element from being invisible at the midpoint.

### Perspective: The Depth Parameter

Perspective controls how "deep" the 3D effect appears:

```
perspective(200px)  — extreme 3D, fisheye-like
perspective(600px)  — natural, moderate depth
perspective(1200px) — subtle, almost flat
perspective(none)   — completely flat (no 3D)
```

Lower values mean more dramatic perspective distortion. For card flips, 600-1000px typically looks best. For subtle rotations (like a button tilt on hover), 1200-2000px is more appropriate.

## Example: Circular Reveal Transition

A circular reveal uses `clip-path: circle()` to expand or contract a circular mask from a point on the element. This is a common effect in material design and video editing:

```svelte
<script>
  function circularReveal(node, {
    duration = 600,
    originX = 50,
    originY = 50,
    easing
  }) {
    // Calculate the maximum radius needed to cover the entire element
    const { width, height } = node.getBoundingClientRect();
    const maxRadius = Math.sqrt(width * width + height * height);

    return {
      duration,
      easing,
      css: (t) => `
        clip-path: circle(${t * maxRadius}px at ${originX}% ${originY}%);
      `
    };
  }

  let show = $state(true);
</script>

<button onclick={() => show = !show}>Toggle</button>

{#if show}
  <div class="reveal-box" transition:circularReveal={{
    duration: 800,
    originX: 0,
    originY: 0
  }}>
    <h3>Circular Reveal</h3>
    <p>This content expands from the top-left corner.</p>
  </div>
{/if}

<style>
  .reveal-box {
    padding: 32px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 12px;
    max-width: 400px;
  }
</style>
```

The key math: `Math.sqrt(width * width + height * height)` computes the diagonal of the element, which is the minimum radius needed for a circle centered at a corner to fully cover the element. When the origin is at the center (50%, 50%), you could use half the diagonal instead, but the full diagonal works universally for any origin point.

### Click-Origin Circular Reveal

A more advanced pattern reveals from wherever the user clicked:

```svelte
<script>
  function circularRevealFromClick(node, { duration = 600, clickX = 50, clickY = 50 }) {
    const rect = node.getBoundingClientRect();

    // Convert click coordinates to percentages relative to the element
    const originX = ((clickX - rect.left) / rect.width) * 100;
    const originY = ((clickY - rect.top) / rect.height) * 100;

    // Max radius must reach the farthest corner from the click point
    const maxDistX = Math.max(clickX - rect.left, rect.right - clickX);
    const maxDistY = Math.max(clickY - rect.top, rect.bottom - clickY);
    const maxRadius = Math.sqrt(maxDistX * maxDistX + maxDistY * maxDistY);

    return {
      duration,
      css: (t) => `
        clip-path: circle(${t * maxRadius}px at ${originX}% ${originY}%);
      `
    };
  }

  let show = $state(false);
  let clickCoords = $state({ x: 0, y: 0 });

  function toggle(event) {
    clickCoords = { x: event.clientX, y: event.clientY };
    show = !show;
  }
</script>

<button onclick={toggle}>Toggle</button>

{#if show}
  <div class="panel" transition:circularRevealFromClick={{
    duration: 800,
    clickX: clickCoords.x,
    clickY: clickCoords.y
  }}>
    <h3>Click-Origin Reveal</h3>
    <p>The circle expands from where you clicked the button.</p>
  </div>
{/if}
```

### Wipe Transition Variant

A horizontal or vertical wipe uses `clip-path: inset()` instead of `circle()`:

```svelte
<script>
  function wipe(node, { duration = 500, direction = "left" }) {
    const insetMap = {
      left:   (u) => `inset(0 ${u * 100}% 0 0)`,
      right:  (u) => `inset(0 0 0 ${u * 100}%)`,
      top:    (u) => `inset(0 0 ${u * 100}% 0)`,
      bottom: (u) => `inset(${u * 100}% 0 0 0)`
    };

    const getInset = insetMap[direction] || insetMap.left;

    return {
      duration,
      css: (t, u) => `clip-path: ${getInset(u)};`
    };
  }

  let show = $state(true);
  let direction = $state("left");
</script>

<select bind:value={direction}>
  <option value="left">Wipe from Left</option>
  <option value="right">Wipe from Right</option>
  <option value="top">Wipe from Top</option>
  <option value="bottom">Wipe from Bottom</option>
</select>

<button onclick={() => show = !show}>Toggle</button>

{#if show}
  <div class="wipe-box" transition:wipe={{ duration: 600, direction }}>
    <img src="/placeholder.jpg" alt="Demo" />
  </div>
{/if}
```

### Diamond Wipe

You can create more exotic clip-path shapes:

```svelte
<script>
  function diamondWipe(node, { duration = 700 }) {
    return {
      duration,
      css: (t) => {
        const size = t * 150; // percentage overshoot to cover corners
        return `
          clip-path: polygon(
            50% ${50 - size}%,
            ${50 + size}% 50%,
            50% ${50 + size}%,
            ${50 - size}% 50%
          );
        `;
      }
    };
  }
</script>
```

## Custom JavaScript Transitions

When CSS alone is not enough — for canvas rendering, WebGL, or imperative DOM manipulation — use the `tick` function instead of `css`. The `tick` callback runs on every animation frame:

```svelte
<script>
  function colorShift(node, { duration = 600 }) {
    return {
      duration,
      tick: (t) => {
        const hue = Math.floor(t * 360);
        node.style.backgroundColor = `hsl(${hue}, 70%, 85%)`;
        node.style.opacity = `${t}`;
      }
    };
  }

  let show = $state(true);
</script>

<button onclick={() => show = !show}>Toggle</button>

{#if show}
  <div class="box" transition:colorShift={{ duration: 800 }}>
    <p>I shift through colors as I appear!</p>
  </div>
{/if}

<style>
  .box {
    padding: 24px;
    border-radius: 12px;
    text-align: center;
  }
</style>
```

**Performance note**: Prefer CSS transitions whenever possible. CSS animations run on the compositor thread, separate from the main JavaScript thread. JavaScript `tick` transitions run on the main thread and can cause jank if the animation is complex or the page is busy.

### Scramble Text Transition (Tick-Based)

A text scramble effect randomly replaces characters before settling on the final text. This is impossible with CSS alone because it requires changing `textContent`:

```svelte
<script>
  function scramble(node, { duration = 1000, chars = "!@#$%^&*()_+{}|:<>?" }) {
    const originalText = node.textContent;
    const length = originalText.length;

    return {
      duration,
      tick: (t) => {
        if (t === 1) {
          node.textContent = originalText;
          return;
        }

        const revealedCount = Math.floor(length * t);
        let result = "";

        for (let i = 0; i < length; i++) {
          if (i < revealedCount) {
            result += originalText[i];
          } else if (originalText[i] === " ") {
            result += " ";
          } else {
            result += chars[Math.floor(Math.random() * chars.length)];
          }
        }

        node.textContent = result;
      }
    };
  }

  let show = $state(true);
</script>

<button onclick={() => show = !show}>Toggle</button>

{#if show}
  <h2 class="scramble-text" transition:scramble={{ duration: 1500 }}>
    SYSTEM ONLINE
  </h2>
{/if}

<style>
  .scramble-text {
    font-family: monospace;
    font-size: 2rem;
    letter-spacing: 0.1em;
    color: #16a34a;
  }
</style>
```

Characters are progressively revealed from left to right while unrevealed positions show random symbols. When `t` reaches 1, we set the final text to ensure precision. This technique is popular in cyberpunk/hacker UIs and portfolio sites.

### WRONG vs CORRECT: Tick Transition Cleanup

```typescript
// WRONG: Tick function leaks DOM changes — after outro, text is empty
function leakyScramble(node, { duration = 1000 }) {
  const originalText = node.textContent;
  return {
    duration,
    tick: (t) => {
      node.textContent = originalText.slice(0, Math.floor(originalText.length * t));
      // When t=0 during outro end, textContent is empty.
      // The element is removed, but if the transition is interrupted
      // and the element stays, it shows empty text.
    }
  };
}

// CORRECT: Always restore original state at t=1 and t=0
function cleanScramble(node, { duration = 1000 }) {
  const originalText = node.textContent;
  return {
    duration,
    tick: (t) => {
      if (t === 0 || t === 1) {
        node.textContent = originalText;
        return;
      }
      node.textContent = originalText.slice(0, Math.floor(originalText.length * t));
    }
  };
}
```

Always handle the boundary cases (`t === 0` and `t === 1`) in tick transitions. If a transition is interrupted (user toggles quickly), the element might stay in the DOM with a partially-animated state.

### Counter Transition (Tick-Based)

Counting up a number from 0 to a target value is another common tick-based pattern:

```svelte
<script>
  function countUp(node, { duration = 1000 }) {
    const target = parseInt(node.textContent, 10);
    if (isNaN(target)) return { duration: 0 };

    return {
      duration,
      tick: (t) => {
        node.textContent = Math.floor(target * t).toLocaleString();
      }
    };
  }

  let show = $state(true);
</script>

<button onclick={() => show = !show}>Toggle Stats</button>

{#if show}
  <div class="stats">
    <div class="stat">
      <span class="number" in:countUp={{ duration: 1200 }}>48523</span>
      <span class="label">Users</span>
    </div>
    <div class="stat">
      <span class="number" in:countUp={{ duration: 800 }}>1247</span>
      <span class="label">Projects</span>
    </div>
    <div class="stat">
      <span class="number" in:countUp={{ duration: 1500 }}>99</span>
      <span class="label">% Uptime</span>
    </div>
  </div>
{/if}

<style>
  .stats { display: flex; gap: 32px; }
  .stat { text-align: center; }
  .number { font-size: 2rem; font-weight: bold; display: block; }
  .label { color: #666; font-size: 0.9rem; }
</style>
```

## transition:draw for SVG

The `draw` transition animates SVG strokes using `stroke-dasharray` and `stroke-dashoffset`. It makes paths look like they are being drawn by hand. Import it from `svelte/transition`:

```svelte
<script>
  import { draw } from "svelte/transition";

  let show = $state(true);
</script>

<button onclick={() => show = !show}>Toggle Drawing</button>

{#if show}
  <svg viewBox="0 0 200 200" width="200" height="200">
    <path
      transition:draw={{ duration: 1500 }}
      d="M 10 80 Q 52.5 10, 95 80 T 180 80"
      fill="none"
      stroke="#3b82f6"
      stroke-width="3"
    />
    <circle
      transition:draw={{ duration: 1000, delay: 500 }}
      cx="100"
      cy="120"
      r="40"
      fill="none"
      stroke="#16a34a"
      stroke-width="2"
    />
    <line
      transition:draw={{ duration: 800, delay: 1000 }}
      x1="20"
      y1="180"
      x2="180"
      y2="180"
      stroke="#dc2626"
      stroke-width="2"
    />
  </svg>
{/if}

<style>
  svg {
    display: block;
    margin: 20px 0;
  }
</style>
```

`draw` works with `<path>`, `<line>`, `<polyline>`, `<polygon>`, `<circle>`, `<rect>`, and any SVG element that has a stroke. Use `delay` to stagger multiple elements for a sequential drawing effect.

### How draw Works Under the Hood

The `draw` transition uses two CSS properties: `stroke-dasharray` and `stroke-dashoffset`. Here is the technique:

1. It measures the total path length using `node.getTotalLength()`.
2. It sets `stroke-dasharray` to the total length — this creates a single dash as long as the entire path.
3. It animates `stroke-dashoffset` from the total length (path completely hidden, because the dash starts "off screen") to 0 (path fully visible).

You can implement this yourself:

```typescript
function customDraw(node, { duration = 800, delay = 0, easing }) {
  const length = node.getTotalLength();

  return {
    delay,
    duration,
    easing,
    css: (t) => `
      stroke-dasharray: ${length};
      stroke-dashoffset: ${length * (1 - t)};
    `
  };
}
```

Understanding this is valuable because you can extend it — for example, drawing only a portion of the path, or animating the dash gap for a "marching ants" effect:

```typescript
// Draw only 75% of the path
function partialDraw(node, { duration = 800, fraction = 0.75 }) {
  const length = node.getTotalLength();
  const drawLength = length * fraction;

  return {
    duration,
    css: (t) => `
      stroke-dasharray: ${drawLength} ${length};
      stroke-dashoffset: ${drawLength * (1 - t)};
    `
  };
}

// Marching ants effect (constant animation, not a transition per se)
function marchingAnts(node, { duration = 2000, dashSize = 10 }) {
  const length = node.getTotalLength();

  return {
    duration,
    css: (t) => `
      stroke-dasharray: ${dashSize} ${dashSize};
      stroke-dashoffset: ${-t * dashSize * 2};
    `
  };
}
```

### Building a Signature Animation

Combining `draw` with staggered delays creates a signature-drawing effect:

```svelte
<script>
  import { draw } from "svelte/transition";
  import { quintInOut } from "svelte/easing";

  let show = $state(true);
</script>

<button onclick={() => show = !show}>Sign</button>

{#if show}
  <svg viewBox="0 0 400 150" width="400" height="150">
    <!-- Letter S -->
    <path
      transition:draw={{ duration: 600, easing: quintInOut }}
      d="M 30 40 C 30 20, 60 20, 60 40 C 60 60, 20 60, 20 80 C 20 100, 50 100, 55 85"
      fill="none" stroke="#1e293b" stroke-width="2.5"
      stroke-linecap="round"
    />
    <!-- Letter v -->
    <path
      transition:draw={{ duration: 400, delay: 500, easing: quintInOut }}
      d="M 75 45 L 90 95 L 105 45"
      fill="none" stroke="#1e293b" stroke-width="2.5"
      stroke-linecap="round" stroke-linejoin="round"
    />
    <!-- Underline flourish -->
    <path
      transition:draw={{ duration: 800, delay: 800, easing: quintInOut }}
      d="M 20 110 Q 100 130, 200 105 T 380 110"
      fill="none" stroke="#3b82f6" stroke-width="1.5"
      stroke-linecap="round"
    />
  </svg>
{/if}
```

## Crossfade — Morphing Between Positions

`crossfade` creates paired `send` and `receive` transitions. When an element with `send` leaves one location and an element with the same key appears elsewhere with `receive`, Svelte smoothly morphs the element between the two positions. This is the FLIP (First, Last, Invert, Play) technique implemented at the framework level.

### The FLIP Technique Explained

FLIP is a performance pattern for layout animations coined by Paul Lewis:

1. **First** — record the element's initial position and dimensions.
2. **Last** — apply the DOM change so the element is in its final position. Record the new position.
3. **Invert** — calculate the difference between First and Last. Apply a CSS transform to make the element *appear* to still be in its original position.
4. **Play** — remove the inverting transform with a CSS transition, so the element animates from its old position to its new one.

This technique is performant because `transform` animations run on the GPU compositor thread. The DOM change happens instantly (no layout thrashing during animation), and only a cheap transform animation runs afterward.

Svelte's `crossfade` does this automatically. You do not need to manage `getBoundingClientRect()` or calculate deltas yourself.

### Basic Crossfade

```svelte
<script>
  import { crossfade } from "svelte/transition";
  import { quintOut } from "svelte/easing";

  const [send, receive] = crossfade({
    duration: 400,
    easing: quintOut
  });

  let todos = $state([
    { id: 1, text: "Learn transitions" },
    { id: 2, text: "Build a project" },
    { id: 3, text: "Deploy to production" }
  ]);

  let done = $state([]);

  function complete(id) {
    const item = todos.find(t => t.id === id);
    if (item) {
      todos = todos.filter(t => t.id !== id);
      done = [...done, item];
    }
  }

  function uncomplete(id) {
    const item = done.find(t => t.id === id);
    if (item) {
      done = done.filter(t => t.id !== id);
      todos = [...todos, item];
    }
  }
</script>

<div class="board">
  <div class="column">
    <h2>Todo</h2>
    {#each todos as todo (todo.id)}
      <div
        class="card"
        in:receive={{ key: todo.id }}
        out:send={{ key: todo.id }}
      >
        <span>{todo.text}</span>
        <button onclick={() => complete(todo.id)}>Done</button>
      </div>
    {/each}
  </div>

  <div class="column">
    <h2>Completed</h2>
    {#each done as todo (todo.id)}
      <div
        class="card completed"
        in:receive={{ key: todo.id }}
        out:send={{ key: todo.id }}
      >
        <span>{todo.text}</span>
        <button onclick={() => uncomplete(todo.id)}>Undo</button>
      </div>
    {/each}
  </div>
</div>

<style>
  .board {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    max-width: 600px;
  }

  .column {
    padding: 16px;
    background: #f8f9fa;
    border-radius: 12px;
    min-height: 200px;
  }

  .card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    margin-bottom: 8px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .card.completed span {
    text-decoration: line-through;
    color: #999;
  }

  button {
    padding: 4px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: white;
    cursor: pointer;
    font-size: 0.85rem;
  }
</style>
```

The `key` parameter links the `send` and `receive` pair. When an item leaves the "Todo" column with `out:send={{ key: todo.id }}`, Svelte looks for a matching `in:receive={{ key: todo.id }}` in the "Completed" column and animates between the two positions. The result is a smooth morph that feels like the item physically moves across the screen.

### WRONG vs CORRECT: Crossfade Keys

```svelte
<!-- WRONG: Using array index as key — items morph to the wrong element -->
{#each todos as todo, i (i)}
  <div in:receive={{ key: i }} out:send={{ key: i }}>
    {todo.text}
  </div>
{/each}
<!-- When todo[0] is removed, todo[1] takes index 0 and morphs from
     the removed item's position. Visually wrong. -->

<!-- CORRECT: Use stable unique ID -->
{#each todos as todo (todo.id)}
  <div in:receive={{ key: todo.id }} out:send={{ key: todo.id }}>
    {todo.text}
  </div>
{/each}
```

### Crossfade Configuration Options

The `crossfade` factory accepts several options:

```typescript
const [send, receive] = crossfade({
  // Animation duration in ms, or a function that receives the distance
  duration: (d) => Math.sqrt(d) * 30,

  // Delay before animation starts
  delay: 0,

  // Easing function
  easing: quintOut,

  // Fallback transition when there is no matching send/receive pair
  // (e.g., when an element is added without a corresponding removal)
  fallback: fade
});
```

The `duration` can be a function that receives `d` — the pixel distance between the two positions. This makes short movements quick and long movements slower, which feels more natural. The `Math.sqrt(d)` pattern is common because it provides diminishing returns: moving 4x farther only takes 2x as long.

The `fallback` option is critical. When an element has `in:receive` but no matching `out:send` fired (for example, the item was newly created rather than moved from another list), Svelte uses the fallback transition instead. By default, the fallback is `fade`. You can pass any transition function:

```typescript
import { fade, fly } from "svelte/transition";

const [send, receive] = crossfade({
  duration: 400,
  fallback(node) {
    return {
      duration: 300,
      css: (t) => `opacity: ${t}; transform: scale(${0.8 + t * 0.2})`
    };
  }
});
```

### Deferred Transitions: Cross-Component Morphing

A powerful pattern is defining `send` and `receive` in a shared module and importing them into multiple components. This enables shared element transitions across components that do not directly know about each other:

```typescript
// src/lib/transitions.ts
import { crossfade } from "svelte/transition";
import { cubicOut } from "svelte/easing";

export const [send, receive] = crossfade({
  duration: 500,
  easing: cubicOut,
  fallback(node) {
    const style = getComputedStyle(node);
    const opacity = +style.opacity;
    return {
      duration: 300,
      css: (t) => `opacity: ${t * opacity}`
    };
  }
});
```

```svelte
<!-- src/lib/components/SourceList.svelte -->
<script>
  import { send, receive } from "$lib/transitions";

  let { items, onSelect } = $props();
</script>

{#each items as item (item.id)}
  <div
    in:receive={{ key: item.id }}
    out:send={{ key: item.id }}
    onclick={() => onSelect(item)}
  >
    {item.name}
  </div>
{/each}
```

```svelte
<!-- src/lib/components/TargetList.svelte -->
<script>
  import { send, receive } from "$lib/transitions";

  let { items, onRemove } = $props();
</script>

{#each items as item (item.id)}
  <div
    in:receive={{ key: item.id }}
    out:send={{ key: item.id }}
    onclick={() => onRemove(item)}
  >
    {item.name}
  </div>
{/each}
```

Because both components import from the same `crossfade` instance, elements animate seamlessly between them. The components are completely decoupled — they share behavior through a common module, not through parent-child relationships. This is the "deferred transition" pattern.

## Transition Events

Svelte dispatches events at each stage of a transition's lifecycle. Use these to coordinate animations, disable buttons during transitions, or trigger follow-up actions:

| Event | When It Fires |
|-------|---------------|
| `onintrostart` | Intro transition begins |
| `onintroend` | Intro transition completes |
| `onoutrostart` | Outro transition begins |
| `onoutroend` | Outro transition completes |

```svelte
<script>
  import { fly } from "svelte/transition";

  let show = $state(false);
  let transitioning = $state(false);
</script>

<button onclick={() => show = !show} disabled={transitioning}>
  {transitioning ? "Animating..." : show ? "Hide" : "Show"}
</button>

{#if show}
  <div
    transition:fly={{ y: 30, duration: 500 }}
    onintrostart={() => transitioning = true}
    onintroend={() => transitioning = false}
    onoutrostart={() => transitioning = true}
    onoutroend={() => transitioning = false}
  >
    <p>I disable the button while animating!</p>
  </div>
{/if}

<style>
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  div {
    padding: 16px;
    margin-top: 12px;
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    border-radius: 8px;
  }
</style>
```

### Chaining Sequential Animations with Events

Transition events enable multi-step animation sequences where one animation triggers the next:

```svelte
<script>
  import { fly, fade, scale } from "svelte/transition";

  let step = $state(0);

  function startSequence() {
    step = 1;
  }

  function reset() {
    step = 0;
  }
</script>

<button onclick={startSequence} disabled={step > 0}>Start Sequence</button>
<button onclick={reset}>Reset</button>

{#if step >= 1}
  <div
    class="step"
    in:fly={{ y: -30, duration: 400 }}
    onintroend={() => step = 2}
  >
    Step 1: Header appears
  </div>
{/if}

{#if step >= 2}
  <div
    class="step"
    in:fade={{ duration: 300 }}
    onintroend={() => step = 3}
  >
    Step 2: Content fades in
  </div>
{/if}

{#if step >= 3}
  <div
    class="step"
    in:scale={{ start: 0.8, duration: 400 }}
  >
    Step 3: Action button scales up
  </div>
{/if}

<style>
  .step {
    padding: 16px;
    margin: 8px 0;
    background: #f8f9fa;
    border-radius: 8px;
    border-left: 4px solid #3b82f6;
  }
</style>
```

Each `onintroend` callback increments the `step` counter, which triggers the next `{#if}` block to render, which starts the next transition. The result is a choreographed reveal sequence.

## Building a Complete Page Transition System

For production applications, you often want every page or section to have a coordinated entry animation. Here is a reusable pattern that combines custom transitions with staggered children:

```svelte
<script>
  import { fly, fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";

  function staggeredFly(node, { index = 0, baseDelay = 50, y = 20, duration = 400 }) {
    return {
      delay: index * baseDelay,
      duration,
      easing: cubicOut,
      css: (t, u) => `
        transform: translateY(${u * y}px);
        opacity: ${t};
      `
    };
  }

  let show = $state(true);

  const sections = [
    { id: 1, title: "Hero", content: "Welcome to our platform" },
    { id: 2, title: "Features", content: "Everything you need" },
    { id: 3, title: "Pricing", content: "Plans for every team" },
    { id: 4, title: "Testimonials", content: "What our users say" },
    { id: 5, title: "CTA", content: "Get started today" }
  ];
</script>

<button onclick={() => show = !show}>
  {show ? "Hide" : "Show"} Page
</button>

{#if show}
  <div class="page">
    {#each sections as section, index (section.id)}
      <div
        class="section"
        in:staggeredFly={{ index, baseDelay: 80, y: 30 }}
        out:fade={{ duration: 200 }}
      >
        <h2>{section.title}</h2>
        <p>{section.content}</p>
      </div>
    {/each}
  </div>
{/if}

<style>
  .page { max-width: 600px; }
  .section {
    padding: 24px;
    margin-bottom: 16px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
  }
</style>
```

The `staggeredFly` transition uses the `index` parameter to calculate a progressive delay. The first section appears immediately, the second after 80ms, the third after 160ms, and so on. The result is a cascading reveal that gives the page a polished, intentional feel.

### Extracting Transitions to a Library Module

For a real project, you will likely reuse the same transitions across many components. Extract them into a shared module:

```typescript
// src/lib/transitions/index.ts
import { crossfade } from "svelte/transition";
import { cubicOut, quintOut, elasticOut } from "svelte/easing";

// Staggered entry for lists
export function stagger(node, { index = 0, delay = 50, y = 20, duration = 400 }) {
  return {
    delay: index * delay,
    duration,
    easing: cubicOut,
    css: (t, u) => `
      transform: translateY(${u * y}px);
      opacity: ${t};
    `
  };
}

// Circular reveal from any origin
export function reveal(node, { duration = 600, x = 50, y = 50 }) {
  const { width, height } = node.getBoundingClientRect();
  const maxRadius = Math.sqrt(width * width + height * height);

  return {
    duration,
    css: (t) => `clip-path: circle(${t * maxRadius}px at ${x}% ${y}%);`
  };
}

// Pop with elastic overshoot
export function pop(node, { duration = 500 }) {
  return {
    duration,
    easing: elasticOut,
    css: (t) => `transform: scale(${t}); opacity: ${t};`
  };
}

// Wipe from any direction
export function wipe(node, { duration = 500, direction = "left" }) {
  const insetMap = {
    left:   (u) => `inset(0 ${u * 100}% 0 0)`,
    right:  (u) => `inset(0 0 0 ${u * 100}%)`,
    top:    (u) => `inset(0 0 ${u * 100}% 0)`,
    bottom: (u) => `inset(${u * 100}% 0 0 0)`
  };
  const getInset = insetMap[direction] || insetMap.left;

  return { duration, css: (t, u) => `clip-path: ${getInset(u)};` };
}

// Shared crossfade for list morphing
export const [send, receive] = crossfade({
  duration: (d) => Math.sqrt(d) * 35,
  easing: quintOut,
  fallback(node) {
    return {
      duration: 250,
      css: (t) => `opacity: ${t}; transform: scale(${0.9 + t * 0.1})`
    };
  }
});
```

Usage in any component:

```svelte
<script>
  import { stagger, reveal, pop, send, receive } from "$lib/transitions";
</script>

{#each items as item, i (item.id)}
  <div in:stagger={{ index: i }} out:pop>
    {item.name}
  </div>
{/each}
```

## Common Mistakes

**Mistake 1: Returning both `css` and `tick`**

```typescript
// WRONG — do not return both css and tick
function broken(node, params) {
  return {
    duration: 400,
    css: (t) => `opacity: ${t}`,
    tick: (t) => { node.style.color = 'red'; }
  };
}

// CORRECT — choose one or the other
function correct(node, params) {
  return {
    duration: 400,
    css: (t) => `opacity: ${t}; color: red;`
  };
}
```

If you provide both, `css` takes precedence and `tick` is ignored. Pick one approach.

**Mistake 2: Forgetting that t=0 is the starting state for intro**

```typescript
// WRONG — element starts fully visible and disappears during intro
function wrongIntro(node, params) {
  return {
    duration: 300,
    css: (t) => `opacity: ${1 - t}` // t goes 0→1, so opacity goes 1→0 during intro
  };
}

// CORRECT — element starts invisible and becomes visible during intro
function correctIntro(node, params) {
  return {
    duration: 300,
    css: (t) => `opacity: ${t}` // t goes 0→1, so opacity goes 0→1 during intro
  };
}
```

**Mistake 3: Animating layout-triggering properties in tick transitions**

```typescript
// WRONG — changing width triggers layout on every frame
function janky(node, params) {
  return {
    duration: 400,
    tick: (t) => {
      node.style.width = `${t * 300}px`;
      node.style.height = `${t * 200}px`;
    }
  };
}

// CORRECT — use transform for GPU-accelerated animation
function smooth(node, params) {
  return {
    duration: 400,
    css: (t) => `transform: scale(${t}); opacity: ${t};`
  };
}
```

**Mistake 4: Not providing a fallback for crossfade**

```typescript
// WRONG — no fallback. New items just pop in with no animation.
const [send, receive] = crossfade({ duration: 400 });
// Items that are created fresh (no matching send) appear instantly.

// CORRECT — always provide a fallback transition for unmatched elements
const [send, receive] = crossfade({
  duration: 400,
  fallback(node) {
    return {
      duration: 250,
      css: (t) => `opacity: ${t}; transform: scale(${0.9 + t * 0.1})`
    };
  }
});
```

**Mistake 5: Forgetting to use keyed each blocks with crossfade**

```svelte
<!-- WRONG: unkeyed each — crossfade cannot track individual items -->
{#each items as item}
  <div in:receive={{ key: item.id }} out:send={{ key: item.id }}>
    {item.name}
  </div>
{/each}
<!-- Svelte reuses DOM nodes by position, not by key. Morphing breaks. -->

<!-- CORRECT: keyed each — items tracked by identity -->
{#each items as item (item.id)}
  <div in:receive={{ key: item.id }} out:send={{ key: item.id }}>
    {item.name}
  </div>
{/each}
```

## Try It

Build a "Kanban Board" with three columns (To Do, In Progress, Done):
- Use `crossfade` to animate items moving between columns
- Write a custom CSS transition called `popIn` that scales and rotates the element slightly as it appears
- Write a circular reveal transition for a detail panel that opens when clicking a card
- Use the `draw` transition on an SVG checkmark that appears when an item moves to the "Done" column
- Disable the move buttons while a transition is in progress using transition events
- Create a staggered entrance animation for the initial board load
- Extract your `crossfade` and custom transitions into a shared `$lib/transitions.ts` module and import them into separate column components

## Key Takeaways

- The transition contract returns `{ delay, duration, easing, css, tick }` — Svelte uses this object to drive the animation
- Custom CSS transitions return `{ duration, css: (t, u) => string }` where `t` goes 0 to 1 for intro, 1 to 0 for outro, and `u` is always `1 - t`
- Custom JS transitions use `{ duration, tick: (t, u) => void }` for imperative DOM, canvas, or WebGL work
- CSS transitions generate `@keyframes` and run on the compositor thread — always prefer CSS when possible
- Stick to compositor-friendly properties (`transform`, `opacity`, `filter`, `clip-path`) for smooth 60fps animations
- `tick` transitions run on the main thread at 60fps — use only when CSS cannot express the animation (text manipulation, canvas, etc.)
- Always handle boundary cases (`t === 0` and `t === 1`) in tick transitions to prevent stale DOM state on interruption
- `draw` animates SVG strokes using `stroke-dasharray` and `stroke-dashoffset` — works with `path`, `line`, `circle`, and other stroke-based elements
- `crossfade` creates paired `send`/`receive` transitions implementing the FLIP technique for smooth morphing between positions
- The `fallback` option in `crossfade` controls what happens when there is no matching pair — always provide one
- Deferred transitions work by exporting `send`/`receive` from a shared module so decoupled components can animate elements between them
- Transition events (`onintrostart`, `onintroend`, `onoutrostart`, `onoutroend`) let you coordinate UI behavior, chain sequences, and prevent double-clicks during animations
- The `direction` parameter in the options argument lets a single transition function behave differently for `in:`, `out:`, and `transition:` usage
- Always read `node` properties (dimensions, text, styles) in the transition function body, not inside `css` or `tick` — those closures run after the initial measurement
- Extract reusable transitions into a `$lib/transitions` module for consistency and DRY code across your project
