# Image Optimization & Advanced Patterns

Images are the heaviest assets on nearly every web page. HTTP Archive data consistently shows that images account for 50-70% of total page weight on the median website. A single unoptimized DSLR photo can weigh 5-8 MB — more than every script, stylesheet, and font on the page combined. When a user uploads a photo and you serve it back at original size and format, you are shipping megabytes of data that the browser will discard during rendering anyway. The user on a 4G connection stares at a blank rectangle. The user on a fast connection sees their Largest Contentful Paint score crater. Neither experience is acceptable.

This lesson builds the complete image optimization pipeline: processing uploads with Sharp on the server, generating responsive variants at multiple sizes and formats, serving them with modern `<picture>` markup, implementing blur-up placeholders for perceived performance, and handling large files with chunked uploads. By the end, you will have a production-grade system that transforms a raw upload into an optimized, responsive, CDN-ready image set — and a Svelte 5 component that serves it all correctly.

## Why Image Optimization Matters for Core Web Vitals

Three Core Web Vitals are directly affected by how you handle images:

**Largest Contentful Paint (LCP)** measures how long it takes for the largest visible element to render. On most pages, that element is an image. An unoptimized 4000x3000 JPEG at quality 95 might be 3 MB. The same image resized to the viewport width, converted to WebP at quality 80, and compressed could be 150 KB — a 20x reduction. That is the difference between a 1.2 second LCP and a 5+ second LCP on a typical mobile connection.

**Cumulative Layout Shift (CLS)** measures visual stability. When an image loads without explicit dimensions, the browser does not know how much space to reserve. The content below the image jumps down when the image finally renders. This is jarring and penalized by CLS scoring. Reserving space with `width`, `height`, and `aspect-ratio` eliminates this shift entirely.

**Interaction to Next Paint (INP)** is affected indirectly. When the main thread is busy decoding a massive image, user interactions (clicks, scrolls, keyboard input) get delayed. Smaller images decode faster, freeing the main thread for interaction handling.

The optimization pipeline addresses all three: smaller files for faster LCP, explicit dimensions for zero CLS, and reduced decode work for better INP.

The pipeline for every uploaded image looks like this:

1. **Resize** — Scale down to the sizes you actually serve. Nobody needs a 4000px-wide image on a 375px phone screen.
2. **Compress** — Reduce quality to a perceptually acceptable level. Quality 80 WebP is visually indistinguishable from quality 95 JPEG at a fraction of the file size.
3. **Convert format** — Modern formats (WebP, AVIF) achieve better compression than JPEG at equal visual quality.
4. **Serve responsively** — Let the browser pick the right size and format for the current viewport and connection.

## Server-Side Image Processing with Sharp

Sharp is the standard image processing library for Node.js. It is built on libvips, which is significantly faster and uses less memory than ImageMagick or GraphicsMagick. Sharp processes images in a streaming pipeline — it reads the input, applies transformations, and writes the output without loading the entire uncompressed bitmap into memory.

Install it:

```bash
npm install sharp
npm install -D @types/sharp
```

Here is a utility module that wraps Sharp for the common operations you need:

```typescript
// src/lib/server/image-processing.ts
import sharp from 'sharp';
import type { Sharp } from 'sharp';

export type ImageFormat = 'jpeg' | 'webp' | 'avif';
export type ImageVariant = {
  width: number;
  suffix: string;
};

const VARIANTS: ImageVariant[] = [
  { width: 200, suffix: 'thumb' },
  { width: 600, suffix: 'sm' },
  { width: 1200, suffix: 'md' },
  { width: 2400, suffix: 'lg' }
];

const FORMAT_OPTIONS: Record<ImageFormat, object> = {
  jpeg: { quality: 80, mozjpeg: true },
  webp: { quality: 80, effort: 4 },
  avif: { quality: 65, effort: 4 }
};

const FORMATS: ImageFormat[] = ['avif', 'webp', 'jpeg'];

export async function processImage(
  buffer: Buffer,
  baseId: string
): Promise<ProcessedImage> {
  const pipeline = sharp(buffer);
  const metadata = await pipeline.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Unable to read image dimensions');
  }

  // Strip EXIF, GPS, and other metadata — reduces file size
  // and avoids leaking location data from phone photos
  pipeline.rotate(); // Auto-rotate based on EXIF orientation, then strip
  
  const results: GeneratedFile[] = [];
  const originalWidth = metadata.width;
  const originalHeight = metadata.height;
  const aspectRatio = originalWidth / originalHeight;

  // Generate a tiny placeholder for blur-up
  const placeholderBuffer = await sharp(buffer)
    .resize(20, Math.round(20 / aspectRatio))
    .blur(2)
    .jpeg({ quality: 40 })
    .toBuffer();

  const placeholder = `data:image/jpeg;base64,${placeholderBuffer.toString('base64')}`;

  // Generate each size x format combination
  for (const variant of VARIANTS) {
    // Skip variants larger than the original
    if (variant.width > originalWidth) continue;

    const height = Math.round(variant.width / aspectRatio);

    for (const format of FORMATS) {
      const outputBuffer = await sharp(buffer)
        .resize(variant.width, height, { fit: 'inside', withoutEnlargement: true })
        .toFormat(format, FORMAT_OPTIONS[format])
        .toBuffer();

      const filename = `${baseId}-${variant.width}.${format}`;

      results.push({
        filename,
        buffer: outputBuffer,
        width: variant.width,
        height,
        format,
        size: outputBuffer.byteLength
      });
    }
  }

  return {
    id: baseId,
    originalWidth,
    originalHeight,
    aspectRatio,
    placeholder,
    variants: results
  };
}

export type GeneratedFile = {
  filename: string;
  buffer: Buffer;
  width: number;
  height: number;
  format: ImageFormat;
  size: number;
};

export type ProcessedImage = {
  id: string;
  originalWidth: number;
  originalHeight: number;
  aspectRatio: number;
  placeholder: string;
  variants: GeneratedFile[];
};
```

