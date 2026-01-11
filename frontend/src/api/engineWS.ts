// frontend/src/api/engineWS.ts
// WebSocket client for receiving market data from C++ engine backend

export interface ProviderTickMessage {
  type: 'ProviderTick';
  data: {
    symbol: string;
    price: number;
    timestamp: string;
  };
}

export interface RunStartMessage {
  type: 'RunStart';
  data: {
    runId: string;
    timestamp: string;
    startingBalance?: number;  // From broker (optional for backward compatibility)
  };
}

export interface OrderPlacedMessage {
  type: 'OrderPlaced';
  data: {
    orderId: number;
    symbol: string;
    qty: number;
    side: 'Buy' | 'Sell';
    limitPrice: number;
    status: 'WORKING';
    timestamp: string;
    ms?: number;  // Millisecond epoch for chart positioning
  };
}

export interface OrderFilledMessage {
  type: 'OrderFilled';
  data: {
    orderId: number;
    symbol: string;
    filledQty: number;
    fillPrice: number;
    side: 'Buy' | 'Sell';
    status: 'FILLED' | 'PARTIALLY_FILLED';
    timestamp: string;
    ms?: number;  // Millisecond epoch for chart positioning
  };
}

export interface OrderRejectedMessage {
  type: 'OrderRejected';
  data: {
    orderId: number;
    symbol: string;
    qty: number;
    side: 'Buy' | 'Sell';
    reason: string;
    timestamp: string;
    ms?: number;  // Millisecond epoch for chart positioning
  };
}

export interface PositionUpdatedMessage {
  type: 'PositionUpdated';
  data: {
    symbol: string;
    qty: number;
    avgPrice: number;
    timestamp: string;
  };
}

export interface ChartCandleMessage {
  type: 'ChartCandle';
  data: {
    symbol: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    open_time: string;
    ms: number; // Millisecond epoch for precise viewport positioning
  };
}

export interface QueryPositionsResponseMessage {
  type: 'QueryPositionsResponse';
  requestId: string;
  data?: Array<{
    symbol: string;
    qty: number;
  }>;
  error?: string;
}

export interface QueryOrdersResponseMessage {
  type: 'QueryOrdersResponse';
  requestId: string;
  data?: Array<{
    orderId: number;
    symbol: string;
    qty: number;
    side: 'Buy' | 'Sell';
    status: string;
    filledQty: number;
    fillPrice: number;
    timestamp: string;
    rejectionReason?: string;
  }>;
  error?: string;
}

export interface QueryCandlesResponseMessage {
  type: 'QueryCandlesResponse';
  requestId: string;
  data?: {
    symbol: string;
    resolutionMs: number;
    candles: Array<{
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
      open_time: string;
      ms: number;
    }>;
    count: number;
    isTruncated: boolean;
  };
  error?: string;
}

export interface QueryDefaultViewportResponseMessage {
  type: 'QueryDefaultViewportResponse';
  requestId: string;
  data?: {
    symbol: string;
    startMs: number;
    endMs: number;
  };
  error?: string;
}

export type EngineMessage = ProviderTickMessage | RunStartMessage | OrderPlacedMessage | OrderFilledMessage | OrderRejectedMessage | PositionUpdatedMessage | ChartCandleMessage | QueryOrdersResponseMessage | QueryPositionsResponseMessage | QueryCandlesResponseMessage | QueryDefaultViewportResponseMessage;

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Global response handler registry for RPC responses
 */
class ResponseHandlerRegistry {
  private handlers = new Map<string, (data: any) => void>();

  register(requestId: string, handler: (data: any) => void): void {
    this.handlers.set(requestId, handler);
  }

  handle(requestId: string, data: any): boolean {
    const handler = this.handlers.get(requestId);
    if (handler) {
      handler(data);
      this.handlers.delete(requestId);
      return true;
    }
    return false;
  }

  getHandlers(): Map<string, (data: any) => void> {
    return this.handlers;
  }
}

export const responseHandlerRegistry = new ResponseHandlerRegistry();

/**
 * WebSocket client for receiving market ticks from the C++ backend
 */
export class EngineTickClient {
  private messageHandlers: Set<(msg: EngineMessage) => void> = new Set();
  private statusHandlers: Set<(status: ConnectionStatus) => void> = new Set();
  private ws: WebSocket | null = null;
  private reconnectInterval: ReturnType<typeof setInterval> | null = null;
  private readonly wsUrl = 'ws://localhost:8080';
  private reconnectAttempts = 0;
  private connectionStatus: ConnectionStatus = 'disconnected';
  
