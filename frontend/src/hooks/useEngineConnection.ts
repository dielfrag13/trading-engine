// frontend/src/hooks/useEngineConnection.ts
// React hook to manage WebSocket connection and RPC queries to C++ engine

import { useEffect, useRef } from 'react';
import { engineWS, type RunStartMessage, type QueryOrdersResponseMessage, type QueryPositionsResponseMessage, type QueryCandlesResponseMessage, type QueryDefaultViewportResponseMessage, type EngineMessage } from '../api/engineWS';
import { useOrderStore } from '../store/orderStore';
import { useChartStore } from '../store/chartStore';

export function useEngineConnection() {
  const setOrders = useOrderStore((s) => s.setOrders);
  const setPositions = useOrderStore((s) => s.setPositions);

  // Polling state
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkConnectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const requestIdRef = useRef<number>(0);

  // Generate unique request IDs for correlation
  const generateRequestId = (): string => {
    return `req_${++requestIdRef.current}_${Date.now()}`;
  };

  // Store response handlers keyed by requestId
  const responseHandlersRef = useRef<Map<string, (data: any) => void>>(new Map());

  useEffect(() => {
    let isMounted = true;

    // Connect to WebSocket with retry logic
    const attemptConnection = () => {
      if (!isMounted) return;

      engineWS.connect()
        .then(() => {
          if (isMounted) {
            console.log('[useEngineConnection] Connected to engine server');
          }
        })
        .catch((e: unknown) => {
          if (!isMounted) return;
          console.warn('[useEngineConnection] Failed to connect to WebSocket:', e);
          
          // If connection fails, wait 2 seconds and retry
          const retryTimeout = setTimeout(() => {
            if (isMounted) {
              console.log('[useEngineConnection] Retrying connection...');
              attemptConnection();
            }
          }, 2000);
          
          // Clean up timeout on unmount
          if (!isMounted) clearTimeout(retryTimeout);
        });
    };

    // Start initial connection attempt
    attemptConnection();

    // Subscribe to ALL messages and dispatch to handlers
    const unsubscribe = engineWS.onMessage((msg: EngineMessage) => {
      if (!isMounted) return;

      try {
        // Handle RunStart - clear state and get initial balance
        if (msg.type === 'RunStart') {
          const runStart = msg as RunStartMessage;
          console.log('[useEngineConnection] RunStart received (runId: ' + runStart.data.runId + ')');

          if (runStart.data.startingBalance !== undefined) {
            useOrderStore.setState({ startingBalance: runStart.data.startingBalance });
            console.log('[useEngineConnection] Starting balance set to:', runStart.data.startingBalance);
          }

          // Clear orders and positions on new run
          useOrderStore.setState({ orders: [], positions: new Map() });
        }
        // Handle QueryOrdersResponse
        else if (msg.type === 'QueryOrdersResponse') {
          const response = msg as QueryOrdersResponseMessage;
          console.log('[useEngineConnection] QueryOrdersResponse received, requestId:', response.requestId);
          console.log('[useEngineConnection] Registered handlers:', Array.from(responseHandlersRef.current.keys()));
          const handler = responseHandlersRef.current.get(response.requestId);
          if (handler) {
            console.log('[useEngineConnection] Found handler for QueryOrdersResponse');
            handler(response);
            responseHandlersRef.current.delete(response.requestId);
          } else {
            console.warn('[useEngineConnection] No handler found for QueryOrdersResponse requestId:', response.requestId);
          }
        }
        // Handle QueryPositionsResponse
        else if (msg.type === 'QueryPositionsResponse') {
          const response = msg as QueryPositionsResponseMessage;
          console.log('[useEngineConnection] QueryPositionsResponse received, requestId:', response.requestId);
          console.log('[useEngineConnection] Registered handlers:', Array.from(responseHandlersRef.current.keys()));
          const handler = responseHandlersRef.current.get(response.requestId);
          if (handler) {
            console.log('[useEngineConnection] Found handler for QueryPositionsResponse');
            handler(response);
            responseHandlersRef.current.delete(response.requestId);
          } else {
            console.warn('[useEngineConnection] No handler found for QueryPositionsResponse requestId:', response.requestId);
          }
        }
        // Handle QueryCandlesResponse
        else if (msg.type === 'QueryCandlesResponse') {
          const response = msg as QueryCandlesResponseMessage;
          console.log('[useEngineConnection] QueryCandlesResponse received, requestId:', response.requestId);
          const handler = responseHandlersRef.current.get(response.requestId);
          if (handler) {
            handler(response);
            responseHandlersRef.current.delete(response.requestId);
          } else {
            console.warn('[useEngineConnection] No handler found for QueryCandlesResponse requestId:', response.requestId);
          }
        }
        // Handle QueryDefaultViewportResponse
        else if (msg.type === 'QueryDefaultViewportResponse') {
          const response = msg as QueryDefaultViewportResponseMessage;
          console.log('[useEngineConnection] QueryDefaultViewportResponse received, requestId:', response.requestId);
          const handler = responseHandlersRef.current.get(response.requestId);
          if (handler) {
            handler(response);
            responseHandlersRef.current.delete(response.requestId);
          } else {
            console.warn('[useEngineConnection] No handler found for QueryDefaultViewportResponse requestId:', response.requestId);
          }
        }
      } catch (error) {
        console.error('[useEngineConnection] Error processing message:', error);
      }
    });

    // Start polling loop: query positions and orders every 1000ms
    const startPolling = () => {
      console.log('[useEngineConnection] startPolling() called, pollingIntervalRef.current is:', pollingIntervalRef.current);
      pollingIntervalRef.current = setInterval(() => {
        if (!isMounted || !engineWS.isConnected()) {
          return;
        }

        // Check if we should be polling (only poll when following)
        const autoScroll = useChartStore.getState().autoScroll;
        if (!autoScroll) {
          console.log('[useEngineConnection] Polling paused (not following)');
          return;
        }

        // Read viewport values dynamically from store (not from closure)
        const currentViewportStartMs = useChartStore.getState().viewportStartMs;
        const currentViewportEndMs = useChartStore.getState().viewportEndMs;

        // Query orders
        const ordersRequestId = generateRequestId();
        console.log('[useEngineConnection] Registering handler for QueryOrders with requestId:', ordersRequestId);
        responseHandlersRef.current.set(ordersRequestId, (response: QueryOrdersResponseMessage) => {
          if (response.error) {
            console.error('[useEngineConnection] QueryOrders error:', response.error);
            return;
          }
          if (response.data) {
            // Convert backend order format to store format
            const orders = response.data.map((order) => ({
              orderId: order.orderId,
              symbol: order.symbol,
              qty: order.qty,
              filledQty: order.filledQty,
              fillPrice: order.fillPrice,
              side: order.side,
              status: order.status as any,
              timestamp: order.timestamp,
              rejectionReason: order.rejectionReason,
            }));
            setOrders(orders);
          }
        });
        engineWS.queryOrders(ordersRequestId);

        // Query positions
        const positionsRequestId = generateRequestId();
        console.log('[useEngineConnection] Registering handler for QueryPositions with requestId:', positionsRequestId);
        responseHandlersRef.current.set(positionsRequestId, (response: QueryPositionsResponseMessage) => {
          if (response.error) {
            console.error('[useEngineConnection] QueryPositions error:', response.error);
            return;
          }
          if (response.data) {
            // Convert to positions map
            const positions = new Map(response.data.map((pos) => [pos.symbol, { symbol: pos.symbol, qty: pos.qty, avgPrice: 0, timestamp: new Date().toISOString() }]));
            setPositions(positions);
          }
        });
        engineWS.queryPositions(positionsRequestId);

        // Query candles for the current viewport (1-second resolution)
        const candlesRequestId = generateRequestId();
        // Calculate optimal resolution based on viewport width
        // Goal: Keep candle count between ~100-2000 for good performance
        const calculateResolution = (viewportWidthMs: number): number => {
          const targetCandles = 500; // Target number of candles to display
          const calculatedResolutionMs = Math.floor(viewportWidthMs / targetCandles);
          
          // Snap to standard resolutions: 1s, 5s, 15s, 30s, 1m, 5m, 15m, 30m, 1h, 4h, 1d
          const standardResolutions = [
            1000,      // 1s
            5000,      // 5s
            15000,     // 15s
            30000,     // 30s
            60000,     // 1m
            300000,    // 5m
            900000,    // 15m
            1800000,   // 30m
            3600000,   // 1h
            14400000,  // 4h
            86400000,  // 1d
          ];
          
          // Find closest standard resolution that's >= calculated resolution
          for (const res of standardResolutions) {
            if (res >= calculatedResolutionMs) {
              return res;
            }
          }
          
          return standardResolutions[standardResolutions.length - 1]; // Return largest if viewport is huge
        };
        
        console.log('[useEngineConnection] Polling: viewport=', currentViewportStartMs, 'to', currentViewportEndMs);
        
        // Only query candles if viewport is defined
        if (currentViewportStartMs !== null && currentViewportEndMs !== null && currentViewportStartMs < currentViewportEndMs) {
          const viewportWidthMs = currentViewportEndMs - currentViewportStartMs;
          const resolutionMs = calculateResolution(viewportWidthMs);
          
          // Convert resolution to human-readable format for logging
          const formatResolution = (ms: number): string => {
            if (ms >= 86400000) return `${ms / 86400000}d`;
            if (ms >= 3600000) return `${ms / 3600000}h`;
            if (ms >= 60000) return `${ms / 60000}m`;
            return `${ms / 1000}s`;
          };
          
          console.log('[useEngineConnection] Querying candles: viewport width =', 
                     (viewportWidthMs / 3600000).toFixed(2), 'hours, requesting resolution =', 
                     formatResolution(resolutionMs), `(${resolutionMs}ms)`);
          
          responseHandlersRef.current.set(candlesRequestId, (response: QueryCandlesResponseMessage) => {
            if (response.error) {
              console.error('[useEngineConnection] QueryCandles error:', response.error);
              return;
            }
            if (response.data && response.data.candles) {
              console.log('[useEngineConnection] QueryCandles returned', response.data.count, 
                         'candles at resolution', formatResolution(resolutionMs));
              
              // Store candles in chart store
              const candles = response.data.candles.map((c: any) => ({
                time: c.ms, // Backend sends 'ms' not 'time'
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume: c.volume || 0,
              }));
              
              useChartStore.getState().setCandles(candles);
            }
          });
          
          // Query candles for the current viewport range
          engineWS.queryCandles(candlesRequestId, 'BTCUSD', resolutionMs, currentViewportStartMs, currentViewportEndMs);
        } else {
          console.warn('[useEngineConnection] Skipping candle query - invalid viewport:', { viewportStartMs: currentViewportStartMs, viewportEndMs: currentViewportEndMs });
        }
      }, 1000);
    };

    // Start polling after connection is established
    const startCheckConnectionLoop = () => {
      if (checkConnectionIntervalRef.current !== null) {
        console.log('[useEngineConnection] Clearing existing connection check interval');
        clearInterval(checkConnectionIntervalRef.current);
      }
      
      console.log('[useEngineConnection] Creating new connection check interval');
      checkConnectionIntervalRef.current = setInterval(() => {
        const isConn = engineWS.isConnected();
        const hasPolling = pollingIntervalRef.current !== null;
        
        if (isConn && !hasPolling) {
          console.log('[useEngineConnection] WebSocket connected, starting initialization');
          
          // Clear the check interval since we're starting initialization
          if (checkConnectionIntervalRef.current) {
            clearInterval(checkConnectionIntervalRef.current);
            checkConnectionIntervalRef.current = null;
          }
          
          // Query default viewport on first connection to initialize viewport bounds
          let viewportQueryAttempts = 0;
          const maxAttempts = 5;
          
          const queryViewport = () => {
            // Check if still connected before attempting to send
            if (!engineWS.isConnected()) {
              console.warn('[useEngineConnection] WebSocket disconnected before viewport query, will retry in 1 second');
              setTimeout(() => queryViewport(), 1000);
              return;
            }
            
            viewportQueryAttempts++;
            const viewportRequestId = generateRequestId();
            console.log('[useEngineConnection] Sending QueryDefaultViewport (attempt ' + viewportQueryAttempts + '), requestId: ' + viewportRequestId);
          
          // Set a timeout fallback: if we don't get a response in 5 seconds, start polling anyway
          const timeoutHandle = setTimeout(() => {
            console.warn('[useEngineConnection] Viewport query timeout after 5s, starting polling anyway');
            if (responseHandlersRef.current.has(viewportRequestId)) {
              responseHandlersRef.current.delete(viewportRequestId);
            }
            if (!pollingIntervalRef.current) {
              console.log('[useEngineConnection] Timeout triggered, calling startPolling()');
              startPolling();
            }
          }, 5000);
          
          responseHandlersRef.current.set(viewportRequestId, (response: QueryDefaultViewportResponseMessage) => {
            console.log('[useEngineConnection] Received QueryDefaultViewportResponse, requestId: ' + response.requestId);
            clearTimeout(timeoutHandle);
            
            if (response.error) {
              if (response.error === 'NoDataYet') {
                console.log('[useEngineConnection] No data available yet, will retry in 1 second');
                // Retry after 1 second
                setTimeout(() => queryViewport(), 1000);
              } else {
                console.error('[useEngineConnection] QueryDefaultViewport error:', response.error);
                // Retry on error
                if (viewportQueryAttempts < maxAttempts) {
                  console.log('[useEngineConnection] Retrying viewport query, attempt ' + (viewportQueryAttempts + 1) + ' of ' + maxAttempts);
                  setTimeout(() => queryViewport(), 1000);
                } else {
                  console.error('[useEngineConnection] Max viewport query attempts reached, starting polling anyway');
                  if (!pollingIntervalRef.current) {
                    startPolling();
                  }
                }
              }
              return;
            }
            if (response.data) {
              console.log('[useEngineConnection] Setting default viewport:', response.data.startMs, 'to', response.data.endMs);
              useChartStore.setState({
                viewportStartMs: response.data.startMs,
                viewportEndMs: response.data.endMs,
              });
              // Only start polling after we have a valid viewport
              console.log('[useEngineConnection] Viewport set, calling startPolling()');
              if (!pollingIntervalRef.current) {
                startPolling();
              }
            }
          });
          
          try {
            console.log('[useEngineConnection] About to call engineWS.queryDefaultViewport()');
            engineWS.queryDefaultViewport(viewportRequestId);
            console.log('[useEngineConnection] queryDefaultViewport send completed');
          } catch (e) {
            console.error('[useEngineConnection] Error sending viewport query:', e);
            if (viewportQueryAttempts < maxAttempts) {
              console.log('[useEngineConnection] Retrying after send error, attempt ' + (viewportQueryAttempts + 1) + ' of ' + maxAttempts);
              setTimeout(() => queryViewport(), 1000);
            } else {
              console.error('[useEngineConnection] Failed to send viewport query after ' + maxAttempts + ' retries, starting polling anyway');
              if (!pollingIntervalRef.current) {
                startPolling();
              }
            }
          }
        };
        
        queryViewport();
      }
      }, 100);
    };

    // Start the connection check loop
    startCheckConnectionLoop();

    // Subscribe to status changes to handle disconnections
    const unsubscribeStatus = engineWS.onStatusChange((status) => {
      console.log('[useEngineConnection] Connection status changed to:', status);
      
      if (status === 'disconnected' || status === 'error') {
        // Clear polling interval on disconnect
        if (pollingIntervalRef.current) {
          console.log('[useEngineConnection] Clearing polling interval due to disconnection');
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        
        // Restart the connection check loop
        console.log('[useEngineConnection] Restarting connection check loop');
        startCheckConnectionLoop();
      }
    });

    // Cleanup on unmount
    return () => {
      isMounted = false;
      if (checkConnectionIntervalRef.current) {
        clearInterval(checkConnectionIntervalRef.current);
        checkConnectionIntervalRef.current = null;
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      unsubscribe();
      unsubscribeStatus();
      engineWS.disconnect();
      responseHandlersRef.current.clear();
    };
  }, [setOrders, setPositions]);
}