Several decisions in this code are deliberate. The `rotate()` call applies EXIF orientation and then strips the orientation tag. Without this, photos taken in portrait mode on phones will render sideways. The `withoutEnlargement: true` option prevents Sharp from upscaling images — if someone uploads a 400px-wide image, you do not generate a blurry 1200px version. The `mozjpeg: true` option enables Mozilla's JPEG encoder, which produces smaller files than the default libjpeg at the same quality level.

Notice the quality settings differ by format: JPEG at 80, WebP at 80, AVIF at 65. These are not arbitrary. AVIF achieves better perceptual quality per bit than WebP, so a lower quality number produces visually equivalent output. These values were established through extensive testing by the Squoosh team at Google.

## A Complete Upload-and-Process Endpoint

This SvelteKit API endpoint accepts a file upload, processes it through the optimization pipeline, stores all variants, and returns the metadata needed for the `<picture>` element:

```typescript
// src/routes/api/images/+server.ts
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { processImage } from '$lib/server/image-processing';
import { saveFile, getPublicUrl } from '$lib/server/storage';
import crypto from 'node:crypto';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    error(401, 'Authentication required');
  }

  const formData = await request.formData();
  const file = formData.get('image');

  if (!(file instanceof File)) {
    error(400, 'No image file provided');
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    error(400, `Unsupported format: ${file.type}. Use JPEG, PNG, WebP, or AVIF.`);
  }

  if (file.size > MAX_SIZE) {
    error(400, `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum is 10 MB.`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Content-addressed ID: same file always gets the same ID,
  // which enables deduplication and immutable caching
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  const baseId = `img_${hash}`;

  const processed = await processImage(buffer, baseId);

  // Store all variants
  const urls: Record<string, Record<string, string>> = {};

  for (const variant of processed.variants) {
    const url = await saveFile(
      `images/${variant.filename}`,
      variant.buffer,
      `image/${variant.format}`
    );

    const widthKey = String(variant.width);
    if (!urls[widthKey]) urls[widthKey] = {};
    urls[widthKey][variant.format] = url;
  }

  return json({
    id: processed.id,
    width: processed.originalWidth,
    height: processed.originalHeight,
    aspectRatio: processed.aspectRatio,
    placeholder: processed.placeholder,
    urls
  });
};
```

The content-addressed ID (`sha256` of the file contents) gives you two powerful properties. First, uploading the same file twice does not create duplicates — the hash is identical, so the filenames are identical, and the second upload overwrites with the same content. Second, the URL is immutable. If the contents change, the hash changes, so the URL changes. This means you can set `Cache-Control: public, max-age=31536000, immutable` on every image and never worry about stale caches.

## Generating Responsive Variants

The naming convention `{id}-{width}.{format}` makes the relationship between variants explicit. For a single upload you might generate:

```
img_a1b2c3d4e5f6-200.avif
img_a1b2c3d4e5f6-200.webp
img_a1b2c3d4e5f6-200.jpeg
img_a1b2c3d4e5f6-600.avif
img_a1b2c3d4e5f6-600.webp
img_a1b2c3d4e5f6-600.jpeg
img_a1b2c3d4e5f6-1200.avif
img_a1b2c3d4e5f6-1200.webp
img_a1b2c3d4e5f6-1200.jpeg
img_a1b2c3d4e5f6-2400.avif
img_a1b2c3d4e5f6-2400.webp
img_a1b2c3d4e5f6-2400.jpeg
```

That is 12 files from a single upload — 4 sizes times 3 formats. This sounds like a lot, but modern build pipelines handle this routinely. The total storage is typically less than 2x the original file size because the compressed formats are dramatically smaller. And the payoff is enormous: the browser downloads only the single file that best matches the current viewport and format support.

If you need to reduce processing time or storage, you can be strategic about which combinations to generate. AVIF encoding is the slowest, so for non-critical images you might skip it. For user avatars, you might only generate thumbnail and small sizes. The variant list is configurable per use case:

```typescript
// Avatar-specific processing — only small sizes, skip AVIF
const AVATAR_VARIANTS: ImageVariant[] = [
  { width: 48, suffix: 'xs' },
  { width: 96, suffix: 'sm' },
  { width: 192, suffix: 'md' }
];

const AVATAR_FORMATS: ImageFormat[] = ['webp', 'jpeg'];
```

## Modern Image Formats

Not all formats are created equal. Here is a practical breakdown:

**JPEG** — The universal fallback. Every browser since the 1990s supports it. Quality-to-size ratio is the worst of the modern options, but it is your safety net. Use `mozjpeg` encoding for 5-10% smaller files at the same quality.

