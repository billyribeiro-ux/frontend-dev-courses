# Server-Side File Handling

In lesson 1, you built client-side file handling: selecting files, previewing images, drag-and-drop zones, and client-side validation. All of that improves user experience, but none of it protects your application. A malicious user can bypass every client-side check by opening the browser's DevTools, crafting a raw HTTP request, or using `curl`. Server-side file handling is where security actually lives.

This lesson covers the full server-side lifecycle of an uploaded file: receiving it in a SvelteKit form action, validating it with defense-in-depth, storing it safely, integrating with cloud storage, and managing file records over time. The patterns here apply whether you are building a profile photo uploader, a document management system, or a multi-file media gallery.

## How multipart/form-data Works

When a form includes `enctype="multipart/form-data"`, the browser does not URL-encode the data like a normal form submission. Instead, it constructs a multipart message where each field is separated by a **boundary** -- a unique string that does not appear in the data itself.

Here is what the raw HTTP request looks like when a user submits a form with a text field and a file:

```
POST /upload HTTP/1.1
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Length: 52834

------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="title"

My vacation photo
------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="file"; filename="beach.jpg"
Content-Type: image/jpeg

ÿØÿà..JFIF..... (raw binary data of the JPEG)
------WebKitFormBoundary7MA4YWxkTrZu0gW--
```

Each part has headers (`Content-Disposition`, `Content-Type`) followed by the raw content. The boundary string separates the parts, and the final boundary has a trailing `--` to signal the end.

**Why JSON cannot carry files**: JSON is a text-based format. Binary data (images, PDFs, executables) contains bytes that are not valid in JSON strings. You could Base64-encode the binary data, but that increases the payload size by approximately 33% and requires encoding/decoding on both ends. Multipart form data sends raw binary bytes directly, which is more efficient and is the web platform's native mechanism for file uploads.

In SvelteKit, when your form action calls `await request.formData()`, the framework parses this multipart message and gives you a `FormData` object. File fields come back as `File` objects (the same Web API `File` you use in the browser), while text fields come back as strings.

## Form Action File Upload

Let us build a complete file upload flow. The client component submits a file through a form, and the server action receives, validates, and stores it.

### The Page Component

```svelte
<!-- src/routes/upload/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();

  let uploading = $state(false);
  let selectedFile = $state<File | null>(null);

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    selectedFile = input.files?.[0] ?? null;
  }
</script>

<h1>Upload a File</h1>

{#if form?.success}
  <div class="success">
    <p>File uploaded successfully!</p>
    <p>Stored as: {form.filename}</p>
  </div>
{/if}

{#if form?.error}
  <div class="error">
    <p>{form.error}</p>
  </div>
{/if}

<form
  method="POST"
  enctype="multipart/form-data"
  use:enhance={() => {
    uploading = true;

    return async ({ update }) => {
      uploading = false;
      await update();
    };
  }}
>
  <label>
    Title
    <input name="title" required value={form?.title ?? ''} />
  </label>

  <label>
    File (max 5MB, images only)
    <input
      name="file"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      onchange={handleFileSelect}
      required
    />
  </label>

  {#if selectedFile}
    <p class="file-info">
      Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
    </p>
  {/if}

  <button type="submit" disabled={uploading}>
    {uploading ? 'Uploading...' : 'Upload'}
  </button>
</form>
```

The critical attribute is `enctype="multipart/form-data"`. Without it, the browser sends the file input's value as the filename string, not the file's binary content. This is a common mistake that results in receiving an empty or text-only field on the server.

### The Server Action

```typescript
// src/routes/upload/+page.server.ts
import { fail } from '@sveltejs/kit';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Actions } from './$types';

const MAX_FILE_SIZE = 5 * 1024 * 1024; -- 5MB in bytes
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const UPLOAD_DIR = 'uploads';

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const title = formData.get('title') as string;
    const file = formData.get('file') as File;

    // --- Server-side validation (never trust the client) ---

    if (!title || title.trim().length === 0) {
      return fail(400, { error: 'Title is required', title });
    }

    if (!file || file.size === 0) {
      return fail(400, { error: 'Please select a file', title });
    }

    if (file.size > MAX_FILE_SIZE) {
      return fail(400, {
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        title
      });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return fail(400, {
        error: `Invalid file type "${file.type}". Allowed: JPEG, PNG, WebP`,
        title
      });
    }

    // Validate magic bytes (covered in detail below)
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!validateMagicBytes(buffer, file.type)) {
      return fail(400, {
        error: 'File content does not match its declared type',
        title
      });
    }

    // Generate a safe filename
    const extension = getExtensionFromMime(file.type);
    const safeFilename = `${randomUUID()}${extension}`;
    const uploadPath = join(UPLOAD_DIR, safeFilename);

    // Ensure upload directory exists
    await mkdir(UPLOAD_DIR, { recursive: true });

    // Write the file
    await writeFile(uploadPath, buffer);

    return { success: true, filename: safeFilename, title };
  }
};

function getExtensionFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
  };
  return map[mime] ?? '.bin';
}
```

