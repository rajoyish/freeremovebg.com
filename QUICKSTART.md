# Quick Start Guide

Get your AI-powered background remover running in 3 minutes.

## Prerequisites

- Node.js 22.12.0 or higher
- pnpm (recommended) or npm

## Installation

```bash
# 1. Install dependencies
pnpm install

# 2. Approve build scripts (required for AI model)
pnpm approve-builds onnxruntime-node protobufjs

# 3. Start development server
pnpm dev
```

Open [http://localhost:4321](http://localhost:4321) in your browser.

## First Use

1. **Upload an image**: Drag & drop or click to browse
2. **Wait for AI model**: First load downloads ~30MB model (cached after)
3. **View results**: See before/after comparison
4. **Download**: Individual PNG or batch ZIP download

## Production Build

```bash
# Build for production
pnpm build

# Preview production build
pnpm preview
```

The `dist/` folder contains your static site ready for deployment.

## Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Or connect your GitHub repo to Vercel for automatic deployments.

## Common Issues

### Model won't load

- Check internet connection (first load only)
- Verify Hugging Face CDN is accessible
- Try a different browser

### Slow processing

- Enable WebGPU in browser flags (Chrome: `chrome://flags/#enable-webgpu`)
- Reduce image size before upload
- Process fewer images at once

### Build errors

- Ensure Node.js >= 22.12.0
- Run `pnpm approve-builds onnxruntime-node protobufjs`
- Clear `node_modules` and reinstall

## Next Steps

- Read [DEVELOPMENT.md](./DEVELOPMENT.md) for architecture details
- Check [README.md](./README.md) for full documentation
- Customize design tokens in `src/styles/global.css`
- Modify components in `src/components/`

## Support

For issues or questions:

- Check browser console for errors
- Verify all dependencies installed correctly
- Open an issue on GitHub

---

**Tip**: The AI model is cached after first download, so subsequent uses are instant!