**WebP** — Developed by Google. 25-35% smaller than equivalent JPEG at the same visual quality. Supported by all modern browsers (Chrome, Firefox, Safari 14+, Edge). This is your primary format for most users. Supports both lossy and lossless compression, as well as transparency (unlike JPEG).

**AVIF** — Based on the AV1 video codec. 30-50% smaller than JPEG, and noticeably better than WebP at low bitrates. Supported by Chrome, Firefox, and Safari 16.4+. The tradeoff is encoding speed — AVIF can be 10-20x slower to encode than WebP. For upload-time processing, this is acceptable because the encoding happens once and the savings are served millions of times.

**PNG** — Lossless compression. Use only when you need exact pixel reproduction (screenshots, diagrams with text, icons with sharp edges). For photographic content, PNG files are enormous compared to lossy formats. Never convert a photo upload to PNG.

The strategy is simple: generate AVIF for the best compression, WebP as the widely-supported middle ground, and JPEG as the universal fallback. The `<picture>` element lets the browser pick the best format it supports.

## The `<picture>` Element and `srcset`

This is where most developers get responsive images wrong. There are two distinct problems that responsive images solve, and conflating them leads to broken markup.

**Problem 1: Format negotiation.** You have the same image in AVIF, WebP, and JPEG. You want the browser to pick the best format it supports. This is what `<picture>` with `<source type="...">` solves.

**Problem 2: Resolution switching.** You have the same image at 300px, 600px, and 1200px wide. You want the browser to pick the size that matches the current viewport. This is what `srcset` with width descriptors solves.

You need both, and they compose together.

### WRONG — Single img tag for all viewports and formats

```html
<!-- WRONG: Every user downloads the full 2400px JPEG regardless of viewport -->
<img src="/images/hero.jpg" alt="Product photo" />
```

This sends a 2400px-wide JPEG to a user on a 375px-wide phone screen. The browser scales it down visually, but the user still downloaded all those pixels. On a 4G connection this could take 3-4 seconds, and the browser wastes CPU decoding megapixels it will throw away.

### WRONG — srcset without sizes

```html
<!-- WRONG: Browser cannot make a correct decision without sizes -->
<img
  src="/images/hero-1200.jpg"
  srcset="
    /images/hero-300.jpg 300w,
    /images/hero-600.jpg 600w,
    /images/hero-1200.jpg 1200w
  "
  alt="Product photo"
/>
```

Without a `sizes` attribute, the browser assumes the image occupies 100% of the viewport width (`100vw`). If the image is actually displayed at 50% of the viewport (say, in a two-column layout), the browser will download a file twice as large as necessary.

### CORRECT — Full picture element with format negotiation and responsive sizes

```html
<!-- CORRECT: Format negotiation + resolution switching + explicit sizing -->
<picture>
  <!-- AVIF: best compression, modern browsers -->
  <source
    type="image/avif"
    srcset="
      /images/hero-300.avif 300w,
      /images/hero-600.avif 600w,
      /images/hero-1200.avif 1200w,
      /images/hero-2400.avif 2400w
    "
    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 800px"
  />
  <!-- WebP: good compression, wide support -->
  <source
    type="image/webp"
    srcset="
      /images/hero-300.webp 300w,
      /images/hero-600.webp 600w,
      /images/hero-1200.webp 1200w,
      /images/hero-2400.webp 2400w
    "
    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 800px"
  />
  <!-- JPEG fallback -->
  <img
    src="/images/hero-1200.jpeg"
    srcset="
      /images/hero-300.jpeg 300w,
      /images/hero-600.jpeg 600w,
      /images/hero-1200.jpeg 1200w,
      /images/hero-2400.jpeg 2400w
    "
    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 800px"
    alt="Product photo"
    width="2400"
    height="1600"
    loading="lazy"
    decoding="async"
  />
</picture>
```

The `sizes` attribute tells the browser: "On screens up to 640px wide, this image fills the full viewport. On screens up to 1024px, it fills half the viewport. On larger screens, it is displayed at 800px." The browser combines this information with the device pixel ratio to select the optimal file. A phone with a 375px viewport at 2x DPR needs a 750px image — it picks the 600w or 1200w variant depending on the format.

The `width` and `height` attributes on the `<img>` element are not about display size — they communicate the aspect ratio to the browser so it can reserve the correct space before the image loads, preventing layout shift.

The `loading="lazy"` attribute tells the browser to defer loading until the image is near the viewport. This is critical for images below the fold. Do **not** lazy-load the hero image or LCP image — that delays the most important visual element.

The `decoding="async"` attribute allows the browser to decode the image off the main thread, preventing jank during scrolling.

## Building a Responsive Image Component

Writing that `<picture>` markup by hand for every image is tedious and error-prone. A Svelte 5 component encapsulates the pattern:

