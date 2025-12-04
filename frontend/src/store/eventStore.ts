// frontend/src/store/eventStore.ts
// Unified event store merging price ticks and order events into a single timeline
import { create } from 'zustand';

export type TickEvent = {
  type: 'tick';
  timestamp: string;
  symbol: string;
  price: number;
  ms: number; // milliseconds epoch for fast comparison
};

export type OrderFilledEvent = {
  type: 'orderFilled';
  timestamp: string;
  orderId: number;
  symbol: string;
  side: 'Buy' | 'Sell';
  fillPrice: number;
  filledQty: number;
  ms: number; // milliseconds epoch for fast comparison
};

export type ChartEvent = TickEvent | OrderFilledEvent;

type EventState = {
  events: ChartEvent[];
  minTime: number | null; // earliest event timestamp in ms
  maxTime: number | null; // latest event timestamp in ms
  addTick: (symbol: string, price: number, timestamp: string) => void;
  addOrderFilled: (orderId: number, symbol: string, side: 'Buy' | 'Sell', fillPrice: number, filledQty: number, timestamp: string) => void;
  clear: () => void;
  getEventsByTimeRange: (startMs: number, endMs: number) => ChartEvent[];
  getAllEvents: () => ChartEvent[];
};

export const useEventStore = create<EventState>((set, get) => ({
  events: [],
  minTime: null,
  maxTime: null,

  addTick: (symbol: string, price: number, timestamp: string) =>
    set((state) => {
      const ms = new Date(timestamp).getTime();
      const newEvent: TickEvent = {
        type: 'tick',
        timestamp,
        symbol,
        price,
        ms,
      };
      
      // Insert in sorted order to maintain chronological sequence
      const newEvents = [...state.events, newEvent].sort((a, b) => a.ms - b.ms);
      
      // Limit to last 500 events to avoid unbounded growth
      if (newEvents.length > 500) {
        newEvents.shift();
      }
      
      const newMinTime = newEvents.length > 0 ? newEvents[0].ms : null;
      const newMaxTime = newEvents.length > 0 ? newEvents[newEvents.length - 1].ms : null;
      
      return {
        events: newEvents,
        minTime: newMinTime,
        maxTime: newMaxTime,
      };
    }),

  addOrderFilled: (orderId: number, symbol: string, side: 'Buy' | 'Sell', fillPrice: number, filledQty: number, timestamp: string) =>
    set((state) => {
      const ms = new Date(timestamp).getTime();
      const newEvent: OrderFilledEvent = {
        type: 'orderFilled',
        timestamp,
        orderId,
        symbol,
        side,
        fillPrice,
        filledQty,
        ms,
      };
      
      // Insert in sorted order
      const newEvents = [...state.events, newEvent].sort((a, b) => a.ms - b.ms);
      
      // Limit to last 500 events
      if (newEvents.length > 500) {
        newEvents.shift();
      }
      
      const newMinTime = newEvents.length > 0 ? newEvents[0].ms : null;
      const newMaxTime = newEvents.length > 0 ? newEvents[newEvents.length - 1].ms : null;
      
      return {
        events: newEvents,
        minTime: newMinTime,
        maxTime: newMaxTime,
      };
    }),

  clear: () =>
    set({
      events: [],
      minTime: null,
      maxTime: null,
    }),

  getEventsByTimeRange: (startMs: number, endMs: number) => {
    const { events } = get();
    return events.filter((e) => e.ms >= startMs && e.ms <= endMs);
  },

  getAllEvents: () => {
    const { events } = get();
    return events;
  },
}));