  // Queue monitoring
  private messageQueue: EngineMessage[] = [];
  private messageStats = {
    totalReceived: 0,
    totalProcessed: 0,
    queueDepth: 0,
    messageTypeCount: {} as Record<string, number>,
    lastLogTime: Date.now(),
  };
  private readonly STATS_LOG_INTERVAL = 5000; // Log stats every 5 seconds

  /**
   * Connect to the WebSocket server
   */
  async connect(): Promise<void> {
    if (this.connectionStatus === 'connecting' || this.connectionStatus === 'connected') {
      console.log('[EngineTickClient] Already connecting or connected');
      return;
    }

    // Clear any existing WebSocket before creating a new one
    if (this.ws) {
      console.log('[EngineTickClient] Closing existing WebSocket before reconnect');
      this.ws.onclose = null; // Remove handler to prevent reconnect loop
      this.ws.close();
      this.ws = null;
    }

    this.setStatus('connecting');
    console.log('[EngineTickClient] Connecting to WebSocket:', this.wsUrl);
    
    return new Promise((resolve, reject) => {
      try {
        const newWs = new WebSocket(this.wsUrl);

        newWs.onopen = () => {
          // Only update if this is still the current WebSocket
          if (this.ws === newWs) {
            console.log('[EngineTickClient] WebSocket connected');
            this.reconnectAttempts = 0;
            this.setStatus('connected');
            resolve();
          }
        };

        newWs.onmessage = (event) => {
          if (this.ws === newWs) {
            this.onMessageReceived(event.data);
          }
        };

        newWs.onerror = (error) => {
          if (this.ws === newWs) {
            console.error('[EngineTickClient] WebSocket error:', error);
            this.setStatus('error');
            reject(error);
          }
        };

        newWs.onclose = () => {
          if (this.ws === newWs) {
            console.log('[EngineTickClient] WebSocket disconnected');
            this.ws = null;
            this.setStatus('disconnected');
            this.startReconnect();
          }
        };
        
        // Assign the new WebSocket AFTER setting up handlers
        this.ws = newWs;
      } catch (e) {
        console.error('[EngineTickClient] Failed to create WebSocket:', e);
        this.setStatus('error');
        reject(e);
      }
    });
  }

  /**
   * Subscribe to tick messages
   */
  onMessage(handler: (msg: EngineMessage) => void): () => void {
    this.messageHandlers.add(handler);
    // Return unsubscribe function
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  /**
   * Subscribe to connection status changes
   */
  onStatusChange(handler: (status: ConnectionStatus) => void): () => void {
    this.statusHandlers.add(handler);
    // Immediately call with current status
    handler(this.connectionStatus);
    // Return unsubscribe function
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  /**
   * Send a command to the server (e.g., clear)
   */
  send(msg: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
        console.log('[EngineTickClient] Sent command:', msg);
      } catch (e) {
        console.error('[EngineTickClient] Failed to send message:', e);
      }
    } else {
      console.warn('[EngineTickClient] WebSocket not connected');
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    // Check both the state variable AND the actual WebSocket readyState
    // This ensures we don't report as connected if the WebSocket closed unexpectedly
    const statusCheck = this.connectionStatus === 'connected';
    const wsNotNull = this.ws !== null;
    const readyStateCheck = this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    const result = statusCheck && wsNotNull && readyStateCheck;
    
    // Debug logging when there's a discrepancy
    if (statusCheck && (!wsNotNull || !readyStateCheck)) {
      console.log('[EngineTickClient] isConnected() discrepancy:', {
        status: this.connectionStatus,
        wsNotNull,
        readyState: this.ws?.readyState,
        OPEN: WebSocket.OPEN,
        result
      });
    }
    
    return result;
  }

  /**
   * Send a QueryPositions request to get current positions from backend
   */
  queryPositions(requestId: string): void {
    const msg = {
      type: 'QueryPositions',
      requestId,
    };
    this.send(msg);
  }

  /**
   * Send a QueryOrders request to get all orders from backend
   */
  queryOrders(requestId: string): void {
    const msg = {
      type: 'QueryOrders',
      requestId,
    };
    this.send(msg);
  }

  /**
   * Send a QueryCandles request to get candles for a symbol/timeframe/range
   */
  queryCandles(requestId: string, symbol: string, resolutionMs: number, startMs: number, endMs: number): void {
    const msg = {
      type: 'QueryCandles',
      requestId,
      data: {
        symbol,
        resolutionMs,
        startMs,
        endMs,
      },
    };
    this.send(msg);
  }

  /**
   * Query the default viewport from backend (e.g., last 24h of data)
   */
  queryDefaultViewport(requestId: string): void {
    const msg = {
      type: 'QueryDefaultViewport',
      requestId,
    };
    this.send(msg);
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Get current queue statistics for debugging/monitoring
   */
  getStats() {
    return this.getQueueStats();
  }

  /**
   * Stop the connection
   */
  disconnect(): void {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      console.log('[EngineTickClient] Disconnected');
    }
    this.setStatus('disconnected');
  }

  /**
   * Manually attempt reconnection immediately (for user clicks)
   */
  async reconnect(): Promise<void> {
    console.log('[EngineTickClient] Manual reconnection requested');
    // Clear any pending reconnect timers
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }
    // Reset attempt counter for fresh start
    this.reconnectAttempts = 0;
    // Attempt immediate connection
    return this.connect();
  }