```svelte
<!-- src/lib/components/ResponsiveImage.svelte -->
<script lang="ts">
  type ImageData = {
    id: string;
    width: number;
    height: number;
    aspectRatio: number;
    placeholder: string;
    urls: Record<string, Record<string, string>>;
  };

  let {
    image,
    alt,
    sizes = '100vw',
    priority = false,
    class: className = ''
  }: {
    image: ImageData;
    alt: string;
    sizes?: string;
    priority?: boolean;
    class?: string;
  } = $props();

  let loaded = $state(false);

  const widths = $derived(
    Object.keys(image.urls)
      .map(Number)
      .sort((a, b) => a - b)
  );

  function buildSrcset(format: string): string {
    return widths
      .filter((w) => image.urls[String(w)]?.[format])
      .map((w) => `${image.urls[String(w)][format]} ${w}w`)
      .join(', ');
  }

  const avifSrcset = $derived(buildSrcset('avif'));
  const webpSrcset = $derived(buildSrcset('webp'));
  const jpegSrcset = $derived(buildSrcset('jpeg'));

  // Use the middle variant as the fallback src
  const fallbackSrc = $derived(() => {
    const midWidth = widths[Math.floor(widths.length / 2)];
    return image.urls[String(midWidth)]?.jpeg ?? '';
  });
</script>

<div
  class="responsive-image-wrapper {className}"
  style:aspect-ratio="{image.width} / {image.height}"
>
  {#if image.placeholder && !loaded}
    <img
      src={image.placeholder}
      alt=""
      aria-hidden="true"
      class="placeholder"
      style:aspect-ratio="{image.width} / {image.height}"
    />
  {/if}

  <picture>
    {#if avifSrcset}
      <source type="image/avif" srcset={avifSrcset} {sizes} />
    {/if}
    {#if webpSrcset}
      <source type="image/webp" srcset={webpSrcset} {sizes} />
    {/if}
    <img
      src={fallbackSrc()}
      srcset={jpegSrcset}
      {sizes}
      {alt}
      width={image.width}
      height={image.height}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'sync' : 'async'}
      class="main-image"
      class:loaded
      onload={() => (loaded = true)}
    />
  </picture>
</div>

<style>
  .responsive-image-wrapper {
    position: relative;
    overflow: hidden;
    width: 100%;
  }

  .placeholder {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: blur(20px);
    transform: scale(1.1); /* Prevent blur edge artifacts */
    transition: opacity 0.4s ease-out;
  }

  .main-image {
    display: block;
    width: 100%;
    height: auto;
    opacity: 0;
    transition: opacity 0.4s ease-out;
  }

  .main-image.loaded {
    opacity: 1;
  }

  /* When the main image is loaded, fade out the placeholder */
  .responsive-image-wrapper:has(.main-image.loaded) .placeholder {
    opacity: 0;
  }
</style>
```

Usage in a page:

```svelte
<script lang="ts">
  import ResponsiveImage from '$lib/components/ResponsiveImage.svelte';

  let { data } = $props();
</script>

<!-- Hero image: priority load, large on desktop, full-width on mobile -->
<ResponsiveImage
  image={data.heroImage}
  alt="Project showcase banner"
  sizes="(max-width: 768px) 100vw, 1200px"
  priority={true}
/>

<!-- Grid images: lazy loaded, responsive to grid column width -->
{#each data.gallery as item (item.image.id)}
  <ResponsiveImage
    image={item.image}
    alt={item.title}
    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
  />
{/each}
```

The `priority` prop is important. For the hero image or any image that is your Largest Contentful Paint element, set `priority={true}`. This changes `loading` from `lazy` to `eager` and `decoding` from `async` to `sync`, telling the browser to fetch and decode this image immediately. For images below the fold, leave the default (lazy loading, async decoding) so they do not compete with critical resources.

## The Blur-Up Placeholder Pattern

The blur-up pattern gives users immediate visual feedback while the full image loads. It works in three phases:

1. At upload time, generate a tiny (20px wide) blurred version of the image and encode it as a base64 data URI. This is typically 300-500 bytes — small enough to inline directly in the HTML.
2. When the page renders, display the placeholder immediately. It is already in the HTML (no network request), so it appears instantly.
3. When the full image finishes loading, crossfade from the placeholder to the full image.

The placeholder generation happens in the `processImage` function we built earlier:

```typescript
// Already shown above, but here is the key part:
const placeholderBuffer = await sharp(buffer)
  .resize(20, Math.round(20 / aspectRatio))
  .blur(2)
  .jpeg({ quality: 40 })
  .toBuffer();

const placeholder = `data:image/jpeg;base64,${placeholderBuffer.toString('base64')}`;
```

At 20px wide with quality 40 and blur, this produces a base64 string around 400-600 characters. That is negligible in your HTML payload but provides a recognizable color impression of the final image.

The CSS in the `ResponsiveImage` component handles the crossfade. The placeholder is positioned absolutely on top of the image container. The main image starts at `opacity: 0`. When the `onload` event fires, `loaded` becomes true, the main image fades to `opacity: 1`, and the `:has()` selector fades the placeholder to `opacity: 0`. The `transform: scale(1.1)` on the placeholder prevents the blurred edges from showing inside the container — blur expands the visual footprint of an image slightly, and the scale compensates.

Here is a standalone demonstration component that shows the blur-up effect more explicitly with Svelte 5 transitions:

```svelte
<!-- src/lib/components/BlurUpDemo.svelte -->
<script lang="ts">
  import { fade } from 'svelte/transition';

  let {
    placeholder,
    src,
    alt,
    width,
    height
  }: {
    placeholder: string;
    src: string;
    alt: string;
    width: number;
    height: number;
  } = $props();

  let loaded = $state(false);

  // Preload the image in JavaScript so we know exactly when it is ready
  $effect(() => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      loaded = true;
    };
  });
</script>

<div class="blur-up" style:aspect-ratio="{width} / {height}">
  {#if !loaded}
    <img
      transition:fade={{ duration: 400 }}
      src={placeholder}
      {alt}
      class="blur-placeholder"
    />
  {/if}

  {#if loaded}
    <img
      transition:fade={{ duration: 400 }}
      {src}
      {alt}
      {width}
      {height}
      class="full-image"
    />
  {/if}
</div>

<style>
  .blur-up {
    position: relative;
    overflow: hidden;
    background-color: #e5e7eb;
  }

  .blur-placeholder,
  .full-image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .blur-placeholder {
    filter: blur(20px);
    transform: scale(1.1);
  }
</style>
```

