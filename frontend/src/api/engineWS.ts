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

export type EngineMessage = ProviderTickMessage | RunStartMessage;

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
      console.log('[EngineTickClient] Received message:', msg.type);
      this.messageHandlers.forEach((handler) => handler(msg));
    } catch (e) {
      console.error('[EngineTickClient] Failed to parse message:', e);
    }
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
