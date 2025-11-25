// src/hooks/useMockTickStream.ts
// This will simulate the BrokerMarketData / ProviderMarketData behavior on the frontend side.
// Later, we’ll replace this hook with a real useWebSocketStream that connects to the C++ engine.
import { useEffect } from 'react';
import { useTickStore } from '../store/tickStore';

export function useMockTickStream(symbol = 'BTCUSD') {
  const addTick = useTickStore((s) => s.addTick);

  useEffect(() => {
    let price = 600.0;
    const intervalMs = 1000;

    const id = setInterval(() => {
      // biased random walk, similar to your C++ demo
      const forward = Math.random() < 0.7; // 70% chance to bump up a bit
      const delta = (forward ? 1 : -1) * Math.random() * 2; // up to ±2
      price = Math.max(1, price + delta);

      addTick({
        symbol,
        last: Number(price.toFixed(2)),
        ts: new Date().toISOString(),
      });
    }, intervalMs);

    return () => clearInterval(id);
  }, [addTick, symbol]);
}