The `$effect` creates an `Image` object in JavaScript and triggers the `loaded` state change when the full image is ready. Using Svelte's `transition:fade` handles the crossfade animation. The two `{#if}` blocks ensure the placeholder transitions out while the full image transitions in.

## Progressive Upload UX

Now tie everything together into a complete upload experience. This component handles the entire flow: file selection with preview, upload with progress tracking, server-side processing, and optimized display with blur-up placeholders.

```svelte
<!-- src/lib/components/ImageUploader.svelte -->
<script lang="ts">
  import ResponsiveImage from '$lib/components/ResponsiveImage.svelte';

  type ImageData = {
    id: string;
    width: number;
    height: number;
    aspectRatio: number;
    placeholder: string;
    urls: Record<string, Record<string, string>>;
  };

  type UploadState =
    | { status: 'idle' }
    | { status: 'previewing'; file: File; previewUrl: string }
    | { status: 'uploading'; file: File; previewUrl: string; progress: number }
    | { status: 'processing'; file: File; previewUrl: string }
    | { status: 'complete'; image: ImageData }
    | { status: 'error'; message: string };

  let state = $state<UploadState>({ status: 'idle' });

  let {
    onUploadComplete
  }: {
    onUploadComplete?: (image: ImageData) => void;
  } = $props();

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Validate on the client before uploading
    if (!file.type.startsWith('image/')) {
      state = { status: 'error', message: 'Please select an image file.' };
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      state = { status: 'error', message: 'Image must be under 10 MB.' };
      return;
    }

    // Create an object URL for the instant preview
    const previewUrl = URL.createObjectURL(file);
    state = { status: 'previewing', file, previewUrl };
  }

  async function startUpload() {
    if (state.status !== 'previewing') return;

    const { file, previewUrl } = state;
    state = { status: 'uploading', file, previewUrl, progress: 0 };

    try {
      const formData = new FormData();
      formData.append('image', file);

      // Use XMLHttpRequest for upload progress tracking
      const image = await uploadWithProgress(formData, (progress) => {
        if (state.status === 'uploading') {
          state = { ...state, progress };
        }
      });

      state = { status: 'processing', file, previewUrl };

      // Brief pause to show the processing state
      // (in practice, the server processing is included in the upload time)
      await new Promise((resolve) => setTimeout(resolve, 500));

      state = { status: 'complete', image };
      onUploadComplete?.(image);

      // Clean up the object URL
      URL.revokeObjectURL(previewUrl);
    } catch (err) {
      state = {
        status: 'error',
        message: err instanceof Error ? err.message : 'Upload failed'
      };
    }
  }

  function uploadWithProgress(
    formData: FormData,
    onProgress: (progress: number) => void
  ): Promise<ImageData> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.message || `Upload failed: ${xhr.status}`));
          } catch {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Network error')));
      xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

      xhr.open('POST', '/api/images');
      xhr.send(formData);
    });
  }

  function reset() {
    if (state.status === 'previewing' || state.status === 'uploading') {
      URL.revokeObjectURL(
        (state as { previewUrl: string }).previewUrl
      );
    }
    state = { status: 'idle' };
  }

  const statusLabel = $derived(
    state.status === 'idle'
      ? 'Select an image'
      : state.status === 'previewing'
        ? 'Ready to upload'
        : state.status === 'uploading'
          ? `Uploading... ${(state as { progress: number }).progress}%`
          : state.status === 'processing'
            ? 'Optimizing image...'
            : state.status === 'complete'
              ? 'Upload complete'
              : 'Error'
  );
</script>

<div class="uploader">
  <p class="status">{statusLabel}</p>

  {#if state.status === 'idle'}
    <label class="drop-zone">
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        onchange={handleFileSelect}
        hidden
      />
      <span>Click to select or drag an image here</span>
    </label>
  {/if}

  {#if state.status === 'previewing'}
    <div class="preview">
      <img src={state.previewUrl} alt="Preview" class="preview-image" />
      <div class="actions">
        <button onclick={startUpload} class="btn-primary">Upload</button>
        <button onclick={reset} class="btn-secondary">Cancel</button>
      </div>
    </div>
  {/if}

  {#if state.status === 'uploading'}
    <div class="preview">
      <img src={state.previewUrl} alt="Uploading" class="preview-image uploading" />
      <div class="progress-bar">
        <div class="progress-fill" style:width="{state.progress}%"></div>
      </div>
    </div>
  {/if}

  {#if state.status === 'processing'}
    <div class="preview">
      <img src={state.previewUrl} alt="Processing" class="preview-image processing" />
      <p class="processing-text">Generating optimized variants...</p>
    </div>
  {/if}

  {#if state.status === 'complete'}
    <div class="result">
      <ResponsiveImage
        image={state.image}
        alt="Uploaded image"
        sizes="(max-width: 640px) 100vw, 600px"
      />
      <button onclick={reset} class="btn-secondary">Upload another</button>
    </div>
  {/if}

  {#if state.status === 'error'}
    <div class="error">
      <p>{state.message}</p>
      <button onclick={reset} class="btn-secondary">Try again</button>
    </div>
  {/if}
</div>

<style>
  .uploader {
    max-width: 600px;
    margin: 0 auto;
  }

  .drop-zone {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    border: 2px dashed #d1d5db;
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.2s;
  }

  .drop-zone:hover {
    border-color: #6366f1;
  }

  .preview-image {
    width: 100%;
    border-radius: 8px;
  }

  .preview-image.uploading {
    opacity: 0.7;
  }

  .preview-image.processing {
    opacity: 0.5;
    filter: blur(2px);
  }

  .progress-bar {
    height: 4px;
    background: #e5e7eb;
    border-radius: 2px;
    margin-top: 8px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: #6366f1;
    transition: width 0.2s ease;
  }

  .error {
    padding: 16px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    color: #dc2626;
  }

  .actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }

  .status {
    font-weight: 600;
    margin-bottom: 8px;
  }
</style>
```