Notice that `formData.get('file')` returns a `File` object on the server -- the same Web API type you use in the browser. SvelteKit runs on a platform that supports Web standard APIs. The `File` has `.name`, `.size`, `.type`, and methods like `.arrayBuffer()`, `.text()`, and `.stream()`.

## Why Client-Side Validation Is Not Enough

This is a security principle that bears repeating: **client-side validation is a user experience feature, not a security feature**. Any check you perform in the browser can be bypassed.

**WRONG -- Trusting client-side validation alone:**

```svelte
<!-- This is UX, not security -->
<script lang="ts">
  function handleFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // These checks exist only in the browser
    if (file.size > 5 * 1024 * 1024) {
      alert('File too large!');
      input.value = '';
      return;
    }

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      alert('Only JPEG and PNG allowed!');
      input.value = '';
      return;
    }
  }
</script>

<input type="file" onchange={handleFile} />
```

```typescript
// +page.server.ts -- WRONG: assumes the client validated
export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    // No server-side checks! Trusting that the browser validated.
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(`uploads/${file.name}`, buffer); -- also uses raw filename!

    return { success: true };
  }
};
```

An attacker can send any file they want with `curl`:

```bash
curl -X POST http://localhost:5173/upload \
  -F "file=@malicious.exe;type=image/jpeg;filename=../../etc/passwd"
```

**CORRECT -- Re-validate everything on the server:**

```typescript
// +page.server.ts -- CORRECT: validates independently of the client
export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    // 1. Check file exists and has content
    if (!file || file.size === 0) {
      return fail(400, { error: 'No file provided' });
    }

    // 2. Check file size (server-enforced limit)
    if (file.size > 5 * 1024 * 1024) {
      return fail(400, { error: 'File exceeds 5MB limit' });
    }

    // 3. Check MIME type (but do not trust it completely)
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      return fail(400, { error: 'Only JPEG and PNG files allowed' });
    }

    // 4. Validate actual file content via magic bytes
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!validateMagicBytes(buffer, file.type)) {
      return fail(400, { error: 'File content does not match declared type' });
    }

    // 5. Generate safe filename (never use file.name)
    const safeFilename = `${randomUUID()}.${file.type === 'image/jpeg' ? 'jpg' : 'png'}`;

    // 6. Write to controlled directory
    await mkdir('uploads', { recursive: true });
    await writeFile(join('uploads', safeFilename), buffer);

    return { success: true, filename: safeFilename };
  }
};
```

Client-side validation prevents accidental mistakes (selecting the wrong file). Server-side validation prevents deliberate attacks. You need both.

## Magic Byte Validation

The MIME type in the `Content-Type` header is self-reported. The file extension is part of the filename, which is user-controlled. Neither can be trusted. The only way to verify what a file actually is: **read its first few bytes**.

Every file format starts with a characteristic sequence of bytes called a **magic number** or **file signature**. These signatures exist so that programs (and operating systems) can identify file types regardless of extension.

Common signatures:

| Format | Magic Bytes (hex)     | ASCII Representation |
|--------|-----------------------|----------------------|
| JPEG   | `FF D8 FF`            | `ÿØÿ`               |
| PNG    | `89 50 4E 47`         | `.PNG`               |
| GIF    | `47 49 46 38`         | `GIF8`               |
| PDF    | `25 50 44 46`         | `%PDF`               |
| ZIP    | `50 4B 03 04`         | `PK..`               |
| WebP   | `52 49 46 46` + `57 45 42 50` at offset 8 | `RIFF` + `WEBP` |

Here is a reusable validation utility:

```typescript
// src/lib/server/validate-magic-bytes.ts

type MagicSignature = {
  bytes: number[];
  offset?: number; -- default 0
};

const SIGNATURES: Record<string, MagicSignature[]> = {
  'image/jpeg': [
    { bytes: [0xff, 0xd8, 0xff] }
  ],
  'image/png': [
    { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }
  ],
  'image/gif': [
    { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }, -- GIF87a
    { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }  -- GIF89a
  ],
  'application/pdf': [
    { bytes: [0x25, 0x50, 0x44, 0x46] }
  ],
  'image/webp': [
    { bytes: [0x52, 0x49, 0x46, 0x46] }, -- RIFF header at offset 0
    { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 } -- WEBP at offset 8
  ]
};

export function validateMagicBytes(buffer: Buffer, declaredMime: string): boolean {
  const signatures = SIGNATURES[declaredMime];

  if (!signatures) {
    // Unknown MIME type -- cannot validate magic bytes.
    // Decide your policy: reject unknown types or allow them.
    return false;
  }

  // For types with multiple signatures (like GIF), any match is valid.
  // For types with offset-based signatures (like WebP), ALL must match.
  const hasOffsetSignatures = signatures.some((s) => s.offset !== undefined && s.offset > 0);

  if (hasOffsetSignatures) {
    // All signatures must match (e.g., WebP needs RIFF at 0 AND WEBP at 8)
    return signatures.every((sig) => matchesSignature(buffer, sig));
  }

  // Any signature can match (e.g., GIF87a or GIF89a)
  return signatures.some((sig) => matchesSignature(buffer, sig));
}

function matchesSignature(buffer: Buffer, signature: MagicSignature): boolean {
  const offset = signature.offset ?? 0;

  if (buffer.length < offset + signature.bytes.length) {
    return false; -- file too small to contain this signature
  }

  return signature.bytes.every((byte, index) => buffer[offset + index] === byte);
}
```

