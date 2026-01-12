# PWA Icons Guide

The app requires the following icon files in the `public/` directory:

## Required Icons

1. **icon-192.png** - 192x192 pixels (for Android)
2. **icon-512.png** - 512x512 pixels (for Android)
3. **apple-touch-icon.png** - 180x180 pixels (for iOS)

## Creating Icons

You can create these icons from your app logo using any image editor or online tool:

### Option 1: Using Online Tools
- [PWA Asset Generator](https://github.com/onderceylan/pwa-asset-generator)
- [RealFaviconGenerator](https://realfavicongenerator.net/)

### Option 2: Manual Creation
1. Start with a square image (at least 512x512)
2. Resize to each required size
3. Save as PNG with transparency support
4. Place in `public/` directory

### Option 3: Quick Placeholder (for development)
You can temporarily use a simple colored square or your app logo.

## Icon Requirements

- **Format**: PNG
- **Transparency**: Supported (recommended)
- **Background**: Should work on both light and dark backgrounds
- **Content**: App logo or recognizable icon
- **Style**: Simple, clear, and recognizable at small sizes

## File Locations

All icons should be placed in the `public/` directory:
```
public/
├── icon-192.png
├── icon-512.png
└── apple-touch-icon.png
```

The Vite PWA plugin will automatically include these in the build.
