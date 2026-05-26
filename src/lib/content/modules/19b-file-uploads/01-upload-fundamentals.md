# Upload Fundamentals

## The Browser File API

Before you upload a single byte to a server, you need to understand how browsers represent files. The File API is a set of interfaces that let JavaScript interact with files the user selects -- reading their contents, checking their metadata, and generating preview URLs. Everything in this lesson happens on the client. Server-side handling is lesson 2.

### The Core Interfaces

Four interfaces form the foundation:

**`Blob`** -- A raw chunk of binary data with a MIME type. It is the base class for `File`. You rarely create `Blob` objects directly, but many APIs return them (canvas export, fetch responses, clipboard data). A `Blob` has a `size` (in bytes), a `type` (MIME string), and methods like `slice()`, `text()`, `arrayBuffer()`, and `stream()`.

**`File`** -- Extends `Blob` with file-specific metadata: `name` (the original filename), `lastModified` (timestamp), and `webkitRelativePath` (for directory uploads). Every file the user selects through `<input type="file">` or drag-and-drop arrives as a `File` object.

**`FileList`** -- An array-like (but not an array) collection of `File` objects. This is what `<input type="file">` gives you via its `.files` property. It has a `length` and indexed access (`fileList[0]`) but no `map`, `filter`, or `forEach`. You must convert it to a real array to use array methods.

**`FileReader`** -- An asynchronous reader that converts `Blob`/`File` contents into strings, ArrayBuffers, or data URLs. It uses an event-based API (`onload`, `onerror`) rather than Promises.

```ts
// Converting a FileList to an array
const input = document.querySelector('input[type="file"]') as HTMLInputElement;
const files: File[] = Array.from(input.files ?? []);

// File metadata
files.forEach((file) => {
  console.log(file.name);         // "photo.jpg"
  console.log(file.size);         // 2457600 (bytes)
  console.log(file.type);         // "image/jpeg"
  console.log(file.lastModified); // 1716681600000 (timestamp)
});
```

### FileReader vs URL.createObjectURL()

Both can generate something you can put in an `<img src>`, but they work very differently:

**`FileReader.readAsDataURL(file)`** reads the entire file into memory and produces a base64-encoded data URL string like `data:image/jpeg;base64,/9j/4AAQ...`. This string is the file's full contents encoded as text. For a 5 MB image, the data URL is roughly 6.7 MB of base64 text sitting in a JavaScript string.

**`URL.createObjectURL(file)`** does not read the file. It creates a short blob URL like `blob:http://localhost:5173/a1b2c3d4-e5f6-...` that points to the file data already in browser memory. It is instant, uses almost no additional memory, and is the correct choice for previews.

```ts
// WRONG -- reads entire file into a massive base64 string
const reader = new FileReader();
reader.onload = () => {
  const dataUrl = reader.result as string; // ~6.7 MB string for a 5 MB file
  img.src = dataUrl;
};
reader.readAsDataURL(file);

// CORRECT -- creates a lightweight reference URL, no data copying
const objectUrl = URL.createObjectURL(file); // "blob:http://localhost:5173/..."
img.src = objectUrl;

// You MUST revoke the URL when done to free the reference
URL.revokeObjectURL(objectUrl);
```

**When to use each:**

| Use case | Use |
|---|---|
| Image/video/audio preview | `URL.createObjectURL()` |
| Reading file as text (CSV, JSON) | `FileReader.readAsText()` or `file.text()` |
| Reading binary data for processing | `FileReader.readAsArrayBuffer()` or `file.arrayBuffer()` |
| Sending file contents inline (rare) | `FileReader.readAsDataURL()` |

Note that `File` inherits `text()` and `arrayBuffer()` from `Blob` -- these return Promises and are cleaner than `FileReader` for one-off reads:

```ts
// Modern alternative to FileReader for text files
const csvContent = await file.text();
const rows = csvContent.split('\n').map((row) => row.split(','));
```

### Memory Management

Object URLs create a mapping in the browser's memory that keeps the `Blob` alive even if no JavaScript variable references it. This is a memory leak if you never revoke them. The mapping persists until you call `URL.revokeObjectURL()` or the document is unloaded (page navigation or tab close).

In a single-page app like SvelteKit, "page navigation" via client-side routing does **not** unload the document. Object URLs created on one page survive navigation to another page. Always revoke them explicitly.

## File Input in Svelte 5

### The bind:value Trap

File inputs are special in HTML. For security reasons, you cannot set their value programmatically -- the browser forbids it to prevent scripts from reading arbitrary files. This means `bind:value` does not work on file inputs.

```svelte
<!-- WRONG -- bind:value does not work on file inputs -->
<script lang="ts">
  let file = $state('');
</script>

<!-- This will not update 'file' when the user picks a file.
     bind:value on <input type="file"> is meaningless because
     the value property is read-only for security reasons. -->
<input type="file" bind:value={file} />
```

Instead, use an `onchange` handler to read the `files` property from the input element:

```svelte
<!-- CORRECT -- use onchange to access the FileList -->
<script lang="ts">
  let selectedFile = $state<File | null>(null);

  function handleFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    selectedFile = input.files?.[0] ?? null;
  }
</script>

<input type="file" onchange={handleFileChange} />

{#if selectedFile}
  <p>Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</p>
{/if}
```

