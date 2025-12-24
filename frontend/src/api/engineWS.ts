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

export type EngineMessage = ProviderTickMessage | RunStartMessage | OrderPlacedMessage | OrderFilledMessage | OrderRejectedMessage | PositionUpdatedMessage | ChartCandleMessage;

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * WebSocket client for receiving market ticks from the C++ backend
 */
class EngineTickClient {
  private messageHandlers: Set<(msg: EngineMessage) => void> = new Set();
  private statusHandlers: Set<(status: ConnectionStatus) => void> = new Set();
  private ws: WebSocket | null = null;
  private reconnectInterval: ReturnType<typeof setInterval> | null = null;
  private readonly wsUrl = 'ws://localhost:3000';
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

    this.setStatus('connecting');
    console.log('[EngineTickClient] Connecting to WebSocket:', this.wsUrl);
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          console.log('[EngineTickClient] WebSocket connected');
          this.reconnectAttempts = 0;
          this.setStatus('connected');
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.onMessageReceived(event.data);
        };

        this.ws.onerror = (error) => {
          console.error('[EngineTickClient] WebSocket error:', error);
          this.setStatus('error');
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('[EngineTickClient] WebSocket disconnected');
          this.ws = null;
          this.setStatus('disconnected');
          this.startReconnect();
        };
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
    return this.connectionStatus === 'connected';
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
