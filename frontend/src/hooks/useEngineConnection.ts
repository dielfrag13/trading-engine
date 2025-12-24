// frontend/src/hooks/useEngineConnection.ts
// React hook to manage WebSocket connection to C++ engine and dispatch events to stores

import { useEffect, useRef } from 'react';
import { engineWS, type ProviderTickMessage, type RunStartMessage, type OrderPlacedMessage, type OrderFilledMessage, type OrderRejectedMessage, type PositionUpdatedMessage, type EngineMessage } from '../api/engineWS';
import { useEventStore } from '../store/eventStore';
import { useOrderStore, type Order as StoreOrder, type OrderStatus } from '../store/orderStore';

export function useEngineConnection() {
  const addTick = useEventStore((s) => s.addTick);
  const addOrderFilled = useEventStore((s) => s.addOrderFilled);
  const clearEvents = useEventStore((s) => s.clear);

  const addOrder = useOrderStore((s) => s.addOrder);
  const updateOrderStatus = useOrderStore((s) => s.updateOrderStatus);
  const rejectOrder = useOrderStore((s) => s.rejectOrder);
  const updatePosition = useOrderStore((s) => s.updatePosition);
  const clearOrders = useOrderStore((s) => s.clearOrders);

  // Track processed messages to avoid duplicates from StrictMode
  const processedMessagesRef = useRef<Set<string>>(new Set());

  // Throttle rendering: batch tick updates every 250ms instead of rendering each tick
  const THROTTLE_MS = 250;
  const pendingTicksRef = useRef<Array<{symbol: string; price: number; timestamp: string; ms?: number}>>([]);
  const lastRenderTimeRef = useRef<number>(0);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper to flush pending ticks - render the latest state
  const flushPendingTicks = () => {
    if (pendingTicksRef.current.length > 0) {
      // Take only the LAST tick to avoid rendering intermediate states
      const lastTick = pendingTicksRef.current[pendingTicksRef.current.length - 1];
      addTick(lastTick.symbol, lastTick.price, lastTick.timestamp, lastTick.ms);
      pendingTicksRef.current = [];
      lastRenderTimeRef.current = Date.now();
    }
  };

  useEffect(() => {
    let isMounted = true;
    processedMessagesRef.current.clear();

    // Connect to the WebSocket server
    engineWS.connect()
      .then(() => {
        if (isMounted) {
          console.log('[useEngineConnection] Connected to engine server');
        }
      })
      .catch((e: unknown) => {
        if (isMounted) {
          console.warn('[useEngineConnection] Failed to connect to WebSocket:', e);
          console.info('[useEngineConnection] Make sure C++ backend is running on port 8080');
        }
      });

    // Subscribe to messages - this is safe to call even if connection fails
    const unsubscribe = engineWS.onMessage((msg: EngineMessage) => {
      if (!isMounted) return;
      
      try {
        if (msg.type === 'RunStart') {
          const runStart = msg as RunStartMessage;
          console.log('[useEngineConnection] RunStart received (runId: ' + runStart.data.runId + ')');
          // Automatically clear events from previous runs to maintain clean state
          clearEvents();
        } 
        else if (msg.type === 'ProviderTick') {
          const tick = msg as ProviderTickMessage;
          addTick(
            tick.data.symbol,
            tick.data.price,
            tick.data.timestamp
          );
        }
        else if (msg.type === 'ChartCandle') {
          // Primary data source: aggregated candles from the backend
          // Throttle rendering: queue updates and render in batches every 250ms
          const candle = msg as any;
          
          // Queue the tick instead of rendering immediately
          pendingTicksRef.current.push({
            symbol: candle.data.symbol,
            price: candle.data.close,
            timestamp: candle.data.open_time,
            ms: candle.data.ms,
          });
          
          const now = Date.now();
          const timeSinceLastRender = now - lastRenderTimeRef.current;
          
          // If we haven't rendered recently, flush immediately
          if (timeSinceLastRender >= THROTTLE_MS) {
            if (throttleTimerRef.current) {
              clearTimeout(throttleTimerRef.current);
              throttleTimerRef.current = null;
            }
            flushPendingTicks();
          } else if (!throttleTimerRef.current) {
            // Otherwise, schedule a flush for later
            const timeUntilNextRender = THROTTLE_MS - timeSinceLastRender;
            throttleTimerRef.current = setTimeout(() => {
              throttleTimerRef.current = null;
              flushPendingTicks();
            }, timeUntilNextRender);
          }
          // If timer is already pending, do nothing - we'll flush when it fires
        }
        else if (msg.type === 'OrderPlaced') {
          const orderPlaced = msg as OrderPlacedMessage;
          // Deduplicate based on orderId + timestamp, not just orderId
          // This allows same IDs across different runs (different timestamps)
          const msgKey = `OrderPlaced-${orderPlaced.data.orderId}-${orderPlaced.data.timestamp}`;
          
          // Skip if we've already processed this exact message (StrictMode double-invoke protection)
          if (processedMessagesRef.current.has(msgKey)) {
            return;
          }
          processedMessagesRef.current.add(msgKey);
          
          // Silenced: console.log('[useEngineConnection] Order placed...');
          const storeOrder: StoreOrder = {
            orderId: orderPlaced.data.orderId,
            symbol: orderPlaced.data.symbol,
            qty: orderPlaced.data.qty,
            filledQty: 0,
            fillPrice: orderPlaced.data.limitPrice,
            side: orderPlaced.data.side,
            status: 'WORKING',
            timestamp: orderPlaced.data.timestamp,
          };
          addOrder(storeOrder);
        }
        else if (msg.type === 'OrderFilled') {
          const orderFilled = msg as OrderFilledMessage;
          // Deduplicate based on orderId + timestamp, not just orderId
          const msgKey = `OrderFilled-${orderFilled.data.orderId}-${orderFilled.data.timestamp}`;
          
          // Skip if we've already processed this exact message (StrictMode double-invoke protection)
          if (processedMessagesRef.current.has(msgKey)) {
            return;
          }
          processedMessagesRef.current.add(msgKey);
          
          // Silenced: console.log('[useEngineConnection] Order filled...');
          const status: OrderStatus = orderFilled.data.status === 'FILLED' ? 'FILLED' : 'PARTIALLY_FILLED';
          updateOrderStatus(
            orderFilled.data.orderId,
            status,
            orderFilled.data.filledQty,
            orderFilled.data.fillPrice
          );
          
          // Add filled order to event store for chart display
          addOrderFilled(
            orderFilled.data.orderId,
            orderFilled.data.symbol,
            orderFilled.data.side,
            orderFilled.data.fillPrice,
            orderFilled.data.filledQty,
            orderFilled.data.timestamp,
            orderFilled.data.ms  // Use millisecond epoch if available
          );
          
          // Update position
          const isLong = orderFilled.data.side === 'Buy';
          const qtyDelta = isLong ? orderFilled.data.filledQty : -orderFilled.data.filledQty;
          const currentPos = useOrderStore.getState().getPosition(orderFilled.data.symbol);
          let newQty = qtyDelta;
          let newAvgPrice = orderFilled.data.fillPrice;
          
          if (currentPos) {
            // Update average price based on weighted average
            const totalCost = (currentPos.qty * currentPos.avgPrice) + (qtyDelta * orderFilled.data.fillPrice);
            newQty = currentPos.qty + qtyDelta;
            newAvgPrice = newQty !== 0 ? Math.abs(totalCost / newQty) : 0;
          }
          
          updatePosition(orderFilled.data.symbol, newQty, newAvgPrice);
        }
        else if (msg.type === 'OrderRejected') {
          const orderRejected = msg as OrderRejectedMessage;
          console.log('[useEngineConnection] Order rejected:', orderRejected.data.orderId);
          rejectOrder(orderRejected.data.orderId, orderRejected.data.reason);
        }
        else if (msg.type === 'PositionUpdated') {
          const positionUpdated = msg as PositionUpdatedMessage;
          console.log('[useEngineConnection] Position updated:', positionUpdated.data.symbol);
          updatePosition(
            positionUpdated.data.symbol,
            positionUpdated.data.qty,
            positionUpdated.data.avgPrice
          );
        }
      } catch (error) {
        console.error('[useEngineConnection] Error processing message:', error);
      }
    });

    // Cleanup on unmount
    return () => {
      isMounted = false;
      unsubscribe();
      engineWS.disconnect();
      // Clear any pending throttle timer
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      // Flush any remaining ticks
      flushPendingTicks();
    };
  }, [addTick, addOrderFilled, addOrder, updateOrderStatus, rejectOrder, updatePosition, clearOrders]);
}
