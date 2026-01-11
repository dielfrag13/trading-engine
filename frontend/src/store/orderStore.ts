// src/store/orderStore.ts
import { create } from 'zustand';

export type OrderStatus = 'WORKING' | 'FILLED' | 'PARTIALLY_FILLED' | 'REJECTED' | 'CANCELED';

export type Order = {
  orderId: number;
  symbol: string;
  qty: number;
  filledQty: number;
  fillPrice: number;
  side: 'Buy' | 'Sell';
  status: OrderStatus;
  timestamp: string;
  rejectionReason?: string;
};

type OrderState = {
  orders: Order[];
  positions: Map<string, Position>;
  startingBalance: number | null;
  addOrder: (order: Order) => void;
  updateOrderStatus: (orderId: number, status: OrderStatus, filledQty?: number, fillPrice?: number) => void;
  rejectOrder: (orderId: number, reason: string) => void;
  updatePosition: (symbol: string, qty: number, avgPrice: number) => void;
  getPosition: (symbol: string) => Position | null;
  clearOrders: () => void;
  setStartingBalance: (balance: number) => void;
  setOrders: (orders: Order[]) => void;
  setPositions: (positions: Map<string, Position>) => void;
  getFilledOrders: () => Order[];
  getUnrealizedPnL: (currentPrice: number) => number;
  getAllPositions: () => Position[];
};

export type Position = {
  symbol: string;
  qty: number;
  avgPrice: number;
  unrealizedPnL?: number;
  timestamp: string;
};

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: [],
  positions: new Map(),
  startingBalance: null, // Will be set by RunStart message from backend

  addOrder: (order: Order) =>
    set((state) => {
      // Check if order with this ID already exists
      if (state.orders.some((o) => o.orderId === order.orderId)) {
        console.warn('[OrderStore] Order with ID', order.orderId, 'already exists, skipping');
        return { orders: state.orders };
      }
      return { orders: [...state.orders, order] };
    }),

  updateOrderStatus: (orderId: number, status: OrderStatus, filledQty?: number, fillPrice?: number) =>
    set((state) => ({
      orders: state.orders.map((o) =>
        o.orderId === orderId
          ? {
              ...o,
              status,
              ...(filledQty !== undefined && { filledQty }),
              ...(fillPrice !== undefined && { fillPrice }),
            }
          : o
      ),
    })),

  rejectOrder: (orderId: number, reason: string) =>
    set((state) => ({
      orders: state.orders.map((o) =>
        o.orderId === orderId
          ? {
              ...o,
              status: 'REJECTED',
              rejectionReason: reason,
            }
          : o
      ),
    })),

  updatePosition: (symbol: string, qty: number, avgPrice: number) =>
    set((state) => {
      const newPositions = new Map(state.positions);
      newPositions.set(symbol, {
        symbol,
        qty,
        avgPrice,
        timestamp: new Date().toISOString(),
      });
      return { positions: newPositions };
    }),

  getPosition: (symbol: string) => {
    const { positions } = get();
    return positions.get(symbol) || null;
  },

  getFilledOrders: () => {
    const { orders } = get();
    return orders.filter((o) => o.status === 'FILLED' || o.status === 'PARTIALLY_FILLED');
  },

  getUnrealizedPnL: (currentPrice: number) => {
    const { positions } = get();
    let totalPnL = 0;
    positions.forEach((pos) => {
      const priceDelta = currentPrice - pos.avgPrice;
      const positionPnL = priceDelta * pos.qty;
      totalPnL += positionPnL;
    });
    return totalPnL;
  },

  getAllPositions: () => {
    const { positions } = get();
    return Array.from(positions.values());
  },

  clearOrders: () => set({ orders: [], positions: new Map() }),

  setStartingBalance: (balance: number) => set({ startingBalance: balance }),

  setOrders: (orders: Order[]) => set({ orders }),

  setPositions: (positions: Map<string, Position>) => set({ positions }),
}));
