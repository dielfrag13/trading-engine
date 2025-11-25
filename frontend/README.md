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



# current directory structure

```
frontend/
│
├── src/
│   ├── components/
│   │   ├── charts/
│   │   │   └── PriceChart.tsx
│   │   ├── panels/
│   │   │   ├── StrategyPanel.tsx
│   │   │   ├── PositionsPanel.tsx
│   │   │   └── EngineStatus.tsx
│   │   └── widgets/
│   │       ├── MetricCard.tsx
│   │       └── ActionButton.tsx
│   │
│   ├── hooks/
│   │   ├── useEngineStatus.ts
│   │   └── useLiveTicks.ts
│   │
│   ├── api/
│   │   ├── websocket.ts
│   │   └── rest.ts
│   │
│   ├── theme/
│   │   └── index.ts
│   │
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   └── Settings.tsx
│   │
│   ├── App.tsx
│   └── main.tsx
│
├── index.html
└── package.json
```




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
