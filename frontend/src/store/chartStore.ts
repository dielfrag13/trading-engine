// frontend/src/store/chartStore.ts
// State management for chart zoom, pan, and viewport
import { create } from 'zustand';

export type ZoomPreset = '1m' | '5m' | '15m' | '1h' | '1d' | '1w' | '1y' | 'fit-all';

export interface Candle {
  time: number; // timestamp in ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type ChartState = {
  // Candle data
  candles: Candle[];
  
  // Viewport control
  viewportStartMs: number | null;
  viewportEndMs: number | null;
  
  // Zoom level: 0-100, where 50 is "normal"
  // Higher = more zoomed in, Lower = more zoomed out
  zoomLevel: number;
  
  // Auto-scroll state: true = follow latest data
  autoScroll: boolean;
  
  // Data bounds (set by chart when data changes)
  dataMinMs: number | null;
  dataMaxMs: number | null;
  
  // Methods
  setCandles: (candles: Candle[]) => void;
  setDataBounds: (minMs: number | null, maxMs: number | null) => void;
  setViewportStartMs: (ms: number) => void;
  setViewportEndMs: (ms: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToPreset: (preset: ZoomPreset) => void;
  pan: (deltaMs: number) => void;
  setAutoScroll: (enabled: boolean) => void;
  resetViewport: () => void;
};

// Time range in ms for each zoom preset (when data spans that range)
const ZOOM_PRESET_RANGES: Record<ZoomPreset, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
  'fit-all': 0, // Special case, handled separately
};