The `e.currentTarget` is the `<input>` element itself. Its `.files` property is a `FileList` (or `null` if nothing is selected). We grab the first file with `[0]`.

### Binding to the files Property

Svelte 5 does support `bind:files` on file inputs -- this binds to the `FileList` object directly:

```svelte
<script lang="ts">
  let files = $state<FileList | null>(null);

  let selectedFile = $derived(files?.[0] ?? null);
</script>

<!-- bind:files gives you the FileList directly -->
<input type="file" bind:files />

{#if selectedFile}
  <p>Selected: {selectedFile.name}</p>
{/if}
```

This is cleaner when you just need the `FileList`, but note that `files` is a `FileList` (not an array), and it becomes `null` when the input is cleared.

### Clearing a File Input Programmatically

There are two ways to clear a file input. Both are necessary depending on the situation:

```svelte
<script lang="ts">
  let fileInput: HTMLInputElement;
  let selectedFile = $state<File | null>(null);

  function handleFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    selectedFile = input.files?.[0] ?? null;
  }

  function clearFile() {
    selectedFile = null;

    // Reset the input element so the user can re-select the same file.
    // Without this, selecting the same file again would not trigger onchange
    // because the input's value hasn't changed from the browser's perspective.
    fileInput.value = '';
  }
</script>

<input type="file" bind:this={fileInput} onchange={handleFileChange} />

{#if selectedFile}
  <p>{selectedFile.name}</p>
  <button type="button" onclick={clearFile}>Remove</button>
{/if}
```

The `fileInput.value = ''` line is critical. If you only clear your state variable but do not reset the input element, the user cannot re-select the same file -- the browser sees the input's value as unchanged and skips the `change` event.

## Client-Side Preview

### Image Preview with Cleanup

Here is a complete image preview component using `$state` for the preview URL and `$effect` for automatic cleanup:

```svelte
<script lang="ts">
  let selectedFile = $state<File | null>(null);
  let previewUrl = $state<string | null>(null);

  // $effect automatically tracks 'selectedFile' and re-runs when it changes.
  // The return function runs on cleanup (before re-run or when the component unmounts).
  $effect(() => {
    if (!selectedFile) {
      previewUrl = null;
      return;
    }

    const url = URL.createObjectURL(selectedFile);
    previewUrl = url;

    // Cleanup: revoke the old URL to prevent memory leaks
    return () => {
      URL.revokeObjectURL(url);
    };
  });

  function handleFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    // Only accept images
    if (file && !file.type.startsWith('image/')) {
      alert('Please select an image file');
      input.value = '';
      return;
    }

    selectedFile = file;
  }
</script>

<div class="upload-area">
  <label for="photo">Choose a photo</label>
  <input
    id="photo"
    type="file"
    accept="image/*"
    onchange={handleFileChange}
  />

  {#if previewUrl}
    <div class="preview">
      <img src={previewUrl} alt="Preview of {selectedFile?.name}" />
      <p>{selectedFile?.name} -- {((selectedFile?.size ?? 0) / 1024).toFixed(1)} KB</p>
    </div>
  {/if}
</div>
```

The `$effect` cleanup pattern is essential here. When `selectedFile` changes (user picks a new file), the cleanup function from the previous run executes first, revoking the old object URL. When the component unmounts (user navigates away), cleanup runs one final time. No leaked memory.

### Multiple Image Previews

When handling multiple files, each file gets its own preview URL, and all must be tracked for cleanup:

```svelte
<script lang="ts">
  let selectedFiles = $state<File[]>([]);
  let previewUrls = $state<string[]>([]);

  $effect(() => {
    // Create URLs for all current files
    const urls = selectedFiles.map((file) => URL.createObjectURL(file));
    previewUrls = urls;

    // Cleanup: revoke ALL URLs from this batch
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  });

  function handleFilesChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const newFiles = Array.from(input.files ?? []);

    // Append to existing selection (not replace)
    selectedFiles = [...selectedFiles, ...newFiles];

    // Reset input so the same files can be added again
    input.value = '';
  }

  function removeFile(index: number) {
    selectedFiles = selectedFiles.filter((_, i) => i !== index);
  }
</script>

<input type="file" accept="image/*" multiple onchange={handleFilesChange} />

<div class="gallery">
  {#each previewUrls as url, i (selectedFiles[i].name + i)}
    <div class="thumbnail">
      <img src={url} alt="Preview {i + 1}" />
      <button
        type="button"
        onclick={() => removeFile(i)}
        aria-label="Remove {selectedFiles[i].name}"
      >
        Remove
      </button>
    </div>
  {/each}
</div>
```

### Video and Audio Preview

Object URLs work for any media type the browser supports. The pattern is identical -- only the HTML element changes:

