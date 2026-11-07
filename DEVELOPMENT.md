# Development Guide

## Architecture Overview

### Client-Side AI Processing

The application uses `@huggingface/transformers` to run the Xenova/modnet model entirely in the browser:

1. **Model Loading**: On first use, the model is downloaded from Hugging Face CDN (~30MB)
2. **WebGPU/WASM**: Attempts to use WebGPU for acceleration, falls back to WebAssembly
3. **Image Processing**: Each image is processed through the segmentation pipeline
4. **Mask Application**: The AI-generated mask is applied to create transparency

### Key Technologies

#### Astro.js

- Static site generation for optimal performance
- Component-based architecture
- Built-in optimization (image optimization, CSS minification, etc.)

#### Tailwind CSS v4

- Native CSS implementation (no PostCSS required)
- Custom design tokens via `@theme` directive
- Vite plugin integration

#### Hugging Face Transformers

- Browser-based ML inference
- ONNX Runtime for WebAssembly execution
- WebGPU support for hardware acceleration

## Project Structure

```
src/
├── components/
│   ├── Header.astro          # Top navigation with privacy badge
│   └── Footer.astro          # Footer with features and credits
├── layouts/
│   └── Layout.astro          # Base HTML layout
├── pages/
│   └── index.astro           # Main application page
└── styles/
    └── global.css            # Tailwind + design tokens
```

## Design System

### Color Palette

Following Vercel's monochrome aesthetic:

