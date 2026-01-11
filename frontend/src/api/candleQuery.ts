/**
 * Candle and Event Query RPC Client
 * 
 * Handles request/response messaging for querying historical candles and events
 * from the backend via WebSocket. Uses requestId for correlation between requests
 * and responses.
 */

import type { EngineTickClient } from './engineWS';

export interface CandleQueryRequest {
  symbol: string;
  resolutionMs: number;
  startMs: number;
  endMs: number;
  limit?: number;
}

export interface EventQueryRequest {
  symbol: string;
  startMs: number;
  endMs: number;
  eventTypes?: string[];
  limit?: number;
}

export interface Candle {
  symbol: string;
  openTime: string;
  ms: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandlesResponse {
  symbol: string;
  resolutionMs: number;
  candles: Candle[];
  count: number;
  isTruncated: boolean;
}

export interface StoredEvent {
  eventType: string;
  timestampMs: number;
  symbol: string;
  source: string;
  data: Record<string, any>;
}

export interface EventsResponse {
  symbol: string;
  events: StoredEvent[];
  count: number;
  isTruncated: boolean;
}

export interface QueryError {
  error: true;
  errorCode: string;
  errorMessage: string;
}

export type CandlesResponseMessage = CandlesResponse & { requestId: string };
export type EventsResponseMessage = EventsResponse & { requestId: string };
export type QueryErrorMessage = QueryError & { requestId: string };

/**
 * CandleQueryClient - Manages RPC queries to backend
 */
export class CandleQueryClient {
  private requestCounter = 0;
  private responseHandlers = new Map<string, (response: any) => void>();
  private ws: EngineTickClient;

  constructor(ws: EngineTickClient) {
    this.ws = ws;
    
    // Subscribe to response messages
    this.ws.onMessage((msg: any) => {
      if (msg.type === 'QueryCandlesResponse' || msg.type === 'QueryEventsResponse') {
        const handler = this.responseHandlers.get(msg.requestId);
        if (handler) {
          this.responseHandlers.delete(msg.requestId);
          handler(msg);
        }
      }
    });
  }

  /**
   * Query candles from backend
   * @returns Promise that resolves with candles or rejects on error/timeout
   */
  queryCandlesAsync(request: CandleQueryRequest, timeoutMs = 30000): Promise<CandlesResponse> {
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

      const handler = (response: any) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);

        if (response.data?.error) {
          reject(new Error(`${response.data.errorCode}: ${response.data.errorMessage}`));
        } else {
          resolve(response.data);
        }
      };

      // Set timeout
      timeoutHandle = setTimeout(() => {
        this.responseHandlers.delete(requestId);
        reject(new Error(`Query timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // Register handler
      this.responseHandlers.set(requestId, handler);

      // Send query
      try {
        this.ws.send({
          type: 'QueryCandles',
          requestId,
          data: request,
        });
      } catch (e) {
        this.responseHandlers.delete(requestId);
        if (timeoutHandle) clearTimeout(timeoutHandle);
        reject(e);
      }
    });
  }

  /**
   * Query events from backend
   * @returns Promise that resolves with events or rejects on error/timeout
   */
  queryEventsAsync(request: EventQueryRequest, timeoutMs = 30000): Promise<EventsResponse> {
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

      const handler = (response: any) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);

        if (response.data?.error) {
          reject(new Error(`${response.data.errorCode}: ${response.data.errorMessage}`));
        } else {
          resolve(response.data);
        }
      };

      // Set timeout
      timeoutHandle = setTimeout(() => {
        this.responseHandlers.delete(requestId);
        reject(new Error(`Query timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // Register handler
      this.responseHandlers.set(requestId, handler);

      // Send query
      try {
        this.ws.send({
          type: 'QueryEvents',
          requestId,
          data: request,
        });
      } catch (e) {
        this.responseHandlers.delete(requestId);
        if (timeoutHandle) clearTimeout(timeoutHandle);
        reject(e);
      }
    });
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${++this.requestCounter}`;
  }

  /**
   * Clean up pending requests (e.g., on disconnect)
   */
  cancelAllRequests() {
    this.responseHandlers.clear();
  }
}