The discriminated union type for `UploadState` is a key design choice. Each status carries exactly the data that status needs — no optional fields, no impossible states. When `status` is `'uploading'`, TypeScript guarantees that `progress`, `file`, and `previewUrl` are present. When `status` is `'complete'`, you know `image` exists. This makes the template logic simple and correct: each `{#if}` block narrows the type, and you cannot accidentally access `state.progress` when the upload is complete.

The optimistic UI pattern shows the local preview immediately when the user selects a file. They see their image right away, not a loading spinner. The preview persists during upload and processing. When the optimized version arrives from the server, the `ResponsiveImage` component takes over with the blur-up placeholder and full responsive markup. The transition from local preview to optimized result is smooth — the user never sees a jarring content swap.

## CDN and Caching

Uploaded images should be served through a CDN with aggressive caching. The content-addressed URL scheme from the processing pipeline makes this straightforward.

### Cache-Control Headers

Set cache headers in the endpoint that serves images, or configure them at the storage/CDN level:

```typescript
// src/routes/images/[...path]/+server.ts
import type { RequestHandler } from './$types';
import { getFile } from '$lib/server/storage';
import { error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params }) => {
  const file = await getFile(`images/${params.path}`);

  if (!file) {
    error(404, 'Image not found');
  }

  const extension = params.path.split('.').pop();
  const contentType =
    extension === 'avif'
      ? 'image/avif'
      : extension === 'webp'
        ? 'image/webp'
        : 'image/jpeg';

  return new Response(file.buffer, {
    headers: {
      'Content-Type': contentType,
      // Immutable: the URL includes a content hash,
      // so the content never changes for this URL
      'Cache-Control': 'public, max-age=31536000, immutable',
      // Allow CDNs to cache and serve this without checking back
      'CDN-Cache-Control': 'public, max-age=31536000',
      // ETag for conditional requests (belt-and-suspenders)
      ETag: `"${params.path}"`,
      // Prevent MIME type sniffing
      'X-Content-Type-Options': 'nosniff'
    }
  });
};
```

### WRONG — Cache headers that cause re-fetching

```typescript
// WRONG: no-cache means the browser must revalidate every time
headers: {
  'Cache-Control': 'no-cache',
}

// WRONG: short max-age means frequent re-downloads
headers: {
  'Cache-Control': 'public, max-age=3600', // 1 hour
}
```

### CORRECT — Immutable caching with content-addressed URLs

```typescript
// CORRECT: Content hash in URL means the content never changes
// for this URL — cache forever
headers: {
  'Cache-Control': 'public, max-age=31536000, immutable',
}
```

The `immutable` directive tells the browser: "Do not even send a conditional request (If-None-Match / If-Modified-Since) for this resource. The content at this URL will never change." This eliminates revalidation latency entirely. Combined with a CDN, the image is served from the edge node nearest to the user with zero origin server involvement.

### Cache Busting

Because the URL includes a content hash (`img_a1b2c3d4e5f6`), updating an image naturally produces a new URL. If a user replaces their profile photo, the new upload gets a new hash, which generates new filenames, which generates new URLs. The old cached version is never served because nothing links to it anymore. The old files can be garbage-collected on a schedule.

### CDN Integration

Most deployment platforms handle CDN configuration automatically:

- **Vercel**: Files served from `/api/images` are automatically cached at the edge if you set `Cache-Control` headers. Use their `@vercel/blob` package for storage with built-in CDN.
- **Cloudflare**: Use R2 for storage. Files in R2 are automatically served through Cloudflare's CDN. Custom domains get automatic HTTPS and HTTP/2.
- **AWS**: S3 for storage, CloudFront for CDN. Configure a CloudFront distribution with the S3 bucket as origin.

For SvelteKit on any platform, the pattern is the same: store processed images in object storage, serve them through a CDN with immutable cache headers, and use content-addressed URLs for automatic cache busting.

## Chunked and Resumable Uploads

The standard `FormData` upload works well for images up to 10-15 MB. But for large files — high-resolution photos, RAW camera files, or videos — a single HTTP request is fragile. A network hiccup at 90% uploaded means starting over from zero. Chunked uploads solve this by splitting the file into smaller pieces and uploading them independently.

### The Concept

