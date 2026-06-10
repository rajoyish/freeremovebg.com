# Free Remove BG

A free AI background remover, the [FreeRemoveBG](https://freeremovebg.com) that runs entirely in your browser. Your images never leave your device.

## Features

- **100% Private** - All processing happens locally on your device, nothing is uploaded
- **Free, Unlimited, No Watermark** - No account, no credits, no hidden limits
- **HD Downloads** - Export transparent PNGs at the original resolution
- **Batch Processing** - Drop in many images and download them all as a ZIP
- **Smart AI Selection** - Auto mode picks the best engine for each image (portraits vs objects)
- **Broad Format Support** - JPG, PNG, WebP, AVIF, GIF, BMP and more
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

- Node.js >= 22.12.0
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

## SEO

- Per-page title, meta description, keywords, and canonical URL
- Open Graph and Twitter Card meta tags
- JSON-LD structured data (WebApplication + FAQPage)
- Semantic HTML with proper heading hierarchy
- Scroll-reveal article with keyword-rich content
- FAQ section with visible accordion and matching FAQPage schema

## License

MIT