```svelte
<script lang="ts">
  let mediaFile = $state<File | null>(null);
  let mediaUrl = $state<string | null>(null);
  let mediaType = $derived<'image' | 'video' | 'audio' | null>(
    mediaFile?.type.startsWith('image/') ? 'image' :
    mediaFile?.type.startsWith('video/') ? 'video' :
    mediaFile?.type.startsWith('audio/') ? 'audio' :
    null
  );

  $effect(() => {
    if (!mediaFile) {
      mediaUrl = null;
      return;
    }

    const url = URL.createObjectURL(mediaFile);
    mediaUrl = url;

    return () => URL.revokeObjectURL(url);
  });

  function handleFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    mediaFile = input.files?.[0] ?? null;
  }
</script>

<input
  type="file"
  accept="image/*,video/*,audio/*"
  onchange={handleFileChange}
/>

{#if mediaUrl && mediaType === 'image'}
  <img src={mediaUrl} alt="Preview" />
{:else if mediaUrl && mediaType === 'video'}
  <!-- controls attribute is essential for accessibility -->
  <video src={mediaUrl} controls>
    <track kind="captions" />
  </video>
{:else if mediaUrl && mediaType === 'audio'}
  <audio src={mediaUrl} controls></audio>
{/if}
```

## Client-Side Validation

Client-side file validation gives fast feedback before wasting bandwidth on a rejected upload. But it is strictly a UX improvement -- the server must always re-validate because every client-side check can be bypassed.

### File Type Validation

```svelte
<!-- WRONG -- trusting the file extension alone -->
<script lang="ts">
  function validateFile(file: File): string | null {
    // Extensions can be trivially faked by renaming a file.
    // A user could rename "malware.exe" to "malware.jpg"
    // and this check would pass.
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['jpg', 'png', 'gif'].includes(extension ?? '')) {
      return 'Invalid file type';
    }
    return null;
  }
</script>
```

```svelte
<!-- CORRECT -- check MIME type AND extension, but acknowledge limitations -->
<script lang="ts">
  const ALLOWED_TYPES = new Map([
    ['image/jpeg', ['.jpg', '.jpeg']],
    ['image/png', ['.png']],
    ['image/webp', ['.webp']],
    ['image/gif', ['.gif']]
  ]);

  function validateFileType(file: File): string | null {
    // Check MIME type
    if (!ALLOWED_TYPES.has(file.type)) {
      return `File type "${file.type || 'unknown'}" is not allowed. Use JPEG, PNG, WebP, or GIF.`;
    }

    // Check extension matches the MIME type
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    const allowedExtensions = ALLOWED_TYPES.get(file.type)!;

    if (!allowedExtensions.includes(extension)) {
      return `File extension "${extension}" does not match type "${file.type}".`;
    }

    // NOTE: The MIME type comes from the browser, which infers it from the
    // file's magic bytes or extension. It CAN be spoofed. The server MUST
    // re-validate by reading the file's actual magic bytes (file signature).
    // Client-side validation is a courtesy, not a security boundary.
    return null;
  }
</script>
```

### File Size Validation

```ts
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB in bytes

function validateFileSize(file: File): string | null {
  if (file.size > MAX_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return `File is ${sizeMB} MB. Maximum allowed is ${MAX_SIZE / (1024 * 1024)} MB.`;
  }

  // Also reject empty files -- a 0-byte file is almost always an error
  if (file.size === 0) {
    return 'File is empty.';
  }

  return null;
}
```

### Image Dimensions Validation

Checking image dimensions requires loading the image into an `Image` object, which is asynchronous:

```ts
function validateImageDimensions(
  file: File,
  maxWidth: number,
  maxHeight: number
): Promise<string | null> {
  return new Promise((resolve) => {
    // Only check dimensions for image files
    if (!file.type.startsWith('image/')) {
      resolve(null);
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      if (img.naturalWidth > maxWidth || img.naturalHeight > maxHeight) {
        resolve(
          `Image is ${img.naturalWidth}x${img.naturalHeight}px. ` +
          `Maximum allowed is ${maxWidth}x${maxHeight}px.`
        );
      } else {
        resolve(null);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve('Could not read image dimensions. The file may be corrupted.');
    };

    img.src = url;
  });
}
```

### Zod Schema for File Validation

You can use Zod to build a declarative file validation schema. Since `File` is a browser API, this schema is for client-side use only (server-side file validation uses different patterns, covered in lesson 2):

```ts
import { z } from 'zod';

const MAX_FILE_SIZE = 5_000_000; // 5 MB
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Schema for a single file
const imageFileSchema = z
  .instanceof(File, { message: 'Please select a file' })
  .refine((file) => file.size > 0, 'File is empty')
  .refine((file) => file.size <= MAX_FILE_SIZE, 'File must be under 5 MB')
  .refine(
    (file) => ACCEPTED_IMAGE_TYPES.includes(file.type),
    'File must be JPEG, PNG, or WebP'
  );

// Schema for multiple files
const multiFileSchema = z
  .array(imageFileSchema)
  .min(1, 'At least one file is required')
  .max(5, 'Maximum 5 files allowed')
  .refine(
    (files) => {
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      return totalSize <= 20_000_000; // 20 MB total
    },
    'Total upload size must be under 20 MB'
  );

// Usage
function validateFiles(files: File[]) {
  const result = multiFileSchema.safeParse(files);
  if (!result.success) {
    // result.error.issues contains all validation errors
    return result.error.issues.map((issue) => issue.message);
  }
  return [];
}
```

### Valibot Equivalent

Valibot provides a more tree-shakeable alternative:

```ts
import * as v from 'valibot';

const MAX_FILE_SIZE = 5_000_000;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const imageFileSchema = v.pipe(
  v.instance(File, 'Please select a file'),
  v.check((file) => file.size > 0, 'File is empty'),
  v.check((file) => file.size <= MAX_FILE_SIZE, 'File must be under 5 MB'),
  v.check(
    (file) => ACCEPTED_IMAGE_TYPES.includes(file.type),
    'File must be JPEG, PNG, or WebP'
  )
);

const multiFileSchema = v.pipe(
  v.array(imageFileSchema),
  v.minLength(1, 'At least one file is required'),
  v.maxLength(5, 'Maximum 5 files allowed'),
  v.check(
    (files) => files.reduce((sum, f) => sum.size + f.size, 0) <= 20_000_000,
    'Total upload size must be under 20 MB'
  )
);
```

### Combining All Validations

Here is a Svelte 5 component that runs all client-side checks before the user even attempts an upload:

```svelte
<script lang="ts">
  let files = $state<File[]>([]);
  let errors = $state<string[]>([]);

  const MAX_SIZE = 5_000_000;
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_FILES = 5;

  async function handleFiles(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const newFiles = Array.from(input.files ?? []);
    const validationErrors: string[] = [];

    // Check file count
    if (files.length + newFiles.length > MAX_FILES) {
      validationErrors.push(`Maximum ${MAX_FILES} files allowed`);
    }

    for (const file of newFiles) {
      // Check type
      if (!ALLOWED_TYPES.includes(file.type)) {
        validationErrors.push(`${file.name}: invalid type (${file.type || 'unknown'})`);
        continue;
      }

      // Check size
      if (file.size > MAX_SIZE) {
        const mb = (file.size / 1_000_000).toFixed(1);
        validationErrors.push(`${file.name}: too large (${mb} MB, max 5 MB)`);
        continue;
      }

      // Check dimensions (async)
      const dimError = await validateImageDimensions(file, 4096, 4096);
      if (dimError) {
        validationErrors.push(`${file.name}: ${dimError}`);
        continue;
      }

      // File passed all checks -- add it
      files = [...files, file];
    }

    errors = validationErrors;
    input.value = '';
  }
</script>

<input type="file" accept="image/*" multiple onchange={handleFiles} />

{#if errors.length > 0}
  <ul class="errors" role="alert">
    {#each errors as error}
      <li>{error}</li>
    {/each}
  </ul>
{/if}
```

## Drag and Drop

A drag-and-drop upload zone is a core UX pattern for file uploads. The HTML Drag and Drop API is powerful but has several non-obvious behaviors that you must handle correctly.

### The Events

Four events are relevant for file drops:

| Event | Fires when | Required action |
|---|---|---|
| `dragenter` | Something is dragged over the element | `e.preventDefault()` to allow drop |
| `dragover` | Continuously while dragging over the element | `e.preventDefault()` to allow drop |
| `dragleave` | The dragged item leaves the element | Remove visual feedback |
| `drop` | The item is dropped on the element | `e.preventDefault()`, read `e.dataTransfer.files` |

Both `dragenter` and `dragover` must call `e.preventDefault()`. Without this, the browser's default behavior is to navigate to the dropped file (opening it in a new page), and the `drop` event never fires.

### The Child Element Problem