1. The client splits the file into chunks (typically 1-5 MB each).
2. Each chunk is uploaded as a separate request with metadata: file ID, chunk index, total chunks.
3. The server stores each chunk and tracks progress.
4. When all chunks are received, the server reassembles the file.
5. If the connection drops, the client asks the server which chunks were received and resumes from where it left off.

This is the core idea behind the **tus protocol** (tus.io), an open standard for resumable uploads. Here is a simplified implementation that captures the key concepts:

### Client-Side Chunking

```typescript
// src/lib/upload/chunked.ts
const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB chunks

export type ChunkProgress = {
  uploadId: string;
  totalChunks: number;
  completedChunks: number;
  totalBytes: number;
  uploadedBytes: number;
};

export async function uploadChunked(
  file: File,
  onProgress: (progress: ChunkProgress) => void
): Promise<{ uploadId: string }> {
  // Step 1: Initiate the upload
  const initResponse = await fetch('/api/uploads/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      fileSize: file.size,
      mimeType: file.type,
      totalChunks: Math.ceil(file.size / CHUNK_SIZE)
    })
  });

  if (!initResponse.ok) {
    throw new Error('Failed to initiate upload');
  }

  const { uploadId, completedChunks: alreadyCompleted } =
    await initResponse.json();

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  // Step 2: Upload each chunk (skip already-completed ones for resume)
  for (let i = 0; i < totalChunks; i++) {
    if (alreadyCompleted.includes(i)) continue;

    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('uploadId', uploadId);
    formData.append('chunkIndex', String(i));
    formData.append('totalChunks', String(totalChunks));

    const response = await fetch('/api/uploads/chunk', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Chunk ${i} failed: ${response.status}`);
    }

    onProgress({
      uploadId,
      totalChunks,
      completedChunks: i + 1,
      totalBytes: file.size,
      uploadedBytes: end
    });
  }

  // Step 3: Finalize — tell the server to reassemble
  const finalizeResponse = await fetch('/api/uploads/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId })
  });

  if (!finalizeResponse.ok) {
    throw new Error('Failed to finalize upload');
  }

  return { uploadId };
}
```

### Server-Side Chunk Handling

```typescript
// src/routes/api/uploads/initiate/+server.ts
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import crypto from 'node:crypto';
import { createUploadSession, getUploadSession } from '$lib/server/upload-sessions';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) error(401, 'Authentication required');

  const { filename, fileSize, mimeType, totalChunks } = await request.json();

  if (fileSize > 500 * 1024 * 1024) {
    error(400, 'Maximum file size is 500 MB');
  }

  const uploadId = crypto.randomUUID();

  await createUploadSession({
    id: uploadId,
    userId: locals.user.id,
    filename,
    fileSize,
    mimeType,
    totalChunks,
    completedChunks: [],
    createdAt: new Date()
  });

  return json({ uploadId, completedChunks: [] });
};
```

```typescript
// src/routes/api/uploads/chunk/+server.ts
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { getUploadSession, markChunkComplete } from '$lib/server/upload-sessions';
import { saveChunk } from '$lib/server/storage';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) error(401, 'Authentication required');

  const formData = await request.formData();
  const chunk = formData.get('chunk');
  const uploadId = formData.get('uploadId') as string;
  const chunkIndex = Number(formData.get('chunkIndex'));

  if (!(chunk instanceof File)) {
    error(400, 'Missing chunk data');
  }

  const session = await getUploadSession(uploadId);

  if (!session || session.userId !== locals.user.id) {
    error(404, 'Upload session not found');
  }

  if (session.completedChunks.includes(chunkIndex)) {
    // Chunk already uploaded — idempotent, just acknowledge
    return json({ status: 'already_received' });
  }

  const buffer = Buffer.from(await chunk.arrayBuffer());
  await saveChunk(uploadId, chunkIndex, buffer);
  await markChunkComplete(uploadId, chunkIndex);

  return json({ status: 'received', chunkIndex });
};
```

```typescript
// src/routes/api/uploads/finalize/+server.ts
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { getUploadSession, deleteUploadSession } from '$lib/server/upload-sessions';
import { assembleChunks, deleteChunks } from '$lib/server/storage';
import { processImage } from '$lib/server/image-processing';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) error(401, 'Authentication required');

  const { uploadId } = await request.json();
  const session = await getUploadSession(uploadId);

  if (!session || session.userId !== locals.user.id) {
    error(404, 'Upload session not found');
  }

  if (session.completedChunks.length !== session.totalChunks) {
    error(
      400,
      `Missing chunks: received ${session.completedChunks.length} of ${session.totalChunks}`
    );
  }

  // Reassemble chunks into the complete file
  const completeBuffer = await assembleChunks(uploadId, session.totalChunks);

  // Clean up temporary chunks
  await deleteChunks(uploadId, session.totalChunks);

  // Process the image through the optimization pipeline
  const hash = (await import('node:crypto'))
    .createHash('sha256')
    .update(completeBuffer)
    .digest('hex')
    .slice(0, 16);

  const processed = await processImage(completeBuffer, `img_${hash}`);

  // Store optimized variants...
  // (same logic as the single-upload endpoint)

  await deleteUploadSession(uploadId);

  return json({
    id: processed.id,
    width: processed.originalWidth,
    height: processed.originalHeight,
    aspectRatio: processed.aspectRatio,
    placeholder: processed.placeholder
  });
};
```

### Resuming After Failure

The resume capability comes from the initiation endpoint. If the client loses connection and restarts the upload, it can call `/api/uploads/initiate` with the same file metadata. The server checks for an existing session (you could match on a client-provided hash of the file) and returns the list of already-completed chunks. The client then skips those chunks and uploads only what is missing.

### WRONG — Restarting from zero on failure

```typescript
// WRONG: If chunk 47 of 50 fails, the user must re-upload all 50 chunks
async function upload(file: File) {
  try {
    await uploadAllChunks(file);
  } catch {
    // Start completely over
    await uploadAllChunks(file);
  }
}
```

### CORRECT — Resume from last successful chunk

```typescript
// CORRECT: Query the server for progress and resume
async function uploadWithResume(file: File) {
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await uploadChunked(file, onProgress);
      return; // Success
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      // uploadChunked already handles resume internally —
      // it asks the server which chunks are complete
      // and skips them on the next attempt
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}
```

For production applications handling very large files (100+ MB), consider using the tus protocol directly with libraries like `tus-js-client` on the client and `tus-node-server` on the server. The tus protocol handles edge cases that the simplified implementation above does not cover: concurrent chunk uploads, checksum verification, upload expiration, and server-to-client progress communication via headers.

## Putting It All Together

Here is how a page might combine everything — the uploader component from lesson 1, the server processing from lesson 2, and the optimization and responsive serving from this lesson:

```svelte
<!-- src/routes/gallery/+page.svelte -->
<script lang="ts">
  import ImageUploader from '$lib/components/ImageUploader.svelte';
  import ResponsiveImage from '$lib/components/ResponsiveImage.svelte';

  let { data } = $props();
  let images = $state(data.images);

  function handleUploadComplete(image: any) {
    images = [image, ...images];
  }
