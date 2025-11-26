// src/store/tickStore.ts
import { create } from 'zustand';

export type Tick = {
  symbol: string;
  last: number;
  ts: string | number; // ISO timestamp (string) or epoch milliseconds (number)
};

type TickState = {
  ticks: Tick[];
  currentRunId: string | null;
  addTick: (tick: Tick) => void;
  setRunId: (runId: string) => void;
  clear: () => void;
};

export const useTickStore = create<TickState>((set) => ({
  ticks: [],
  currentRunId: null,
  addTick: (tick: Tick) =>
    set((state) => {
      const next = [...state.ticks, tick];
      // limit to last 200 ticks to avoid unbounded growth
      if (next.length > 200) {
        next.shift();
      }
      return { ticks: next };
    }),
  setRunId: (runId: string) => set({ currentRunId: runId }),
  clear: () => set({ ticks: [], currentRunId: null }),
}));
