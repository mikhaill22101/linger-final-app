# Linger App

A React + TypeScript + Vite application for discovering events and connecting with people nearby.

## Features

- 🌐 **Web App** - Works in any modern browser
- 📱 **PWA** - Installable Progressive Web App for iOS and Android
- 🤖 **Telegram Mini App** - Native integration with Telegram Web Apps
- 🔐 **Multi-Auth** - Email, Phone, Telegram, Google, and Apple authentication
- 🗺️ **Interactive Maps** - Location-based event discovery
- 👥 **Social Features** - Friends, messaging, and event requests

## Tech Stack

- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS 4
- **Maps**: Leaflet
- **Backend**: Supabase (Auth + Database)
- **State Management**: React Hooks + Context API
- **Animations**: Framer Motion

## Prerequisites

- Node.js 18+ and npm
- Supabase account and project
- (Optional) Telegram Bot for notifications

## Setup

### 1. Clone and Install

```bash
git clone <repository-url>
cd linger-app
npm install
```

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_TELEGRAM_BOT_TOKEN=your-bot-token-here  # Optional
```

### 3. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Building for Production

### Build

```bash
npm run build
```

This creates an optimized production build in the `dist/` folder.

### Preview Production Build

```bash
npm run preview
```

## Deployment

### Static Hosting (nginx)

The app is configured for static hosting. After building:

1. Copy `dist/` contents to your web server
2. Configure nginx with SPA fallback:

```nginx
server {
    listen 80;
    server_name _;
    root /var/www/linger;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### PWA Installation

Users can install the app as a PWA:

- **Chrome/Edge**: Click the install icon in the address bar
- **Safari (iOS)**: Tap Share → Add to Home Screen
- **Chrome (Android)**: Install prompt appears automatically

### Testing PWA Locally

1. Build the app: `npm run build`
2. Serve the `dist/` folder with a local server:
   ```bash
   npx serve dist
   ```
3. Open in Chrome and use DevTools → Application → Manifest to test
4. Use "Add to Home Screen" in Chrome DevTools to simulate installation

## Telegram Mini App

The app automatically detects when running inside Telegram and:

- Initializes Telegram WebApp SDK
- Applies Telegram theme colors
- Supports Telegram UI elements (MainButton, BackButton)
- Works seamlessly outside Telegram (graceful fallback)

### Testing Telegram Mini App

1. Create a Telegram bot via [@BotFather](https://t.me/BotFather)
2. Set the bot's menu button or web app URL to your deployed app URL
3. Open the bot in Telegram and click the menu button

## Project Structure

```
src/
├── components/       # React components
├── lib/            # Utilities and services
│   ├── supabase.ts # Supabase client
│   ├── telegram.ts # Telegram WebApp wrapper
│   └── auth-universal.ts # Authentication logic
├── context/        # React Context providers
├── types/          # TypeScript type definitions
└── main.tsx        # Application entry point
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_SUPABASE_URL` | Your Supabase project URL | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `VITE_TELEGRAM_BOT_TOKEN` | Telegram bot token for notifications | No |

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Android)

## License

Private project