### Why This Matters for Security

Consider this attack: an attacker renames `malware.exe` to `profile.jpg` and sets the Content-Type to `image/jpeg`. Without magic byte validation:

1. Your MIME type check passes (it says `image/jpeg`)
2. Your extension check passes (`.jpg`)
3. The file is stored and potentially served to users
4. If a browser tries to render it as an image, it fails -- but if the file is served with the wrong Content-Type header or downloaded, the executable could be run

With magic byte validation, the first bytes of the file would not be `FF D8 FF` (the JPEG signature), so the upload is rejected before it ever reaches storage.

This is **defense in depth**: MIME check, extension check, and magic byte check together form three layers of validation. An attacker would need to craft a file that passes all three, which is significantly harder than bypassing any one.

## Local File Storage

When writing files to disk, the most dangerous mistake is using the user-supplied filename.

### Path Traversal Attacks

**WRONG -- Using the original filename:**

```typescript
// DANGEROUS -- path traversal vulnerability
export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    // An attacker sets filename to "../../src/hooks.server.ts"
    // This writes OUTSIDE your upload directory!
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(`uploads/${file.name}`, buffer);

    return { success: true };
  }
};
```

If `file.name` is `../../src/hooks.server.ts`, the resolved path becomes `src/hooks.server.ts`, overwriting a critical file in your application. If the attacker targets `../../.env`, they could overwrite your environment variables. This is a **path traversal attack**, and it is one of the most common file upload vulnerabilities.

**CORRECT -- Generate safe filenames, never use user input in paths:**

```typescript
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const UPLOAD_DIR = resolve('uploads'); -- resolve to absolute path

function getSafeFilePath(mime: string): { filename: string; filepath: string } {
  const extensions: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf'
  };

  const ext = extensions[mime] ?? '.bin';
  const filename = `${randomUUID()}${ext}`;
  const filepath = join(UPLOAD_DIR, filename);

  // Double-check the resolved path is inside UPLOAD_DIR
  // (belt-and-suspenders defense)
  if (!resolve(filepath).startsWith(UPLOAD_DIR)) {
    throw new Error('Path traversal detected');
  }

  return { filename, filepath };
}

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    // ... validation omitted for brevity ...

    const buffer = Buffer.from(await file.arrayBuffer());
    const { filename, filepath } = getSafeFilePath(file.type);

    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(filepath, buffer);

    return { success: true, filename };
  }
};
```

Key principles:

1. **Never use `file.name` in the storage path**. Generate a UUID or hash-based name.
2. **Derive the extension from the validated MIME type**, not from the original filename.
3. **Resolve the final path to an absolute path** and verify it starts with your upload directory.
4. **Store the original filename in the database** if you need it (for display or download purposes), but never use it for the file system path.

### Where to Store Uploaded Files

You have several options, each with trade-offs:

**`static/` directory** -- Files in SvelteKit's `static/` directory are served directly by the web server at the root path. A file at `static/uploads/photo.jpg` is accessible at `/uploads/photo.jpg`. This is simple but has problems:
- Files are publicly accessible to anyone with the URL
- The `static/` directory is typically committed to version control
- No access control is possible
- In serverless deployments, the filesystem is ephemeral

**External directory (e.g., `uploads/`)** -- A directory outside of `static/`, served through a custom `+server.ts` endpoint. This gives you access control (check authentication before serving) but requires writing a download endpoint. This is the approach we use for local development.

**Cloud storage (S3, R2, GCS)** -- The production-grade solution. Files live in a dedicated object storage service. Your server stores the reference (URL or key) in the database. This is the right choice for any application that will be deployed, as serverless environments do not have persistent local filesystems.