</script>

<h1>Photo Gallery</h1>

<ImageUploader onUploadComplete={handleUploadComplete} />

<div class="gallery">
  {#each images as image (image.id)}
    <div class="gallery-item">
      <ResponsiveImage
        {image}
        alt="Gallery photo"
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      />
    </div>
  {/each}
</div>

<style>
  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 16px;
    margin-top: 24px;
  }

  .gallery-item {
    border-radius: 8px;
    overflow: hidden;
  }
</style>
```

The flow from the user's perspective: they click the upload area, select a photo, see it previewed instantly (optimistic UI from the local object URL), click Upload, watch the progress bar fill, see "Optimizing image..." briefly, and then the preview is replaced by the fully optimized responsive image with blur-up placeholder. New uploads appear at the top of the gallery immediately. Every image in the gallery is served in the best format the browser supports, at the optimal resolution for the viewport, with immutable caching through the CDN.

## Try It

1. **Build the optimization pipeline.** Install Sharp and implement the `processImage` function. Create a test script that takes a local JPEG file, runs it through the pipeline, and outputs all the variants to a directory. Compare the file sizes: how much smaller are the WebP and AVIF variants compared to the JPEG at each resolution? Log a table of filename, dimensions, format, and file size for each variant. Test with a photo larger than 4000px wide and verify that the `withoutEnlargement` option prevents upscaling for the 2400px variant if the original is smaller.

2. **Build the ResponsiveImage component with blur-up.** Create the component as shown above and wire it to a page that loads image data from a mock object (hardcode the URLs and placeholder data). Verify that the blur-up placeholder appears immediately, the full image fades in when loaded, and the `<picture>` element includes all three format sources. Open DevTools Network tab, set throttling to "Slow 3G", and confirm you can see the placeholder while the full image loads. Check the Elements panel and verify the browser selected the correct `<source>` based on your viewport width.

3. **Implement chunked upload with resume.** Build the chunked upload system with initiation, chunk upload, and finalization endpoints. Create a test page that uploads a large file (use a 20+ MB image or generate a test file). Start an upload, then kill the server mid-upload. Restart the server and resume the upload — verify that only the remaining chunks are sent. Add a progress display that shows "Chunk 7 of 12" alongside the percentage bar.

## Key Takeaways

- Images are typically 50-70% of page weight — optimizing them has more impact on load performance than any JavaScript optimization
- Sharp is the standard Node.js image library — it uses libvips for fast, memory-efficient processing with a streaming pipeline
- Generate three formats per image: AVIF (best compression), WebP (wide support), JPEG (universal fallback) — the `<picture>` element lets the browser pick the best one
- Generate multiple sizes (thumbnail through large) and use `srcset` with width descriptors so the browser downloads only the pixels it needs
- The `sizes` attribute on `<img>` and `<source>` is required for correct `srcset` behavior — without it, the browser assumes `100vw` and may download oversized images
- Set `width` and `height` attributes (or `aspect-ratio` in CSS) on every image to prevent Cumulative Layout Shift
- Use `loading="lazy"` for images below the fold and `loading="eager"` (or omit the attribute) for the LCP image
- The blur-up placeholder pattern (20px wide, base64-inlined, blurred) provides instant visual feedback while the full image loads
- Content-addressed URLs (hash in filename) enable immutable caching: `Cache-Control: public, max-age=31536000, immutable` eliminates all revalidation
- Chunked uploads split large files into small pieces uploaded independently — if the connection drops, resume from the last successful chunk instead of starting over
- Discriminated union types for upload state (idle, previewing, uploading, processing, complete, error) eliminate impossible states and make template logic simple and type-safe
