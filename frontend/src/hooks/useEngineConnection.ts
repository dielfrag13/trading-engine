// frontend/src/hooks/useEngineConnection.ts
// React hook to manage WebSocket connection to C++ engine and dispatch events to stores

import { useEffect, useRef } from 'react';
import { engineWS, type ProviderTickMessage, type RunStartMessage, type OrderPlacedMessage, type OrderFilledMessage, type OrderRejectedMessage, type PositionUpdatedMessage, type EngineMessage } from '../api/engineWS';
import { useEventStore } from '../store/eventStore';
import { useOrderStore, type Order as StoreOrder, type OrderStatus } from '../store/orderStore';

export function useEngineConnection() {
  const addTick = useEventStore((s) => s.addTick);
  const addOrderFilled = useEventStore((s) => s.addOrderFilled);

  const addOrder = useOrderStore((s) => s.addOrder);
  const updateOrderStatus = useOrderStore((s) => s.updateOrderStatus);
  const rejectOrder = useOrderStore((s) => s.rejectOrder);
  const updatePosition = useOrderStore((s) => s.updatePosition);
  const clearOrders = useOrderStore((s) => s.clearOrders);

  // Track processed messages to avoid duplicates from StrictMode
  const processedMessagesRef = useRef<Set<string>>(new Set());

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
        } 
        else if (msg.type === 'ProviderTick') {
          const tick = msg as ProviderTickMessage;
          addTick(
            tick.data.symbol,
            tick.data.price,
            tick.data.timestamp
          );
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
          
          console.log('[useEngineConnection] Order placed: #' + orderPlaced.data.orderId + ' (' + orderPlaced.data.side + ') at ' + orderPlaced.data.timestamp);
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
          
          console.log('[useEngineConnection] Order filled: #' + orderFilled.data.orderId + ' at $' + orderFilled.data.fillPrice.toFixed(2) + ' on ' + orderFilled.data.timestamp);
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
            orderFilled.data.timestamp
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
    };
  }, [addTick, addOrderFilled, addOrder, updateOrderStatus, rejectOrder, updatePosition, clearOrders]);
}