The biggest gotcha with drag-and-drop is that `dragenter` and `dragleave` fire on **every child element** inside the drop zone. If your drop zone contains a paragraph and an icon, dragging over the paragraph fires `dragleave` on the drop zone (because you "left" it from the zone's perspective) and `dragenter` on the paragraph. This causes the visual feedback to flicker.

There are two solutions:

**Solution 1: Counter-based approach** -- Track the number of `dragenter` and `dragleave` events. Only remove the visual state when the counter reaches zero:

```svelte
<script lang="ts">
  let isDragOver = $state(false);
  let dragCounter = $state(0);
  let droppedFiles = $state<File[]>([]);

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    dragCounter++;
    isDragOver = true;
  }

  function handleDragOver(e: DragEvent) {
    // Must preventDefault to allow drop
    e.preventDefault();
  }

  function handleDragLeave(e: DragEvent) {
    dragCounter--;
    if (dragCounter === 0) {
      isDragOver = false;
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragCounter = 0;
    isDragOver = false;

    const files = Array.from(e.dataTransfer?.files ?? []);
    droppedFiles = [...droppedFiles, ...files];
  }
</script>

<div
  class="drop-zone"
  class:drag-over={isDragOver}
  role="button"
  tabindex="0"
  aria-label="Drop files here or click to select"
  ondragenter={handleDragEnter}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  {#if isDragOver}
    <p>Drop files here</p>
  {:else}
    <p>Drag files here or click to browse</p>
  {/if}
</div>

<style>
  .drop-zone {
    border: 2px dashed #d1d5db;
    border-radius: 12px;
    padding: 40px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.2s, background-color 0.2s;
  }

  .drop-zone.drag-over {
    border-color: #3498db;
    background-color: #eff6ff;
  }
</style>
```

**Solution 2: CSS `pointer-events: none` on children** -- Prevent child elements from receiving drag events entirely:

```svelte
<div
  class="drop-zone"
  class:drag-over={isDragOver}
  ondragenter={(e) => { e.preventDefault(); isDragOver = true; }}
  ondragover={(e) => e.preventDefault()}
  ondragleave={() => { isDragOver = false; }}
  ondrop={handleDrop}
>
  <!-- Children cannot intercept drag events -->
  <div class="drop-zone-content">
    <svg><!-- upload icon --></svg>
    <p>Drag files here</p>
  </div>
</div>

<style>
  .drop-zone-content {
    pointer-events: none; /* Children won't trigger dragenter/dragleave */
  }
</style>
```

The CSS approach is simpler but prevents children from being interactive (no buttons or links inside the drop zone). The counter approach is more robust for complex drop zones.

### Complete Drop Zone Component

Here is a production-ready drop zone that combines drag-and-drop with a fallback file input:

```svelte
<script lang="ts">
  let { onfiles }: { onfiles: (files: File[]) => void } = $props();

  let isDragOver = $state(false);
  let dragCounter = $state(0);
  let fileInput: HTMLInputElement;

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    dragCounter++;
    isDragOver = true;
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    // Set the drop effect to show a "copy" cursor
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  function handleDragLeave() {
    dragCounter--;
    if (dragCounter === 0) {
      isDragOver = false;
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragCounter = 0;
    isDragOver = false;

    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) {
      onfiles(files);
    }
  }

  function handleInputChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length > 0) {
      onfiles(files);
    }
    input.value = ''; // Allow re-selecting the same file
  }

  function handleClick() {
    fileInput.click();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  }
</script>

<!-- Hidden native file input as a fallback trigger -->
<input
  bind:this={fileInput}
  type="file"
  multiple
  accept="image/*"
  onchange={handleInputChange}
  class="sr-only"
  tabindex="-1"
  aria-hidden="true"
/>

<div
  class="drop-zone"
  class:drag-over={isDragOver}
  role="button"
  tabindex="0"
  aria-label="Upload area. Drag files here or press Enter to browse."
  onclick={handleClick}
  onkeydown={handleKeyDown}
  ondragenter={handleDragEnter}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <div class="drop-zone-inner">
    {#if isDragOver}
      <p class="drop-prompt">Release to upload</p>
    {:else}
      <p class="drop-prompt">Drag and drop files here</p>
      <p class="drop-hint">or click to browse</p>
    {/if}
  </div>
</div>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  .drop-zone {
    border: 2px dashed #d1d5db;
    border-radius: 12px;
    padding: 48px 24px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.2s, background-color 0.2s;
  }

  .drop-zone:focus-visible {
    outline: 2px solid #3498db;
    outline-offset: 2px;
  }

  .drop-zone.drag-over {
    border-color: #3498db;
    background-color: #eff6ff;
    border-style: solid;
  }

  .drop-zone-inner {
    pointer-events: none;
  }

  .drop-prompt {
    font-size: 1.1rem;
    font-weight: 600;
    color: #374151;
    margin: 0;
  }

  .drop-hint {
    font-size: 0.9rem;
    color: #6b7280;
    margin: 8px 0 0;
  }
</style>
```

## Multiple File Selection

### Managing a File List

When users can select multiple files, you need state management for the collection -- adding, removing, and displaying metadata:

```svelte
<script lang="ts">
  let files = $state<File[]>([]);

  let totalSize = $derived(
    files.reduce((sum, file) => sum + file.size, 0)
  );

  let totalSizeFormatted = $derived(
    totalSize < 1024
      ? `${totalSize} B`
      : totalSize < 1_048_576
        ? `${(totalSize / 1024).toFixed(1)} KB`
        : `${(totalSize / 1_048_576).toFixed(1)} MB`
  );

  function addFiles(newFiles: File[]) {
    // Prevent duplicates by checking name + size + lastModified
    const existing = new Set(
      files.map((f) => `${f.name}-${f.size}-${f.lastModified}`)
    );

    const unique = newFiles.filter(
      (f) => !existing.has(`${f.name}-${f.size}-${f.lastModified}`)
    );

    files = [...files, ...unique];
  }

  function removeFile(index: number) {
    files = files.filter((_, i) => i !== index);
  }

  function clearAll() {
    files = [];
  }

  function moveFile(fromIndex: number, toIndex: number) {
    const updated = [...files];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    files = updated;
  }
</script>

<div class="file-manager">
  <input
    type="file"
    multiple
    onchange={(e) => {
      const input = e.currentTarget as HTMLInputElement;
      addFiles(Array.from(input.files ?? []));
      input.value = '';
    }}
  />

  {#if files.length > 0}
    <div class="file-summary">
      <span>{files.length} file{files.length === 1 ? '' : 's'} selected</span>
      <span>{totalSizeFormatted} total</span>
      <button type="button" onclick={clearAll}>Clear all</button>
    </div>

    <ul class="file-list" role="list">
      {#each files as file, i (file.name + file.size + file.lastModified)}
        <li class="file-item">
          <span class="file-name">{file.name}</span>
          <span class="file-size">
            {(file.size / 1024).toFixed(1)} KB
          </span>
          <div class="file-actions">
            <button
              type="button"
              disabled={i === 0}
              onclick={() => moveFile(i, i - 1)}
              aria-label="Move {file.name} up"
            >
              Up
            </button>
            <button
              type="button"
              disabled={i === files.length - 1}
              onclick={() => moveFile(i, i + 1)}
              aria-label="Move {file.name} down"
            >
              Down
            </button>
            <button
              type="button"
              onclick={() => removeFile(i)}
              aria-label="Remove {file.name}"
            >
              Remove
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>
```

### The `multiple` Attribute

The `multiple` attribute on `<input type="file">` allows selecting multiple files in the native file picker. Without it, the user can only select one file at a time. With it, they can shift-click or ctrl-click to select many:

```svelte
<!-- Single file selection -->
<input type="file" />

<!-- Multiple file selection -->
<input type="file" multiple />

<!-- Multiple with type restriction -->
<input type="file" multiple accept="image/*,.pdf" />
```

The `accept` attribute controls what the file picker shows by default, but it is not a security measure -- users can switch to "All Files" in the picker and select anything. Always validate on the client and server.

## Progress Tracking with XMLHttpRequest

The `fetch()` API does not provide upload progress events. If you need to show a progress bar during upload, you must use `XMLHttpRequest`, which exposes the `upload.onprogress` event:

```svelte
<script lang="ts">
  let file = $state<File | null>(null);
  let progress = $state(0);
  let uploading = $state(false);
  let uploadResult = $state<'idle' | 'success' | 'error'>('idle');

  function handleFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    file = input.files?.[0] ?? null;
    progress = 0;
    uploadResult = 'idle';
  }

  function upload() {
    if (!file) return;

    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    // Track upload progress
    xhr.upload.onprogress = (e: ProgressEvent) => {
      if (e.lengthComputable) {
        // e.loaded = bytes sent so far
        // e.total = total bytes to send
        progress = Math.round((e.loaded / e.total) * 100);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        uploadResult = 'success';
      } else {
        uploadResult = 'error';
      }
      uploading = false;
    };

    xhr.onerror = () => {
      uploadResult = 'error';
      uploading = false;
    };

    uploading = true;
    progress = 0;
    xhr.open('POST', '/api/upload');
    xhr.send(formData);
  }
</script>

<input type="file" onchange={handleFileChange} />

{#if file}
  <button type="button" onclick={upload} disabled={uploading}>
    {uploading ? 'Uploading...' : 'Upload'}
  </button>
{/if}

{#if uploading}
  <div
    class="progress-bar"
    role="progressbar"
    aria-valuenow={progress}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-label="Upload progress"
  >
    <div class="progress-fill" style:width="{progress}%"></div>
  </div>
  <p class="progress-text">{progress}%</p>
{/if}

{#if uploadResult === 'success'}
  <p class="success" role="status">Upload complete!</p>
{:else if uploadResult === 'error'}
  <p class="error" role="alert">Upload failed. Please try again.</p>
{/if}

<style>
  .progress-bar {
    width: 100%;
    height: 8px;
    background: #e2e8f0;
    border-radius: 4px;
    overflow: hidden;
    margin: 12px 0 4px;
  }

  .progress-fill {
    height: 100%;
    background: #3498db;
    border-radius: 4px;
    transition: width 0.15s ease;
  }

  .progress-text {
    font-size: 0.85rem;
    color: #64748b;
    margin: 0;
  }
</style>
```

### Why Not fetch()?

The `fetch()` API's `Request` body is opaque once sent -- there is no event for "how many bytes have been transmitted." This is a deliberate design choice; `fetch` is built around streams and promises, not events. For **download** progress, you can read the response body as a `ReadableStream`:

```ts
// Download progress with fetch (NOT upload progress)
const response = await fetch('/api/large-file');
const contentLength = Number(response.headers.get('Content-Length'));
const reader = response.body!.getReader();

let received = 0;
const chunks: Uint8Array[] = [];

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  chunks.push(value);
  received += value.length;
  console.log(`Downloaded ${Math.round((received / contentLength) * 100)}%`);
}
```

But for upload progress -- showing users how much of their file has been sent -- `XMLHttpRequest` remains the only reliable browser API. This is one of the rare cases where the older API is genuinely more capable than the newer one.

### Wrapping XHR in a Promise

For cleaner async/await usage, wrap XMLHttpRequest in a Promise:

```ts
function uploadFile(
  file: File,
  url: string,
  onProgress?: (percent: number) => void
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      resolve({ status: xhr.status, body: xhr.responseText });
    };

    xhr.onerror = () => {
      reject(new Error('Network error during upload'));
    };

    xhr.open('POST', url);
    xhr.send(formData);
  });
}

// Usage
try {
  const result = await uploadFile(file, '/api/upload', (percent) => {
    progress = percent;
  });
  if (result.status === 200) {
    console.log('Upload succeeded:', result.body);
  }
} catch (err) {
  console.error('Upload failed:', err);
}
```

## Paste Upload

Users frequently screenshot something and paste it directly into an app. You can capture pasted images via the `paste` event and its `clipboardData.files` property. This is especially useful in chat apps, issue trackers, and rich text editors.

### Basic Paste Handler

```svelte
<script lang="ts">
  let pastedFile = $state<File | null>(null);
  let previewUrl = $state<string | null>(null);

  $effect(() => {
    if (!pastedFile) {
      previewUrl = null;
      return;
    }

    const url = URL.createObjectURL(pastedFile);
    previewUrl = url;

    return () => URL.revokeObjectURL(url);
  });

  function handlePaste(e: ClipboardEvent) {
    const files = Array.from(e.clipboardData?.files ?? []);

    // Clipboard files are typically images from screenshots
    const imageFile = files.find((f) => f.type.startsWith('image/'));

    if (imageFile) {
      e.preventDefault(); // Prevent the default paste behavior
      pastedFile = imageFile;
    }
    // If no image was found, let the default paste behavior proceed
    // (pasting text into an input, etc.)
  }
</script>

<!-- Paste anywhere in this container -->
<div onpaste={handlePaste}>
  <p>Paste an image from your clipboard (Ctrl+V / Cmd+V)</p>

  {#if previewUrl}
    <img src={previewUrl} alt="Pasted image" />
    <button type="button" onclick={() => { pastedFile = null; }}>
      Remove
    </button>
  {/if}

  <!-- Other form content -->
  <textarea placeholder="Type a message or paste an image..."></textarea>
</div>
```

### Svelte 5 Action for Paste Upload

Actions (`use:`) are a clean way to encapsulate DOM behavior. Here is a reusable paste upload action:

```ts
// src/lib/actions/paste-upload.ts

type PasteUploadOptions = {
  onpaste: (files: File[]) => void;
  accept?: string[]; // e.g., ['image/png', 'image/jpeg']
};

export function pasteUpload(node: HTMLElement, options: PasteUploadOptions) {
  function handlePaste(e: ClipboardEvent) {
    const allFiles = Array.from(e.clipboardData?.files ?? []);
    if (allFiles.length === 0) return;

    // Filter by accepted types if specified
    const acceptedFiles = options.accept
      ? allFiles.filter((f) => options.accept!.includes(f.type))
      : allFiles;

    if (acceptedFiles.length > 0) {
      e.preventDefault();
      options.onpaste(acceptedFiles);
    }
  }

  node.addEventListener('paste', handlePaste);

  return {
    update(newOptions: PasteUploadOptions) {
      options = newOptions;
    },
    destroy() {
      node.removeEventListener('paste', handlePaste);
    }
  };
}
```

```svelte
<!-- Usage in a component -->
<script lang="ts">
  import { pasteUpload } from '$lib/actions/paste-upload';

  let pastedFiles = $state<File[]>([]);

  function handlePastedFiles(files: File[]) {
    pastedFiles = [...pastedFiles, ...files];
  }
</script>

<div
  use:pasteUpload={{
    onpaste: handlePastedFiles,
    accept: ['image/png', 'image/jpeg', 'image/webp']
  }}
>
  <textarea placeholder="Paste images here..."></textarea>

  {#each pastedFiles as file, i}
    <p>{file.name || `pasted-image-${i + 1}`} ({(file.size / 1024).toFixed(1)} KB)</p>
  {/each}
</div>
```

Note that pasted images often have generic names like `image.png` because they come from the clipboard, not from a file system. You may want to generate meaningful names based on timestamp or context.

## Accessibility

File upload interfaces are frequently inaccessible. The native `<input type="file">` is keyboard-operable and screen-reader-friendly out of the box, but custom upload UIs (drag-and-drop zones, styled buttons) often break accessibility. Here is how to do it right.

### Labeling

Every file input needs an associated label. The native input already provides this through the standard `<label>` element:

```svelte
<!-- WRONG -- no label, screen reader announces "button" with no context -->
<input type="file" />

<!-- CORRECT -- label is associated via 'for' and 'id' -->
<label for="avatar-upload">Profile photo</label>
<input id="avatar-upload" type="file" accept="image/*" />

<!-- Also CORRECT -- wrapping label -->
<label>
  Profile photo
  <input type="file" accept="image/*" />
</label>
```

For custom drop zones that hide the native input, provide an `aria-label` and ensure the zone is focusable:

```svelte
<div
  class="drop-zone"
  role="button"
  tabindex="0"
  aria-label="Upload files. Drag and drop or press Enter to browse."
  onclick={openFilePicker}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openFilePicker();
    }
  }}
>
  <!-- visual content -->
</div>
```

### Announcing Upload Progress

Screen readers cannot see a progress bar filling up. Use `aria-live` regions to announce progress at meaningful intervals:

```svelte
<script lang="ts">
  let progress = $state(0);
  let statusMessage = $state('');

  // Announce at 25% intervals to avoid spamming the screen reader
  $effect(() => {
    if (progress === 0) {
      statusMessage = 'Upload starting...';
    } else if (progress === 25) {
      statusMessage = 'Upload 25% complete';
    } else if (progress === 50) {
      statusMessage = 'Upload 50% complete';
    } else if (progress === 75) {
      statusMessage = 'Upload 75% complete';
    } else if (progress === 100) {
      statusMessage = 'Upload complete!';
    }
  });
</script>

<!-- Progress bar for visual users -->
<div
  class="progress-bar"
  role="progressbar"
  aria-valuenow={progress}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-label="Upload progress"
>
  <div class="progress-fill" style:width="{progress}%"></div>
</div>

<!-- Live region for screen readers -->
<div class="sr-only" aria-live="polite" role="status">
  {statusMessage}
</div>
```

The `aria-live="polite"` attribute tells screen readers to announce changes to this element without interrupting the user's current activity. Use `"assertive"` only for critical errors that require immediate attention.

### Focus Management

When an upload completes or fails, move focus to a meaningful element so the user is not stranded:

```svelte
<script lang="ts">
  let successBanner: HTMLElement;
  let errorBanner: HTMLElement;

  function onUploadComplete(success: boolean) {
    if (success) {
      // Focus the success message after DOM update
      tick().then(() => successBanner?.focus());
    } else {
      tick().then(() => errorBanner?.focus());
    }
  }
</script>

{#if uploadSuccess}
  <div bind:this={successBanner} tabindex="-1" role="status" class="success">
    File uploaded successfully!
  </div>
{/if}

{#if uploadError}
  <div bind:this={errorBanner} tabindex="-1" role="alert" class="error">
    Upload failed: {uploadError}
  </div>
{/if}
```

`tabindex="-1"` makes the element focusable programmatically without adding it to the tab order.

### Accessible File List

When displaying selected files, use semantic list markup and provide enough context for each action:

```svelte
<ul role="list" aria-label="Selected files">
  {#each files as file, i}
    <li>
      <span>{file.name}</span>
      <span> -- {(file.size / 1024).toFixed(1)} KB</span>
      <button
        type="button"
        onclick={() => removeFile(i)}
        aria-label="Remove file {file.name}"
      >
        Remove
      </button>
    </li>
  {/each}
</ul>
```

Generic "Remove" buttons without `aria-label` force screen reader users to navigate backward to figure out which file the button belongs to. Always include the filename in the label.

### Keyboard Interaction Summary

| Action | Keyboard | Implementation |
|---|---|---|
| Open file picker | Enter or Space on drop zone | `onkeydown` handler |
| Navigate file list | Tab between items | Natural tab order |
| Remove a file | Enter or Space on Remove button | Native button behavior |
| Cancel upload | Escape (optional) | `onkeydown` on upload area |
| Drag and drop | Not keyboard-accessible | Always provide a file input fallback |

Drag and drop is inherently mouse-driven. Never make it the only way to upload files. Always pair it with a keyboard-accessible fallback (a visible file input or a button that triggers one).

## Try It

### Exercise 1: Avatar Upload with Preview and Validation

Build a single-file avatar upload component with the following requirements:

- File input that accepts only images (`image/jpeg`, `image/png`, `image/webp`)
- Maximum file size: 2 MB
- Maximum dimensions: 1024x1024 pixels
- Image preview using `URL.createObjectURL()` with proper cleanup via `$effect`
- Client-side error messages for type, size, and dimension violations
- A "Remove" button that clears the selection and resets the input
- Accessible: labeled input, `role="alert"` on errors, `alt` text on preview

### Exercise 2: Multi-File Drop Zone

Create a drop zone component that:

- Accepts up to 10 files via drag-and-drop or a fallback file input
- Shows visual feedback (border color change, background highlight) during drag
- Handles the child element flicker problem with the counter technique
- Displays a file list with name, size, and a remove button for each file
- Shows aggregate stats (file count and total size)
- Prevents duplicate files (same name + size + lastModified)
- Validates each file: images only, max 5 MB each, max 20 MB total
- Shows per-file error messages for rejected files

### Exercise 3: Paste-to-Upload with Progress

Build a chat-message-style input that:

- Accepts text input in a textarea
- Captures pasted images from the clipboard using a `use:pasteUpload` action
- Shows a preview of the pasted image below the textarea
- Includes a "Send" button that uploads the image via XHR with a progress bar
- Displays progress as both a visual bar and a percentage
- Announces progress to screen readers at 25% intervals
- Shows success/error state after upload completes
- Clears the pasted image and preview on successful upload

## Key Takeaways

- The `File` object extends `Blob` with `name`, `size`, `type`, and `lastModified` -- it is what every file input and drop event gives you
- Use `URL.createObjectURL()` for file previews, not `FileReader.readAsDataURL()` -- object URLs are instant and memory-efficient, but you must call `URL.revokeObjectURL()` to clean up
- `$effect` cleanup functions are the ideal place to revoke object URLs -- they run automatically when dependencies change or the component unmounts
- `bind:value` does not work on file inputs due to browser security restrictions -- use `onchange` with `e.currentTarget.files` or `bind:files`
- Clearing a file input requires setting `input.value = ''` on the DOM element, otherwise re-selecting the same file will not trigger `onchange`
- Client-side file validation (type, size, dimensions) is a UX improvement, not a security boundary -- MIME types can be spoofed, so the server must always re-validate
- Use both MIME type and extension checks on the client, but document that neither is trustworthy without server-side magic byte inspection
- The drag-and-drop child element problem (flickering `dragenter`/`dragleave`) is solved with either a counter variable or `pointer-events: none` on children
- Both `dragenter` and `dragover` handlers must call `e.preventDefault()` or the browser will navigate to the dropped file instead of firing the `drop` event
- `XMLHttpRequest` is the only browser API that provides upload progress -- `fetch()` does not support it; wrap XHR in a Promise for cleaner async code
- Paste upload via `clipboardData.files` enables screenshot-to-upload workflows; wrap it in a Svelte action (`use:pasteUpload`) for reusability
- Drag-and-drop is not keyboard accessible -- always provide a focusable file input or button as a fallback
- Use `aria-live="polite"` regions to announce upload progress to screen readers, and `role="progressbar"` with `aria-valuenow` on progress bars
- Zod's `z.instanceof(File).refine()` and Valibot's `v.instance(File)` create declarative, composable file validation schemas for client-side use
