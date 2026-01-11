# Trading Bot Frontend Tech Stack Overview

This document explains the recommended frontend tech stack for the trading engine UI, why we’re choosing it, and what each component does.  
Everything below is designed so the UI can display real-time market data, plot buys/sells, and eventually allow interactive controls that affect the running C++ engine.

---

# 💻 Recommended Tech Stack

## **1. React (with TypeScript)**
**What it is:**  
React is a declarative UI library for building component-based UIs. It’s the industry standard for dashboards, control panels, and interactive real-time interfaces.

**Why it’s right for this project:**
- Handles live-updating data flows extremely well
- Componentization makes it easy to build reusable widgets (charts, positions tables, logs)
- Pairs naturally with WebSockets for streaming tick data
- Massive ecosystem & tooling support
- Very easy to embed graphs and drag-and-drop components

---

## **2. Vite (Dev Server + Build Tool)**
**What it is:**  
A modern, extremely fast build tool that replaces older options like Webpack and Create-React-App.

**Why it’s right for this project:**
- Nearly instant startup time
- Hot Module Reloading (HMR) is instantaneous — perfect for UI iteration
- Works beautifully with React + TypeScript
- Zero config for most needs

---

## **3. Chakra UI (UI Component Library)**
**What it is:**  
A React component library offering modern, accessible components like buttons, drawers, menus, tables, forms, etc.

**Why use it instead of Bootstrap:**
- **More modern and React-native** — built specifically for React component models  
- **Styled System based** — allows easy responsive design with simple props  
- **Themeable** — dark/light mode built in  
- **More elegant** — dashboards look clean out of the box  
- Has components Bootstrap doesn’t support as cleanly (drawers, modals, layout primitives)

Bootstrap is older and CSS-class-driven, whereas Chakra is modern and component-driven.

---

## **4. Recharts (Data Visualization Library)**
**What it is:**  
A very popular React charting library built on D3 primitives.

**Why it’s right for this project:**
- Easy out-of-the-box charts: line graphs, candles, scatterplots
- Can overlay markers (buys, sells)
- Responsive by default
- Works extremely well with streaming data
- Much lighter and simpler than full D3.js

---

## **5. WebSockets (Browser) + C++ WebSocket Server**
**What it is:**  
A bidirectional communication protocol ideal for streaming live ticks, positions, orders, etc.

**Why it’s right for this project:**
- Tightly matches how real trading systems deliver market data
- Allows publishing of engine events directly into the UI
- Enables interactive controls: pause, resume, change strategy parameters, etc.
- Simple JSON messages keep things decoupled

The browser WebSocket API integrates seamlessly with React.

---

# 🎯 Why This Stack?

This architecture ensures:

### 🔥 Real-time Performance
WebSockets + React's virtual DOM make live updates smooth even with dozens of tick events per second.

### 📦 Modular UI
Each display element (chart panel, trades log, strategy inspector) is its own reusable component.

### 🚀 Ease of Development
Vite makes the frontend feel instant — perfect for rapid iteration during engine development.

### 🎨 Professional Look
Chakra UI gives modern dashboards without hand-crafting CSS.

### 📊 Powerful Visuals
Recharts gives you advanced charting without needing to write D3 from scratch.

### 🔌 Clean Integration With C++
The C++ engine only needs to expose:
- a WebSocket server
- JSON messages for ticks/orders/logs
- optional RPC endpoints for control (start/stop/change strategy)

No messy binding or embedding frameworks.

---

# 🧠 Component 101 — What Each Piece Does

## **React**
- Builds the UI from reusable components
- Handles dynamic updates to charts/logs/data
- Coordinates internal application state

## **TypeScript**
- Adds compile-time type safety  
- Prevents UI bugs where fields are missing/mismatched  
- Makes complex components easier to maintain

## **Vite**
- Runs the React app locally with hot reload
- Bundles the app for production deployment
- Extremely fast build times

## **Chakra UI**
Provides modern React-native components like:
- Buttons  
- Forms  
- Panels  
- Cards  
- Layout grids  
- Theming (dark/light mode)  

Keeps the UI visually clean and consistent.

## **Recharts**
- Renders line charts, candlesticks, scatter plots
- Supports overlays (markers, signals, trades)
- Smooth animation + real-time updates
- Integrates well with React state

## **WebSockets**
- Used by frontend to receive live market ticks
- Used by frontend to send commands to engine
- Perfect for real-time trading systems

