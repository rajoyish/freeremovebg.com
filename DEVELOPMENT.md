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
