# FreeRemoveBG - AI-Powered Background Remover

A high-performance, client-side image background remover built with Astro.js and Tailwind CSS v4. All processing happens locally in your browser - your images never leave your device.

## ✨ Features

- **100% Client-Side Processing** - All AI processing happens in your browser using WebAssembly
- **Privacy-First** - Your images never leave your device
- **No Sign-Up Required** - Start using immediately
- **Unlimited HD Downloads** - Download processed images in original resolution
- **Batch Processing** - Process multiple images at once
- **Before/After Preview** - See the results side-by-side
- **Download as ZIP** - Download all processed images in a single ZIP file

## 🛠️ Technology Stack

- **Astro.js** - Modern static site generator
- **Tailwind CSS v4** - Latest version with native CSS support
- **Hugging Face Transformers** - AI model inference in the browser
- **Xenova/modnet** - State-of-the-art image matting model
- **JSZip** - Client-side ZIP file generation

## 🎨 Design System

Built following Vercel's design language:

- Minimalist monochrome palette (black, white, sleek grays)
- Inter font family
- Subtle borders and soft shadows
- Clean micro-interactions

## 🚀 Getting Started

### Prerequisites

- Node.js >= 22.12.0
- pnpm (recommended) or npm

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

## 📁 Project Structure

```
freeremovebg.com/
├── src/
│   ├── components/
│   │   ├── Header.astro       # Navigation header with privacy badge
│   │   └── Footer.astro       # Footer with features and info
│   ├── layouts/
│   │   └── Layout.astro       # Base layout with meta tags
│   ├── pages/
│   │   └── index.astro        # Main page with background remover
│   └── styles/
│       └── global.css         # Tailwind CSS v4 with design tokens
├── public/
│   ├── favicon.svg
│   └── favicon.ico
├── astro.config.mjs           # Astro + Tailwind configuration
└── package.json
```

## 🎯 How It Works

1. **Model Loading**: On first use, the Xenova/modnet model is loaded from Hugging Face
2. **Image Upload**: Users can drag & drop or browse for images
3. **AI Processing**: Each image is processed using the modnet model for image matting
4. **Background Removal**: The AI-generated mask is applied to remove the background
5. **Download**: Users can download individual PNGs or all images as a ZIP

## 🔧 Configuration

### Vite Configuration

The project is configured to:

- Use Tailwind CSS v4 via the Vite plugin
- Exclude `@huggingface/transformers` from optimization for proper WebAssembly loading
- Use ES format for web workers

### Tailwind CSS v4

Custom design tokens are defined in `src/styles/global.css` following the Vercel design system:

- Color palette (ink, canvas, hairline, etc.)
- Spacing scale (4px base unit)
- Typography (Inter font family)
- Border radius tokens

## 🌐 Browser Support

- Chrome/Edge 113+ (WebGPU support recommended)
- Firefox 115+
- Safari 16.4+

Note: WebGPU provides the best performance but the app will fall back to WebAssembly if unavailable.

## 📝 License

MIT License - feel free to use this project for personal or commercial purposes.

## 🙏 Acknowledgments

- [Hugging Face](https://huggingface.co/) for the Transformers.js library
- [Xenova](https://huggingface.co/Xenova) for the modnet model
- [Vercel](https://vercel.com/) for design inspiration
- [Astro](https://astro.build/) for the amazing framework

## 🐛 Known Issues

- First load may take a few seconds to download the AI model (~30MB)
- Very large images (>4000px) may take longer to process
- WebGPU support is still experimental in some browsers

## 🚀 Deployment

This is a static site that can be deployed to:

- Vercel
- Netlify
- Cloudflare Pages
- GitHub Pages
- Any static hosting service

Simply run `pnpm build` and deploy the `dist/` folder.

## 📧 Support

For issues or questions, please open an issue on GitHub.