## **C++ WebSocket Server (Engine)**
- Publishes tick events, order fills, logs
- Listens for UI commands (optional)
- Decouples engine from UI technology

---

# 🧩 How Everything Fits Together

```
+--------------------+ WebSockets +-------------------------+
| C++ Trading | <--------------------> | React Frontend UI |
| Engine | | (Vite + Chakra + TS) |
| - ProviderMD | | |
| - EventBus | | - Tick Graphs |
| - Strategies | | - Positions Panel |
| - Brokers | | - Trades Log |
+--------------------+ +-------------------------+
```

- Engine publishes JSON: ticks, signals, orders  
- UI reads these into charts and logs  
- UI can send control messages back (future):
  - pause/resume
  - change strategy params
  - manually create orders



# 🏗️ Frontend State Management Architecture

The frontend uses a **unified event timeline** approach where all events (price ticks and order fills) are stored chronologically with precise millisecond timestamps. This enables efficient filtering, deduplication, and interactive charting without run-based state.

## Core Stores (Zustand)

### `eventStore.ts` - Single Source of Truth for Events
**Purpose:** Unified timeline of all market ticks and order fills.

**State:**
```typescript
{
  events: ChartEvent[],        // Chronological list of all events
  minTime: number | null,      // Earliest timestamp in ms
  maxTime: number | null,      // Latest timestamp in ms
}
```

**Event Types:**
- `TickEvent`: `{ type: 'tick', symbol, price, timestamp, ms }`
- `OrderFilledEvent`: `{ type: 'orderFilled', orderId, symbol, side, fillPrice, filledQty, timestamp, ms }`

**Key Methods:**
- `addTick(symbol, price, timestamp)` - Add price tick
- `addOrderFilled(orderId, symbol, side, fillPrice, filledQty, timestamp)` - Add order fill
- `getAllEvents()` - Get all events (automatically sorted)
- `getEventsByTimeRange(startMs, endMs)` - Filter events by viewport bounds
- `clear()` - Reset timeline (useful for clearing chart data)

**Design Note:** Events are keyed by `orderId-timestamp` for deduplication. This allows the same order ID to appear across multiple engine runs without creating duplicates.

---

### `chartStore.ts` - Viewport Management
**Purpose:** Track user's zoom level, pan position, and auto-scroll state.

**State:**
```typescript
{
  viewportStartMs: number | null,  // Left edge of visible window
  viewportEndMs: number | null,    // Right edge of visible window
  autoScroll: boolean,             // Following latest data?
}
```

**Key Methods:**
- `zoomIn()` / `zoomOut()` - Adjust magnification (respects data bounds)
- `zoomToPreset(preset)` - Jump to preset: '1m', '5m', '15m', '1h', 'fit-all'
- `pan(deltaMs)` - Scroll left/right
- `setAutoScroll(enabled)` - Toggle following latest
- `resetViewport()` - Return to full data view
- `setDataBounds(minMs, maxMs)` - Update when events arrive

**Design Note:** Viewport always has 5% buffer beyond data to prevent edge scrolling artifacts.

---

## Interaction Hooks

### `useChartZoom.ts` - User Input Handler
**Purpose:** Convert mouse/keyboard input into chart actions.

**Exports:**
```typescript
{
  zoomIn: () => void,
  zoomOut: () => void,
  setAutoScroll: (enabled: boolean) => void,
  resetViewport: () => void,
}
```

**Interactions Handled:**
- **Scroll wheel:** Zoom in/out
- **Ctrl+Drag:** Pan left/right
- **Preset buttons:** Jump to timeframe
- **Follow Latest toggle:** Click to enable/disable auto-scroll

**Integration:** Attached to chart container ref to capture events.

---

## Utilities

### `timeBuckets.ts` - Responsive Axis Labels
**Purpose:** Calculate appropriate label granularity based on zoom level.

**Function:** `calculateTimeBucket(startMs, endMs, containerWidthPx)`

**Returns:** `{ intervalMs, format }`

**Strategy:** Maintains ~15 visible labels across viewport, choosing from 250ms up to 1 month intervals.

**Example:** 
- Zoomed to 1 minute: Shows every 5 seconds
- Zoomed to 1 hour: Shows every 5 minutes
- Viewing all data: Shows daily/weekly labels

---

## WebSocket Integration