- **Ink** (#171717): Primary text and CTA backgrounds
- **Canvas** (#ffffff): Card and modal backgrounds
- **Canvas Soft** (#fafafa): Page background
- **Body** (#4d4d4d): Secondary text
- **Mute** (#888888): Tertiary text
- **Hairline** (#ebebeb): Borders and dividers
- **Link** (#0070f3): Links and success states

### Typography

- **Font Family**: Inter (400, 500, 600 weights)
- **Display**: 48px, 600 weight, -2.4px tracking
- **Body**: 16px, 400 weight
- **Small**: 14px, 400 weight

### Spacing

4px base unit with tokens:

- xxs: 4px
- xs: 8px
- sm: 12px
- md: 16px
- lg: 24px
- xl: 32px
- 2xl: 40px
- 3xl: 48px
- 4xl: 64px
- 5xl: 96px

### Border Radius

- sm: 6px (buttons, inputs)
- md: 8px (cards)
- lg: 12px (large cards)
- pill: 100px (CTA buttons)
- full: 9999px (circular elements)

## Component Patterns

### Upload Zone

Drag-and-drop area with:

- Visual feedback on hover/drag
- File type validation
- Multiple file support
- Click-to-browse fallback

### Image Card

Before/after comparison with:

- Split view (original | processed)
- Checkered background for transparency
- Individual download button
- Hover effects

### Progress Indicator

Shows batch processing progress:

- Current/total count
- Animated progress bar
- Auto-hide on completion

## Performance Optimizations

### Model Caching

The AI model is cached by the browser after first download:

- Stored in IndexedDB via Transformers.js
- Subsequent loads are instant
- ~30MB storage requirement

### Image Processing

- Sequential processing to avoid memory issues
- Canvas-based manipulation for efficiency
- Blob URLs for memory management
- Automatic cleanup of object URLs

### Build Optimizations

- Static site generation (no server required)
- Automatic code splitting
- CSS minification
- Asset optimization

## Browser Compatibility

### WebGPU Support

Best performance with WebGPU:

- Chrome/Edge 113+
- Firefox 115+ (behind flag)
- Safari 18+ (experimental)

### WebAssembly Fallback

Works in all modern browsers:

- Chrome/Edge 90+
- Firefox 89+
- Safari 15+

## Development Workflow

### Local Development

```bash
# Start dev server with hot reload
pnpm dev

# Access at http://localhost:4321
```

### Building

```bash
# Create production build
pnpm build

# Output in dist/ directory
```

### Preview

```bash
# Preview production build locally
pnpm preview
```

## Debugging

### Model Loading Issues

Check browser console for:

- Network errors (CDN access)
- WebGPU availability
- WASM support

### Processing Errors

Common issues:

- Image too large (>4000px)
- Unsupported format
- Memory constraints

### Performance Issues

Monitor:

- Model load time (first use only)
- Processing time per image
- Memory usage (DevTools)

## Deployment

### Static Hosting

Deploy `dist/` folder to:

- **Vercel**: `vercel deploy`
- **Netlify**: Drag & drop or CLI
- **Cloudflare Pages**: Git integration
- **GitHub Pages**: Actions workflow

### Environment Variables

None required - fully client-side application.

### CDN Configuration

Ensure CDN allows:

- Hugging Face CDN access (cdn-lfs.huggingface.co)
- WebAssembly MIME types
- Large file downloads (~30MB model)

## Testing

### Manual Testing Checklist

- [ ] Upload single image
- [ ] Upload multiple images
- [ ] Drag and drop
- [ ] Download single image
- [ ] Download all as ZIP
- [ ] Test on mobile
- [ ] Test with large images
- [ ] Test with various formats (JPG, PNG, WebP)

### Browser Testing

Test in:

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari
- [ ] Mobile Chrome

## Future Enhancements

Potential improvements:

- [ ] Add image quality slider
- [ ] Support for edge refinement
- [ ] Batch processing with parallel workers
- [ ] Progressive Web App (PWA) support
- [ ] Offline mode with cached model
- [ ] Additional output formats (JPEG with custom background)
- [ ] Image editing tools (crop, resize)
- [ ] Comparison slider for before/after

## Troubleshooting

### Model won't load

1. Check internet connection
2. Verify Hugging Face CDN is accessible
3. Clear browser cache
4. Try different browser

### Processing is slow

1. Check if WebGPU is enabled
2. Reduce image size before upload
3. Process fewer images at once
4. Close other browser tabs

### Out of memory errors

1. Reduce image dimensions
2. Process images one at a time
3. Refresh page between batches
4. Use a device with more RAM

## Contributing

When contributing:

1. Follow the Vercel design system
2. Maintain TypeScript types
3. Test in multiple browsers
4. Update documentation
5. Keep bundle size minimal

## Resources

- [Astro Documentation](https://docs.astro.build)
- [Tailwind CSS v4 Docs](https://tailwindcss.com/docs)
- [Transformers.js](https://huggingface.co/docs/transformers.js)
- [Xenova/modnet Model](https://huggingface.co/Xenova/modnet)
- [Vercel Design](https://vercel.com/design)

## Google AdSense (dormant until activated)

The ad system is fully built but **off by default**. Nothing loads or renders
until a publisher id is set, so the site ships ad-free and the background-removal
engine is never affected.

How it's wired:

- `src/lib/adsense.ts` — reads `PUBLIC_ADSENSE_CLIENT`; exposes `ADSENSE_ENABLED`.
- `src/components/AdSense.astro` — injects the official loader in `<head>`
  (already included in `Layout.astro`). Emits nothing while disabled.
- `src/components/AdSlot.astro` — a reusable ad unit. Renders nothing in
  production while disabled; shows a labelled placeholder in `dev` so you can
  position slots. Use `<AdSlot slot="1234567890" />`.
- `public/_headers` — Google's ad origins are already allow-listed in the CSP.
  Allow-listing is inert (permits requests but triggers none), so it's safe to
  ship now.
- `worker/index.js` — `mediapartners-google` / `adsbot-google` crawlers already
  bypass geo-redirect so AdSense reviews the canonical English pages.

To go live (once the site has a handful of users and is AdSense-approved):

1. Set `PUBLIC_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX` in `.env` **and** as a
   Cloudflare build variable (so the production bundle picks it up).
2. Fill in `public/ads.txt` — uncomment the `google.com, pub-…` line with the
   matching id.
3. Create ad units in the AdSense dashboard and drop `<AdSlot slot="…" />` where
   you want them (e.g. in `HomePage.astro` between sections). The home page tool
   UI and the AI `<script>` engine need no changes.
4. Rebuild and deploy. No CSP or header edits are required.

## Image converter & optimizer

`/convert/` (one image, choose a format) and `/optimize/` (a batch, one
quality level, ZIP download) share a hybrid engine in `src/lib/transform/`:

| File | Role |
| --- | --- |
| `formats.ts` | Output formats, which engine can write each, download names |
| `edge.ts` | Primary engine: upload to R2, encode at `/cdn-cgi/image/`, delete |
| `local.ts` + `encode.worker.ts` | Fallback: canvas encoders, plus `@jsquash` WASM for AVIF (and WebP in Safari) |
| `hybrid.ts` | Edge first, local on failure. A systemic failure turns the edge off for the rest of the batch and for 15 minutes in that tab |
| `vector.ts` + `vector.worker.ts` | `/convert` only: SVG, AI and EPS input, resized to a longest side of 16–8192 px. Raster output: SVG via the browser's `<img>`, PDF-compatible AI via pdf.js, EPS / PostScript AI via Ghostscript; the PNG then goes through `hybrid.ts` with `localOnly`, capped at 16.7 MP for iOS Safari. Vector output (SVG, EPS, AI): SVG resized in place or drawn to PDF with svg2pdf.js; AI/EPS → PDF (Ghostscript) → resized by MuPDF → SVG (MuPDF), AI (the PDF) or EPS (Ghostscript `eps2write`, bounding box reset to the artboard). 1 px = 1 pt. Ghostscript and MuPDF are AGPL; see README. Nothing from a vector file is uploaded |

The upload endpoint is `POST/DELETE /api/upload-temp` in `worker/upload.js`.
It lives in the Worker, next to `/api/count`, because the site is a static
Astro build with no server adapter.

What goes local, and when:

- **Always local:** PNG output (`png` is not a `/cdn-cgi/image/` format),
  AVIF/BMP/TIFF input, AVIF output over 1,200 px, files over 25 MB.
- **Whole batch goes local** (systemic): error 9422 (free-tier limit), 9403,
  9524, network errors, or uploads unavailable (404 in `astro dev`, 503 when
  R2 is not configured).
- **That image only goes local:** other `Cf-Resized: err=…` codes, 413/415
  from the upload, or a format the edge substituted (AVIF served as WebP).

In local development the edge is never reachable, so every image takes the
fallback path. To exercise the edge path without Cloudflare, mock the two
endpoints in Playwright with `page.route` (see `tests/transform.test.mjs` for
the response shapes).

### One-time Cloudflare setup (before merging)

The `[[r2_buckets]]` binding in `wrangler.toml` makes a deploy fail if the
bucket does not exist, so create it first:

```bash
wrangler r2 bucket create freeremovebg-temp
# Expire anything the client failed to delete:
wrangler r2 bucket lifecycle add freeremovebg-temp expire-temp tmp/ --expire-days 1
```

Then, in the dashboard:

1. **R2 → freeremovebg-temp → Settings → Custom Domains:** connect
   `temp.freeremovebg.com`. It must be on the `freeremovebg.com` zone, so
   `/cdn-cgi/image/` accepts it as a source without an allow-list. If you pick
   a different host, update `TEMP_PUBLIC_URL` in `wrangler.toml`.
2. **Images → Transformations:** enable transformations for `freeremovebg.com`.

Uploads are throttled to 60 per minute per IP by the `[[ratelimits]]` binding
in `wrangler.toml`. A visitor over the limit gets a 429, and their tab switches
to on-device encoding for 15 minutes.

### Monthly free-tier budget

The free plan includes 5,000 unique transformations a month. The worker
reserves one unit for each upload with a fresh key and tracks those reservations
per UTC calendar month in D1. The `edge_usage.uploads` column holds the budget
estimate, including any historical reconciliation. It is not Cloudflare's
account-wide transformation metric or a count of completed conversions.

Cloudflare counts unique source images and transformation options across the
account. Earlier usage and requests outside `/api/upload-temp` are missing
from the local counter. An abandoned upload can consume a reservation without
producing a transformation. See [Cloudflare Images pricing](https://developers.cloudflare.com/images/pricing/).

The separate `tool_counts` table records completed conversions and optimizations,
including on-device processing, which consumes no Cloudflare transformations.
Those totals should not be reconciled to the dashboard.

The budget table creates itself on first use:

- `GET /api/edge-status` returns `{ available, used, estimated: true, budget, resumeAt }`.
  Each page asks once on load; when the month is closed it encodes everything
  on the device and uploads nothing.
- `POST /api/upload-temp` claims one unit before storing the file and answers
  503 `quota_exhausted` once the budget is spent.
- A failed R2 write releases its reservation. Deleting a source after processing
  does not release it, because the transformation may already have been counted.
- If the edge answers 9422 before the count gets there, the browser reports it
  (`POST /api/edge-status` with the upload's key, which must still exist) and
  the month closes for everyone.
- A new month is a new row, so the edge reopens on the 1st at 00:00 UTC.

The budget is `EDGE_MONTHLY_BUDGET` in `wrangler.toml` (default 4,900, leaving
headroom under 5,000). Set it to `0` to keep every image on the device, or
raise it after moving to a paid Images plan. If D1 is unavailable, the worker
stops uploads and the browser encodes locally, avoiding untracked edge usage.

Check the current month:

```bash
pnpm exec wrangler d1 execute freeremovebg_stats --remote \
  --command "SELECT * FROM edge_usage ORDER BY month DESC LIMIT 3"
```

When tracking starts partway through a month, reconcile from the dashboard's
unique transformations for that same UTC month. For example, the November 2026
screenshots showed 12 transformations while D1 held 1. Generate a guarded repair:

```bash
node scripts/reconcile-edge-usage.mjs 2026-11 1 12 > /tmp/edge-usage-reconciliation.sql
pnpm exec wrangler d1 execute freeremovebg_stats --remote \
  --file /tmp/edge-usage-reconciliation.sql
pnpm exec wrangler d1 execute freeremovebg_stats --remote \
  --command "SELECT * FROM edge_usage WHERE month = '2026-11'"
```

The script only prints SQL. Applying it raises the budget estimate to 12 only
if D1 still holds 1. Check the rows written and then read the row back. Zero
rows written means the row changed, the repair already ran, or the month is missing.
Read D1 and obtain a fresh dashboard snapshot before generating another repair.
The repair preserves exhaustion and never lowers usage. Subsequent uploads
increment the reconciled value; the next month starts at zero.

The November correction above was applied on 2026-11-06. Both D1 and the live
`/api/edge-status` endpoint returned 12 afterward. The conversion and optimization
totals remained 1 each.

This is a manual snapshot reconciliation, not automatic Cloudflare billing
synchronization. Dashboard delays, failed transformations and other account
usage can still cause differences. Do not use this estimate as billing data.
