// src/store/tickStore.ts
import { create } from 'zustand';

export type Tick = {
  symbol: string;
  last: number;
  ts: string; // ISO timestamp
};

type TickState = {
  ticks: Tick[];
  addTick: (tick: Tick) => void;
  clear: () => void;
};

export const useTickStore = create<TickState>((set) => ({
  ticks: [],
  addTick: (tick: Tick) =>
    set((state) => {
      const next = [...state.ticks, tick];
      // limit to last 200 ticks to avoid unbounded growth
      if (next.length > 200) {
        next.shift();
      }
      return { ticks: next };
    }),
  clear: () => set({ ticks: [] }),
}));