export const useChartStore = create<ChartState>((set) => ({
  candles: [],
  viewportStartMs: null,
  viewportEndMs: null,
  zoomLevel: 50,
  autoScroll: true,
  dataMinMs: null,
  dataMaxMs: null,

  setCandles: (candles: Candle[]) =>
    set(() => {
      console.log('[chartStore] setCandles: received', candles.length, 'candles');
      return { candles };
    }),

  setViewportStartMs: (ms: number) =>
    set(() => ({ viewportStartMs: ms })),

  setViewportEndMs: (ms: number) =>
    set(() => ({ viewportEndMs: ms })),

  setDataBounds: (minMs: number | null, maxMs: number | null) =>
    set((state) => {
      // If this is the first time we have data, initialize viewport to fit all
      if (state.dataMinMs === null && state.dataMaxMs === null && minMs !== null && maxMs !== null) {
        const bufferMs = (maxMs - minMs) * 0.05; // 5% buffer
        return {
          dataMinMs: minMs,
          dataMaxMs: maxMs,
          viewportStartMs: minMs - bufferMs,
          viewportEndMs: maxMs + bufferMs,
          autoScroll: true,
        };
      }
      
      // If auto-scroll enabled and we have new data beyond current viewport, expand right
      if (state.autoScroll && maxMs !== null && state.viewportEndMs !== null && maxMs > state.viewportEndMs) {
        const dataRange = maxMs - (minMs ?? state.dataMinMs ?? maxMs);
        const bufferMs = dataRange * 0.05;
        return {
          dataMinMs: minMs,
          dataMaxMs: maxMs,
          viewportEndMs: maxMs + bufferMs,
        };
      }
      
      return {
        dataMinMs: minMs,
        dataMaxMs: maxMs,
      };
    }),

  zoomIn: () =>
    set((state) => {
      const newZoom = Math.min(100, state.zoomLevel + 10);
      // Recalculate viewport with new zoom level, centered on current view
      const { viewportStartMs, viewportEndMs } = state;
      if (viewportStartMs === null || viewportEndMs === null) return { zoomLevel: newZoom };
      
      const currentMidpoint = (viewportStartMs + viewportEndMs) / 2;
      const currentRange = viewportEndMs - viewportStartMs;
      const zoomFactor = (100 - state.zoomLevel) / (100 - newZoom); // More zoom = smaller range
      const newRange = currentRange / zoomFactor;
      
      return {
        zoomLevel: newZoom,
        viewportStartMs: currentMidpoint - newRange / 2,
        viewportEndMs: currentMidpoint + newRange / 2,
        autoScroll: false, // User interaction breaks auto-scroll
      };
    }),

  zoomOut: () =>
    set((state) => {
      const newZoom = Math.max(0, state.zoomLevel - 10);
      const { viewportStartMs, viewportEndMs, dataMinMs, dataMaxMs } = state;
      if (viewportStartMs === null || viewportEndMs === null) return { zoomLevel: newZoom };
      
      const currentMidpoint = (viewportStartMs + viewportEndMs) / 2;
      const currentRange = viewportEndMs - viewportStartMs;
      const zoomFactor = (100 - state.zoomLevel) / (100 - newZoom);
      const newRange = currentRange / zoomFactor;
      
      let newStart = currentMidpoint - newRange / 2;
      let newEnd = currentMidpoint + newRange / 2;
      
      // Constrain to data bounds with buffer
      if (dataMinMs !== null && dataMaxMs !== null) {
        const dataRange = dataMaxMs - dataMinMs;
        const buffer = dataRange * 0.05;
        const hardMinMs = dataMinMs - buffer;
        const hardMaxMs = dataMaxMs + buffer;
        
        if (newStart < hardMinMs) newStart = hardMinMs;
        if (newEnd > hardMaxMs) newEnd = hardMaxMs;
        // If zoomed out too far, expand range
        if (newEnd - newStart < 1000) {
          const mid = (newStart + newEnd) / 2;
          newStart = mid - 500;
          newEnd = mid + 500;
        }
      }
      
      return {
        zoomLevel: newZoom,
        viewportStartMs: newStart,
        viewportEndMs: newEnd,
        autoScroll: false,
      };
    }),

  zoomToPreset: (preset: ZoomPreset) =>
    set((state) => {
      const { viewportStartMs, viewportEndMs, dataMinMs, dataMaxMs } = state;
      
      // If no data yet, do nothing
      if (dataMinMs === null || dataMaxMs === null) {
        console.warn('[chartStore] zoomToPreset called but no data loaded yet');
        return {};
      }
      
      let newStart = viewportStartMs ?? dataMinMs;
      let newEnd = viewportEndMs ?? dataMaxMs;
      
      if (preset === 'fit-all') {
        const range = dataMaxMs - dataMinMs;
        const buffer = range * 0.05;
        newStart = dataMinMs - buffer;
        newEnd = dataMaxMs + buffer;
      } else {
        const rangeMs = ZOOM_PRESET_RANGES[preset];
        // If auto-scroll, show latest data
        if (state.autoScroll && dataMaxMs !== null) {
          newEnd = dataMaxMs + (dataMaxMs - dataMinMs) * 0.05;
          newStart = newEnd - rangeMs;
        } else if (viewportStartMs !== null && viewportEndMs !== null) {
          // Keep centered on current view
          const mid = (viewportStartMs + viewportEndMs) / 2;
          newStart = mid - rangeMs / 2;
          newEnd = mid + rangeMs / 2;
        } else {
          // No current viewport, use data bounds
          const range = dataMaxMs - dataMinMs;
          const mid = dataMinMs + range / 2;
          newStart = mid - rangeMs / 2;
          newEnd = mid + rangeMs / 2;
        }
      }
      
      // Validate results before returning
      if (isNaN(newStart) || isNaN(newEnd) || newStart >= newEnd) {
        console.warn('[chartStore] Invalid viewport after zoomToPreset:', { newStart, newEnd, preset });
        return {};
      }
      
      // Map preset to zoom level (rough approximation)
      const presetZoomMap: Record<ZoomPreset, number> = {
        '1m': 95,
        '5m': 85,
        '15m': 75,
        '1h': 60,
        '1d': 45,
        '1w': 30,
        '1y': 10,
        'fit-all': 50,
      };
      
      return {
        zoomLevel: presetZoomMap[preset],
        viewportStartMs: newStart,
        viewportEndMs: newEnd,
        autoScroll: preset === 'fit-all',
      };
    }),

  pan: (deltaMs: number) =>
    set((state) => {
      const { viewportStartMs, viewportEndMs, dataMinMs, dataMaxMs } = state;
      if (viewportStartMs === null || viewportEndMs === null) return {};
      
      let newStart = viewportStartMs + deltaMs;
      let newEnd = viewportEndMs + deltaMs;
      
      // Constrain to data bounds with buffer
      if (dataMinMs !== null && dataMaxMs !== null) {
        const dataRange = dataMaxMs - dataMinMs;
        const buffer = dataRange * 0.05;
        const hardMinMs = dataMinMs - buffer;
        const hardMaxMs = dataMaxMs + buffer;
        
        if (newStart < hardMinMs) {
          const shift = hardMinMs - newStart;
          newStart += shift;
          newEnd += shift;
        }
        if (newEnd > hardMaxMs) {
          const shift = newEnd - hardMaxMs;
          newStart -= shift;
          newEnd -= shift;
        }
      }
      
      return {
        viewportStartMs: newStart,
        viewportEndMs: newEnd,
        autoScroll: false, // User pan breaks auto-scroll
      };
    }),

  setAutoScroll: (enabled: boolean) => set({ autoScroll: enabled }),

  resetViewport: () =>
    set((state) => {
      const { dataMinMs, dataMaxMs } = state;
      if (dataMinMs === null || dataMaxMs === null) return {};
      
      const range = dataMaxMs - dataMinMs;
      const buffer = range * 0.05;
      
      return {
        viewportStartMs: dataMinMs - buffer,
        viewportEndMs: dataMaxMs + buffer,
        zoomLevel: 50,
        autoScroll: true,
      };
    }),
}));
