# Free Remove BG

A free AI background remover, the [FreeRemoveBG](https://freeremovebg.com) that runs entirely in your browser. Your images never leave your device.

## Features

- **100% Private** - All processing happens locally on your device, nothing is uploaded
- **Free, Unlimited, No Watermark** - No account, no credits, no hidden limits
- **HD Downloads** - Export transparent PNGs at the original resolution
- **Batch Processing** - Drop in many images and download them all as a ZIP
- **Smart AI Selection** - Auto mode picks the best engine for each image (portraits vs objects)
- **Broad Format Support** - JPG, PNG, WebP, AVIF, GIF, BMP and more
- **Vector Conversion** - `/convert` resizes SVG, AI and EPS files, from a 16 px icon up to 8192 px, and saves them as PNG, JPG, WebP or AVIF, or as SVG, EPS or AI. Pasted SVG code works too. All on the device
- **Works Offline** - After the first load, background removal works without a connection
- **Dark Mode** - Toggle between light and dark themes
- **Crisp Edge Detail** - A dedicated portrait engine preserves fine hair, fur and soft edges
- **Instant Side-by-Side** - Compare the original and cutout on a transparency checkerboard

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home page with the background removal tool, features grid, SEO article and FAQ |
| `/about` | About Free Remove BG |
| `/privacy-policy` | Privacy policy |
| `/terms` | Terms and conditions |
| `/contact` | Contact form |

## Getting Started

### Prerequisites

- Node.js >= 22.23.4
- pnpm

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## Project Structure

```
src/
├── components/
│   ├── Breadcrumb.astro    # Breadcrumb navigation for subpages
│   ├── Header.astro        # Sticky header with logo and dark mode toggle
│   └── Footer.astro        # Footer with nav links and copyright
├── layouts/
│   └── Layout.astro        # Base layout (SEO meta, OG tags, JSON-LD, fonts)
├── pages/
│   ├── index.astro         # Home page with the background remover tool
│   ├── about.astro         # About page
│   ├── privacy-policy.astro
│   ├── terms.astro
│   └── contact.astro
├── styles/
│   └── global.css          # Design tokens, dark mode, scroll-reveal, toast
public/
├── favicon.svg
├── favicon-96x96.png
├── apple-touch-icon.png
└── site.webmanifest
```

## How It Works

1. Upload one or more images (drag and drop or browse)
2. The AI analyses each image and removes the background
3. Download individual transparent PNGs or the entire batch as a ZIP

Smart mode automatically detects whether an image contains a person and routes it to the best engine. You can also select the engine manually (People & Portraits or Objects & Graphics).

On mobile and devices reporting 4 GB of memory or less, Smart mode uses the smaller general model for both people and objects. Images are resized to at most 2,048 pixels on the longest edge before processing and previewing. Each photo runs in its own worker so model memory is released before the next photo. Desktop processing keeps the original resolution.

## SEO

- Per-page title, meta description, keywords, and canonical URL
- Open Graph and Twitter Card meta tags
- JSON-LD structured data (WebApplication + FAQPage)
- Semantic HTML with proper heading hierarchy
- Scroll-reveal article with keyword-rich content
- FAQ section with visible accordion and matching FAQPage schema

## License

MIT, except for the third-party components below.

### Third-party notices

`/convert` loads these in the visitor's browser, only when a vector file needs them (`src/lib/transform/vector.worker.ts`):

- **Ghostscript** ([@jspawn/ghostscript-wasm](https://github.com/jsscheller/ghostscript-wasm), built from [Artifex Ghostscript](https://www.ghostscript.com/)), licensed under the **GNU AGPL-3.0**, reads EPS and PostScript-based AI files and writes EPS. Source: [github.com/jsscheller/ghostscript-wasm](https://github.com/jsscheller/ghostscript-wasm) and [git.ghostscript.com](https://git.ghostscript.com/).
- **MuPDF** ([mupdf](https://www.npmjs.com/package/mupdf), Artifex), licensed under the **GNU AGPL-3.0-or-later**, resizes PDF-based artwork and writes SVG. Source: [github.com/ArtifexSoftware/mupdf.js](https://github.com/ArtifexSoftware/mupdf.js) and [git.ghostscript.com](https://git.ghostscript.com/?p=mupdf.git).

This site's own source is at [github.com/rajoyish/freeremovebg.com](https://github.com/rajoyish/freeremovebg.com).

Also used: **pdf.js** ([pdfjs-dist](https://github.com/mozilla/pdf.js), Apache-2.0) to draw AI files, and **svg2pdf.js** ([github.com/yWorks/svg2pdf.js](https://github.com/yWorks/svg2pdf.js), MIT) with **jsPDF** (MIT) to turn SVG into AI and EPS.