  /**
   * Clear the chart by sending a clear command to the server
   */
  async clearTicks(): Promise<void> {
    console.log('[EngineTickClient] Sending clear command');
    this.send({ command: 'clear' });
  }

  /**
   * Handle incoming messages from the server
   */
  private onMessageReceived(rawData: string) {
    try {
      const msg = JSON.parse(rawData) as EngineMessage;
      
      // Track statistics
      this.messageStats.totalReceived++;
      const msgType = msg.type;
      this.messageStats.messageTypeCount[msgType] = (this.messageStats.messageTypeCount[msgType] || 0) + 1;
      this.messageQueue.push(msg);
      this.messageStats.queueDepth = this.messageQueue.length;
      
      // Log query responses
      if (msgType === 'QueryOrdersResponse' || msgType === 'QueryPositionsResponse' || msgType === 'QueryDefaultViewportResponse' || msgType === 'QueryCandlesResponse') {
        console.log(`[EngineTickClient] Received ${msgType} with requestId:`, (msg as any).requestId);
        
        // Try to handle via registry first (for manual queries, etc)
        const requestId = (msg as any).requestId;
        if (requestId && responseHandlerRegistry.handle(requestId, msg)) {
          console.log(`[EngineTickClient] Handled ${msgType} via registry`);
        }
      }
      
      // Process message immediately
      this.messageHandlers.forEach((handler) => {
        try {
          handler(msg);
        } catch (e) {
          console.error('[EngineTickClient] Handler error:', e);
        }
      });
      this.messageStats.totalProcessed++;
      this.messageQueue.shift(); // Remove from queue after processing
      
      // Log stats periodically
      const now = Date.now();
      if (now - this.messageStats.lastLogTime >= this.STATS_LOG_INTERVAL) {
        this.logQueueStats();
        this.messageStats.lastLogTime = now;
      }
    } catch (e) {
      console.error('[EngineTickClient] Failed to parse message:', e);
    }
  }

  /**
   * Log current queue statistics to console and window object
   */
  private logQueueStats() {
    const stats = {
      queueDepth: this.messageStats.queueDepth,
      totalReceived: this.messageStats.totalReceived,
      totalProcessed: this.messageStats.totalProcessed,
      lag: this.messageStats.totalReceived - this.messageStats.totalProcessed,
      messageTypes: this.messageStats.messageTypeCount,
    };
    
    console.log('[EngineTickClient] Queue Stats:', stats);
    
    // Also expose on window for easy inspection in DevTools console
    (window as any).wsQueueStats = stats;
    
    // Alert if queue is building up
    if (stats.lag > 100) {
      console.warn('[EngineTickClient] WARNING: Message queue lag is', stats.lag, '- processing falling behind!');
    }
  }

  /**
   * Get current queue statistics
   */
  getQueueStats() {
    return {
      queueDepth: this.messageStats.queueDepth,
      totalReceived: this.messageStats.totalReceived,
      totalProcessed: this.messageStats.totalProcessed,
      lag: this.messageStats.totalReceived - this.messageStats.totalProcessed,
      messageTypes: { ...this.messageStats.messageTypeCount },
    };
  }

  /**
   * Set connection status and notify listeners
   */
  private setStatus(status: ConnectionStatus) {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      console.log('[EngineTickClient] Status changed to:', status);
      this.statusHandlers.forEach((handler) => handler(status));
    }
  }

  /**
   * Attempt to reconnect
   */
  private startReconnect() {
    if (this.reconnectInterval) {
      return; // Already reconnecting
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    
    console.log(`[EngineTickClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectInterval = setInterval(() => {
      clearInterval(this.reconnectInterval!);
      this.reconnectInterval = null;
      console.log('[EngineTickClient] Attempting to reconnect...');
      this.connect().catch((e) => {
        console.error('[EngineTickClient] Reconnection failed:', e);
      });
    }, delay);
  }
}

// Singleton instance
export const engineWS = new EngineTickClient();