```typescript
// src/routes/files/[filename]/+server.ts
// Serving files from an external directory with access control
import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { RequestHandler } from './$types';

const UPLOAD_DIR = resolve('uploads');

export const GET: RequestHandler = async ({ params, locals }) => {
  // Access control -- only authenticated users can download
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }

  const filepath = resolve(join(UPLOAD_DIR, params.filename));

  // Prevent path traversal
  if (!filepath.startsWith(UPLOAD_DIR)) {
    throw error(400, 'Invalid filename');
  }

  try {
    const fileBuffer = await readFile(filepath);

    // Determine Content-Type from extension
    const contentType = getContentType(params.filename);

    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${params.filename}"`,
        'Cache-Control': 'private, max-age=3600'
      }
    });
  } catch {
    throw error(404, 'File not found');
  }
};

function getContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    pdf: 'application/pdf',
    gif: 'image/gif'
  };
  return types[ext ?? ''] ?? 'application/octet-stream';
}
```

## Cloud Storage with Presigned URLs

For production applications, uploading files directly to cloud storage from the browser is the standard pattern. Your server never handles the file bytes -- it only authorizes the upload by generating a **presigned URL**.

### The Presigned URL Pattern

```
1. Client selects a file
2. Client asks YOUR server: "I want to upload beach.jpg (2.3MB, image/jpeg)"
3. Your server validates the request and generates a presigned PUT URL
4. Your server returns the presigned URL to the client
5. Client uploads the file DIRECTLY to cloud storage using the presigned URL
6. Client notifies your server: "Upload complete, here is the key"
7. Your server stores the file metadata in the database
```

This pattern has significant advantages:
- **No server bandwidth cost** -- the file goes directly from the browser to cloud storage
- **No server memory pressure** -- a 500MB video never touches your server's RAM
- **No upload timeout risk** -- your server responds in milliseconds (just generating a URL), and the long upload happens directly to the cloud
- **Scales to any file size** -- your server does not care if the file is 1KB or 5GB
- **Works with serverless** -- no persistent filesystem needed

### Server Endpoint: Generating Presigned URLs

```typescript
// src/routes/api/upload-url/+server.ts
import { json, error } from '@sveltejs/kit';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const s3 = new S3Client({
  region: 'auto',
  endpoint: env.S3_ENDPOINT,  -- e.g., https://<account>.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY
  }
});