### `useEngineConnection.ts` - Event Dispatch
**Purpose:** Listen for WebSocket messages and populate stores.

**Flow:**
```
WebSocket message arrives
    ↓
Parse JSON by message.type
    ↓
If 'ProviderTick': Add to eventStore with timestamp
If 'OrderFilled': Add to eventStore with timestamp
If 'Position': Update positionStore
    ↓
Zustand stores trigger component re-renders
```

**Deduplication Key:** `orderId-timestamp`
- Prevents duplicate processing if same message arrives twice
- Allows same order ID on subsequent engine runs

---

# Directory Structure

```
frontend/
│
├── src/
│   ├── components/
│   │   ├── PriceChart.tsx          // Interactive chart with buy/sell markers
│   │   ├── OrdersPanel.tsx         // Recent orders with pagination
│   │   ├── PositionsPanel.tsx      // Current holdings with P&L
│   │   ├── AccountPanel.tsx        // Portfolio summary
│   │   ├── EngineStatus.tsx        // Engine health indicator
│   │   └── App.tsx                 // Main layout grid
│   │
│   ├── store/
│   │   ├── eventStore.ts           // Unified tick + order fill timeline
│   │   ├── chartStore.ts           // Viewport & zoom state
│   │   ├── orderStore.ts           // Order and position tracking
│   │   └── positionStore.ts        // Current holdings
│   │
│   ├── hooks/
│   │   ├── useChartZoom.ts         // Mouse/keyboard input handling
│   │   └── useEngineConnection.ts  // WebSocket listener
│   │
│   ├── utils/
│   │   └── timeBuckets.ts          // Responsive axis label calculation
│   │
│   ├── api/
│   │   └── engineWS.ts             // WebSocket client
│   │
│   ├── App.css
│   ├── index.css
│   ├── main.tsx
│   └── theme.ts
│
├── public/
│   └── ticks.jsonl                 // Sample tick data
│
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── eslint.config.js
```

---

# 📊 Key Features

## PriceChart Component

### Interactive Zoom & Pan
- **Scroll wheel:** Zoom in/out (respects data bounds with 5% buffer)
- **Ctrl+Drag:** Pan left/right across timeline
- **Preset buttons:** Quick jump to 1m, 5m, 15m, 1h, or fit-all views
- **Auto-scroll:** Toggle "Following latest" mode at any zoom level (not just fit-all)

### Buy/Sell Markers
- Green dots (🟢) indicate BUY order fills
- Red dots (🔴) indicate SELL order fills
- Markers persist correctly across multiple engine runs (keyed by `orderId-timestamp`)
- Hovering shows detailed info: price, quantity, and dollar impact

### Enhanced Tooltips
When hovering over a marker, displays:
- **Time:** When order filled
- **Price:** Current market price
- **Order Info:** BUY/SELL with fill price
- **Quantity:** How much was bought/sold
- **Dollar Impact:** Debit (red, −) for buys; credit (green, +) for sells

### Y-Axis Optimization
- Tight padding (±0.5 units) to maximize chart space
- Increased chart height (600px) with scrolling support
- Dynamic scaling based on data range

---

## OrdersPanel Component

### Live Order History
- Shows recent orders with Time, Symbol, Side, Qty, Filled, Price, Status
- Status badges: WORKING, FILLED, REJECTED with color coding
- **Pagination:** Display 10 orders per page with Prev/Next navigation
- Page counter shows current position (e.g., "Page 2 of 5")

### Button Styling
- Consistent with PriceChart buttons (white bg, black bold text, dark borders)
- Prev/Next buttons disable at boundaries
- Clear button to reset data

---

## AccountPanel & PositionsPanel

### Real-time Updates
- Both panels update instantly as order fills arrive
- P&L recalculates on every new tick
- Badges show color-coded status (green for gains, red for losses)

---

# 🚀 Development & Build

## Quick Start

```bash
cd frontend
npm install          # Install dependencies
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Build for production
npm run preview      # Preview production build locally
npm run lint         # Check code style
```

## Development Server

```bash
npm run dev
```

- Opens on http://localhost:5173
- Hot Module Reloading (HMR) active: changes appear instantly
- WebSocket connects to engine on localhost:8080

## Production Build

```bash
npm run build
```

- Minifies and bundles all code
- Output in `dist/` directory
- Ready to deploy to any static host

---




# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