const BUCKET = env.S3_BUCKET;
const MAX_FILE_SIZE = 10 * 1024 * 1024; -- 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }

  const { filename, contentType, size } = await request.json();

  // Validate the upload request
  if (!filename || !contentType || !size) {
    throw error(400, 'Missing filename, contentType, or size');
  }

  if (size > MAX_FILE_SIZE) {
    throw error(400, `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  if (!ALLOWED_TYPES.includes(contentType)) {
    throw error(400, `File type "${contentType}" is not allowed`);
  }

  // Generate a unique key -- never use the original filename
  const extension = filename.split('.').pop()?.toLowerCase() ?? 'bin';
  const key = `uploads/${locals.user.id}/${randomUUID()}.${extension}`;

  // Generate the presigned PUT URL
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: size,
    Metadata: {
      'original-filename': filename,
      'uploaded-by': String(locals.user.id)
    }
  });

  const presignedUrl = await getSignedUrl(s3, command, {
    expiresIn: 300 -- URL expires in 5 minutes
  });

  return json({ presignedUrl, key });
};
```

### Client-Side: Uploading to the Presigned URL

```svelte
<!-- src/routes/upload-cloud/+page.svelte -->
<script lang="ts">
  let selectedFile = $state<File | null>(null);
  let uploadProgress = $state(0);
  let uploading = $state(false);
  let uploadResult = $state<{ success: boolean; message: string } | null>(null);

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    selectedFile = input.files?.[0] ?? null;
    uploadResult = null;
  }

  async function uploadFile() {
    if (!selectedFile) return;

    uploading = true;
    uploadProgress = 0;

    try {
      // Step 1: Request a presigned URL from our server
      const urlResponse = await fetch('/api/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: selectedFile.name,
          contentType: selectedFile.type,
          size: selectedFile.size
        })
      });

      if (!urlResponse.ok) {
        const err = await urlResponse.json();
        throw new Error(err.message ?? 'Failed to get upload URL');
      }

      const { presignedUrl, key } = await urlResponse.json();

      // Step 2: Upload the file directly to cloud storage
      const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': selectedFile.type
        },
        body: selectedFile -- the File object is sent directly as the body
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload to cloud storage failed');
      }

      // Step 3: Notify our server that the upload is complete
      const confirmResponse = await fetch('/api/upload-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          originalFilename: selectedFile.name,
          contentType: selectedFile.type,
          size: selectedFile.size
        })
      });

      if (!confirmResponse.ok) {
        throw new Error('Failed to confirm upload');
      }

      uploadResult = { success: true, message: 'File uploaded successfully!' };
    } catch (err) {
      uploadResult = {
        success: false,
        message: err instanceof Error ? err.message : 'Upload failed'
      };
    } finally {
      uploading = false;
    }
  }
</script>

<h1>Cloud Upload</h1>

<input type="file" onchange={handleFileSelect} accept="image/*,.pdf" />

{#if selectedFile}
  <p>Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</p>
  <button onclick={uploadFile} disabled={uploading}>
    {uploading ? 'Uploading...' : 'Upload'}
  </button>
{/if}

{#if uploadResult}
  <p class={uploadResult.success ? 'success' : 'error'}>
    {uploadResult.message}
  </p>
{/if}
```

### Tracking Upload Progress with XMLHttpRequest

The `fetch` API does not natively support upload progress tracking. If you need a progress bar, use `XMLHttpRequest`:

```typescript
function uploadWithProgress(url: string, file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        uploadProgress = Math.round((event.loaded / event.total) * 100);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed')));

    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}
```

### Cloudflare R2 Note

Cloudflare R2 is S3-compatible, meaning the same `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` packages work without modification. The primary advantages of R2 over S3 are zero egress fees (you are not charged for serving files to users) and global distribution. The only change is the endpoint URL:

```typescript
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY
  }
});
```

Everything else -- presigned URLs, PutObjectCommand, GetObjectCommand -- works identically.

## Streaming Uploads

When a file must pass through your server (for processing, virus scanning, or environments where presigned URLs are not available), you have two approaches:

### Buffered: Load Entire File Into Memory

```typescript
// Loads the ENTIRE file into server memory at once
export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    // This allocates file.size bytes of RAM
    const buffer = Buffer.from(await file.arrayBuffer());

    await writeFile('uploads/output.bin', buffer);
    return { success: true };
  }
};
```

For a 100MB file, this allocates 100MB of RAM. For 10 concurrent uploads, that is 1GB. On a serverless function with 256MB of memory, even a single large upload causes an out-of-memory crash.

### Streamed: Process Without Full Buffering

```typescript
// src/routes/upload-stream/+page.server.ts
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

const UPLOAD_DIR = 'uploads';

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file || file.size === 0) {
      return fail(400, { error: 'No file provided' });
    }

    const safeFilename = `${randomUUID()}.bin`;
    await mkdir(UPLOAD_DIR, { recursive: true });
    const outputPath = join(UPLOAD_DIR, safeFilename);

    // Convert the Web ReadableStream to a Node.js Readable stream
    const webStream = file.stream();
    const nodeReadable = Readable.fromWeb(webStream);

    // Pipe directly to disk without holding the entire file in memory
    const writeStream = createWriteStream(outputPath);
    await pipeline(nodeReadable, writeStream);

    return { success: true, filename: safeFilename };
  }
};
```

The `pipeline` function handles backpressure correctly: if the disk write is slow, it slows down reading from the network, preventing memory from growing unboundedly.

### When to Use Each Approach

| Approach | Use When |
|----------|----------|
| **Buffered** (`arrayBuffer()`) | Files under 10MB, you need to inspect the full content (magic bytes, image processing), or simplicity matters more than memory efficiency |
| **Streamed** (`stream()` + `pipeline`) | Files over 10MB, many concurrent uploads, serverless environments with limited memory, or when piping to another destination (cloud storage, processing pipeline) |
| **Presigned URLs** | Files of any size in production -- the file never touches your server at all |

A practical middle ground: buffer the first few kilobytes for magic byte validation, then stream the rest:

```typescript
async function validateAndStream(
  file: File,
  outputPath: string
): Promise<boolean> {
  const reader = file.stream().getReader();

  // Read first chunk for validation
  const { value: firstChunk } = await reader.read();
  if (!firstChunk) return false;

  const headerBuffer = Buffer.from(firstChunk);
  if (!validateMagicBytes(headerBuffer, file.type)) {
    reader.cancel();
    return false;
  }

  // Stream the rest (including first chunk) to disk
  const writeStream = createWriteStream(outputPath);
  writeStream.write(headerBuffer);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    writeStream.write(Buffer.from(value));
  }

  writeStream.end();

  // Wait for the write stream to finish
  await new Promise<void>((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  return true;
}
```

## File Metadata and Database Records

Storing a file on disk or in cloud storage is only half the job. You need a database record that tracks the file's metadata, ownership, and location. Without this, you cannot list a user's files, enforce access control, or clean up orphaned files.

### Drizzle Schema

```typescript
// src/lib/server/db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull().unique()
});

export const files = sqliteTable('files', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull().unique(), -- the UUID filename or cloud key
  originalName: text('original_name').notNull(),      -- what the user called it
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),                     -- bytes
  storageType: text('storage_type').notNull(),         -- 'local' | 's3' | 'r2'
  url: text('url'),                                    -- public URL if applicable
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  deletedAt: text('deleted_at')                        -- soft delete support
});
```

### The Upload-Store-Record Pattern

Every file upload should follow this three-step pattern atomically:

```typescript
// src/routes/upload/+page.server.ts
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { files } from '$lib/server/db/schema';
import { writeFile, mkdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateMagicBytes } from '$lib/server/validate-magic-bytes';
import type { Actions } from './$types';

const UPLOAD_DIR = resolve('uploads');
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const actions: Actions = {
  default: async ({ request, locals }) => {
    if (!locals.user) {
      return fail(401, { error: 'Authentication required' });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    // --- Validation ---
    if (!file || file.size === 0) {
      return fail(400, { error: 'No file selected' });
    }

    if (file.size > MAX_FILE_SIZE) {
      return fail(400, { error: 'File exceeds 5MB limit' });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return fail(400, { error: 'File type not allowed' });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!validateMagicBytes(buffer, file.type)) {
      return fail(400, { error: 'File content does not match type' });
    }

    // --- Storage ---
    const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
    const storageKey = `${randomUUID()}.${ext}`;
    const filepath = join(UPLOAD_DIR, storageKey);

    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(filepath, buffer);

    // --- Database record ---
    try {
      const [record] = await db
        .insert(files)
        .values({
          userId: locals.user.id,
          storageKey,
          originalName: file.name,
          mimeType: file.type,
          size: file.size,
          storageType: 'local'
        })
        .returning();

      return {
        success: true,
        file: {
          id: record.id,
          name: record.originalName,
          size: record.size
        }
      };
    } catch (err) {
      // If DB insert fails, clean up the stored file
      await unlink(filepath).catch(() => {}); -- ignore cleanup errors
      return fail(500, { error: 'Failed to save file record' });
    }
  }
};
```

Notice the error handling: if the database insert fails after the file has been written, we delete the orphaned file. This is a simple form of compensating transaction. In production with cloud storage, you might instead run a periodic cleanup job that deletes files with no matching database record.

### Confirm Endpoint for Presigned URL Uploads

When using presigned URLs, the confirm step creates the database record after the client has uploaded directly to cloud storage:

```typescript
// src/routes/api/upload-confirm/+server.ts
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { files } from '$lib/server/db/schema';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const s3 = new S3Client({
  region: 'auto',
  endpoint: env.S3_ENDPOINT,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY
  }
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }

  const { key, originalFilename, contentType, size } = await request.json();

  // Verify the file actually exists in cloud storage
  // (prevents a client from claiming to upload without actually doing so)
  try {
    await s3.send(new HeadObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key
    }));
  } catch {
    throw error(400, 'File not found in storage. Upload may have failed.');
  }

  // Create the database record
  const [record] = await db
    .insert(files)
    .values({
      userId: locals.user.id,
      storageKey: key,
      originalName: originalFilename,
      mimeType: contentType,
      size,
      storageType: 'r2',
      url: `${env.CDN_URL}/${key}`
    })
    .returning();

  return json({ id: record.id, url: record.url });
};
```

## Signed Download URLs

For private files that should only be accessible to authorized users, generate **time-limited signed URLs** on demand. The user never gets a permanent link -- they get a URL that expires after a set period.

```typescript
// src/routes/api/files/[id]/download/+server.ts
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { files } from '$lib/server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const s3 = new S3Client({
  region: 'auto',
  endpoint: env.S3_ENDPOINT,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY
  }
});

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }

  const fileId = Number(params.id);
  if (isNaN(fileId)) {
    throw error(400, 'Invalid file ID');
  }

  // Fetch the file record and verify ownership
  const [fileRecord] = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, fileId),
        eq(files.userId, locals.user.id),
        isNull(files.deletedAt) -- respect soft deletes
      )
    );

  if (!fileRecord) {
    throw error(404, 'File not found');
  }

  // Generate a signed URL that expires in 1 hour
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: fileRecord.storageKey,
    ResponseContentDisposition: `attachment; filename="${fileRecord.originalName}"`
  });

  const signedUrl = await getSignedUrl(s3, command, {
    expiresIn: 3600 -- 1 hour
  });

  // Redirect the user to the signed URL
  return new Response(null, {
    status: 302,
    headers: { Location: signedUrl }
  });
};
```

The `ResponseContentDisposition` header tells the browser to download the file with the original filename. The URL itself contains a signature that S3/R2 verifies -- if someone tampers with the URL parameters or the expiry time passes, the request is rejected.

### Using Signed URLs in Components

```svelte
<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<h1>Your Files</h1>

<ul>
  {#each data.files as file}
    <li>
      <span>{file.originalName} ({(file.size / 1024).toFixed(1)} KB)</span>
      <a href="/api/files/{file.id}/download">Download</a>
    </li>
  {/each}
</ul>
```

The download link points to your server endpoint, which checks authorization and then redirects to the signed cloud URL. The user never sees the raw cloud storage URL in the page source.

## Cleanup and Lifecycle

Files accumulate. Without a cleanup strategy, your storage costs grow indefinitely and orphaned files waste space.

### Deleting Files When Records Are Deleted

```typescript
// src/routes/api/files/[id]/+server.ts
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { files } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const s3 = new S3Client({
  region: 'auto',
  endpoint: env.S3_ENDPOINT,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY
  }
});

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }

  const fileId = Number(params.id);

  // Fetch the file record (verify ownership)
  const [fileRecord] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.userId, locals.user.id)));

  if (!fileRecord) {
    throw error(404, 'File not found');
  }

  // Delete from storage
  if (fileRecord.storageType === 'local') {
    const filepath = join(resolve('uploads'), fileRecord.storageKey);
    await unlink(filepath).catch(() => {}); -- file may already be gone
  } else {
    await s3.send(new DeleteObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: fileRecord.storageKey
    }));
  }

  // Delete the database record
  await db.delete(files).where(eq(files.id, fileId));

  return json({ success: true });
};
```

### Soft Deletes

For applications where accidental deletion is a concern, use soft deletes: set a `deletedAt` timestamp instead of actually removing the record. A scheduled job can permanently delete soft-deleted records (and their files) after a retention period:

```typescript
// Soft delete -- mark as deleted
await db
  .update(files)
  .set({ deletedAt: new Date().toISOString() })
  .where(eq(files.id, fileId));

// Hard delete -- run periodically (cron job, scheduled function)
import { lt } from 'drizzle-orm';

async function cleanupDeletedFiles() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Find files soft-deleted more than 30 days ago
  const expiredFiles = await db
    .select()
    .from(files)
    .where(lt(files.deletedAt, thirtyDaysAgo));

  for (const file of expiredFiles) {
    // Delete from storage
    if (file.storageType === 'local') {
      await unlink(join(resolve('uploads'), file.storageKey)).catch(() => {});
    } else {
      await s3.send(new DeleteObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: file.storageKey
      }));
    }

    // Delete the database record permanently
    await db.delete(files).where(eq(files.id, file.id));
  }

  console.log(`Cleaned up ${expiredFiles.length} expired files`);
}
```

### Orphaned File Cleanup

Orphaned files are files that exist in storage but have no corresponding database record. They can be created by failed uploads (file written but DB insert failed), bugs, or manual database edits. A periodic cleanup job finds and removes them:

```typescript
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';

async function cleanupOrphanedFiles() {
  const UPLOAD_DIR = resolve('uploads');
  const filesOnDisk = await readdir(UPLOAD_DIR);

  for (const filename of filesOnDisk) {
    // Check if a database record exists for this file
    const [record] = await db
      .select({ id: files.id })
      .from(files)
      .where(eq(files.storageKey, filename))
      .limit(1);

    if (!record) {
      console.log(`Orphaned file found: ${filename}`);
      await unlink(join(UPLOAD_DIR, filename));
    }
  }
}
```

For cloud storage, you can list objects in the bucket and compare against database records. Most cloud providers offer lifecycle policies that can auto-delete objects after a set period, which serves as a safety net.

## Security Checklist

Every file upload system should address these concerns. Use this as a review checklist before shipping:

### Size Limits

- [ ] **Client-side size check** -- reject oversized files before upload begins (UX)
- [ ] **Server-side size check** -- reject oversized files in the form action (security)
- [ ] **Reverse proxy limit** -- configure your web server (nginx, Cloudflare) to reject oversized request bodies before they reach your application (`client_max_body_size` in nginx, upload size limit in Cloudflare)

### Type Validation

- [ ] **Client `accept` attribute** -- guide users to select correct file types (UX)
- [ ] **Server MIME type check** -- verify `file.type` against an allowlist (first defense)
- [ ] **Magic byte validation** -- verify actual file content matches the declared type (second defense)
- [ ] **Extension derivation from MIME** -- never trust the user-provided extension; derive it from the validated MIME type

### Filename and Path Safety

- [ ] **Never use `file.name` in storage paths** -- always generate filenames (UUID, hash)
- [ ] **Path traversal prevention** -- resolve the final path and verify it is within the upload directory
- [ ] **Store original filename in database only** -- for display and download purposes

### Access Control

- [ ] **Authentication required** -- reject unauthenticated upload attempts
- [ ] **Authorization check on download** -- verify the requesting user has permission to access the file
- [ ] **Signed URLs for private files** -- time-limited access URLs instead of permanent links
- [ ] **CORS configuration for presigned URLs** -- cloud storage buckets must have CORS configured to allow uploads from your domain

```json
// Example R2/S3 CORS configuration
[
  {
    "AllowedOrigins": ["https://yourdomain.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

### Infrastructure

- [ ] **Rate limiting** -- limit the number of uploads per user per time period to prevent abuse
- [ ] **Virus/malware scanning** -- for applications that accept documents or executables, integrate a scanning service (ClamAV, AWS GuardDuty, Cloudflare's built-in scanning) before making files available to other users
- [ ] **Content-Disposition header** -- when serving files, set `Content-Disposition: attachment` for downloads to prevent browsers from executing potentially malicious content inline
- [ ] **Separate domain for user content** -- serve user-uploaded files from a different domain (e.g., `uploads.yourdomain.com`) to prevent XSS attacks from affecting your main application's cookies and session
- [ ] **Storage quotas** -- limit total storage per user to prevent a single user from consuming all your storage budget

### Monitoring

- [ ] **Log upload events** -- who uploaded what, when, from what IP
- [ ] **Alert on anomalies** -- sudden spikes in upload volume, unusually large files, or repeated failed validation attempts
- [ ] **Track storage usage** -- monitor total storage consumed and per-user consumption

## Try It Exercises

### Exercise 1: Secure Document Upload

Build a document upload form that accepts PDF and Word documents (`.pdf`, `.docx`). Implement the full server-side validation pipeline:

1. Create a `+page.svelte` with a file input that accepts `.pdf,.docx` and uses `use:enhance`
2. Create a `+page.server.ts` action that:
   - Validates file size (max 10MB)
   - Checks MIME type against `application/pdf` and `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
   - Validates magic bytes (PDF: `25 50 44 46`, DOCX/ZIP: `50 4B 03 04`)
   - Generates a UUID-based filename with the correct extension
   - Writes the file to an `uploads/` directory
3. Return the stored filename and original name to the page and display them

**Stretch goal**: Add the magic byte signatures for DOCX to your `validate-magic-bytes.ts` utility. Note that `.docx` files are actually ZIP archives, so the magic bytes are the ZIP signature `50 4B 03 04`.

### Exercise 2: File Gallery with Metadata

Build a file gallery page that displays uploaded images with their metadata:

1. Create the `files` table schema in Drizzle (as shown in this lesson)
2. Modify your upload action to insert a record into the `files` table after writing the file
3. Create a `load` function that queries all files for the current user, ordered by `createdAt` descending
4. Display the files in a grid showing: thumbnail (for images), original filename, file size, upload date
5. Add a delete button for each file that:
   - Calls a named action (`?/delete`) with the file ID
   - Deletes both the file from disk and the record from the database
   - Uses `use:enhance` for a smooth experience

**Stretch goal**: Add soft delete support. Instead of immediately removing the file, set `deletedAt`. Show a "Recently Deleted" section with a "Restore" button and a "Permanently Delete" button.

### Exercise 3: Presigned URL Upload with Progress

Build a cloud upload component using the presigned URL pattern:

1. Create the `/api/upload-url` endpoint that generates presigned PUT URLs (you can use a local MinIO instance or Cloudflare R2 free tier for testing)
2. Create the `/api/upload-confirm` endpoint that verifies the upload and creates a database record
3. Build a client component that:
   - Requests a presigned URL
   - Uploads directly to storage with progress tracking (using `XMLHttpRequest`)
   - Shows a progress bar during upload
   - Confirms the upload with your server
4. Handle error states: what happens if the presigned URL generation fails? What if the upload to storage fails? What if the confirm step fails?

**Stretch goal**: Implement retry logic with exponential backoff for the cloud storage upload step. If the upload fails, retry up to 3 times with increasing delays (1s, 2s, 4s).

## Key Takeaways

1. **Client-side validation is UX; server-side validation is security.** Always re-validate file type, size, and content on the server. An attacker with `curl` bypasses every client-side check.

2. **Magic bytes are your best defense against file type spoofing.** Checking the first few bytes of a file reveals its true type regardless of extension or MIME header. Implement this for every file upload endpoint.

3. **Never use `file.name` in storage paths.** Generate filenames from UUIDs or content hashes. Derive extensions from validated MIME types. Always verify the resolved path is inside your upload directory.

4. **The presigned URL pattern is the production standard for file uploads.** Your server generates a signed URL, the client uploads directly to cloud storage, and your server records the metadata. This eliminates bandwidth, memory, and timeout concerns.

5. **Store file metadata in the database alongside the file.** The database record (original name, MIME type, size, storage key, user ID, timestamps) is what makes files queryable, access-controlled, and manageable over time.

6. **Plan for the full lifecycle: upload, serve, and delete.** Orphaned files waste storage. Stale signed URLs create confusion. Soft deletes protect against accidents. A cleanup strategy is not optional -- it is part of the feature.

7. **Defense in depth applies to file uploads more than almost any other feature.** Layer MIME checks, magic byte validation, size limits, filename sanitization, path traversal prevention, access control, and CORS configuration. No single check is sufficient.
