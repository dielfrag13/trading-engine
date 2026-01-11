/**
 * useCandleQuery Hook
 * 
 * Manages candle and event queries with loading/error states, timeout detection,
 * and automatic UI feedback.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  CandleQueryRequest,
  CandlesResponse,
  EventQueryRequest,
  EventsResponse,
} from '../api/candleQuery';
import type { QueryStatusState } from '../components/QueryStatus';
import { CandleQueryClient } from '../api/candleQuery';
import { engineWS } from '../api/engineWS';

export interface UseCandleQueryResult {
  queryCandlesAsync: (request: CandleQueryRequest) => Promise<CandlesResponse>;
  queryEventsAsync: (request: EventQueryRequest) => Promise<EventsResponse>;
  status: QueryStatusState;
  isLoading: boolean;
  error: string | null;
  cancelQuery: () => void;
}

const SLOW_QUERY_THRESHOLD_MS = 5000; // Show warning after 5 seconds

export function useCandleQuery(): UseCandleQueryResult {
  const [status, setStatus] = useState<QueryStatusState>({
    isLoading: false,
    error: null,
    elapsedSeconds: 0,
    isSlowWarning: false,
  });

  const clientRef = useRef<CandleQueryClient | null>(null);
  const activeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slowWarningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize query client
  useEffect(() => {
    clientRef.current = new CandleQueryClient(engineWS);
    return () => {
      clientRef.current?.cancelAllRequests();
    };
  }, []);

  const updateElapsedTime = useCallback(() => {
    if (startTimeRef.current > 0) {
      const elapsed = Date.now() - startTimeRef.current;
      const elapsedSeconds = Math.round(elapsed / 1000);
      setStatus((prev) => ({
        ...prev,
        elapsedSeconds,
      }));
    }
  }, []);

  const queryCandlesAsync = useCallback(
    async (request: CandleQueryRequest): Promise<CandlesResponse> => {
      if (!clientRef.current) {
        throw new Error('Query client not initialized');
      }

      setStatus({
        isLoading: true,
        error: null,
        elapsedSeconds: 0,
        isSlowWarning: false,
      });

      startTimeRef.current = Date.now();

      // Update elapsed time every second
      elapsedIntervalRef.current = setInterval(updateElapsedTime, 1000);

      // Show slow query warning after SLOW_QUERY_THRESHOLD_MS
      slowWarningTimeoutRef.current = setTimeout(() => {
        setStatus((prev) => ({
          ...prev,
          isSlowWarning: true,
        }));
      }, SLOW_QUERY_THRESHOLD_MS);

      try {
        const result = await clientRef.current.queryCandlesAsync(request, 120000); // 2 minute backend timeout

        if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
        if (slowWarningTimeoutRef.current) clearTimeout(slowWarningTimeoutRef.current);

        setStatus({
          isLoading: false,
          error: null,
          elapsedSeconds: 0,
          isSlowWarning: false,
        });

        return result;
      } catch (err) {
        if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
        if (slowWarningTimeoutRef.current) clearTimeout(slowWarningTimeoutRef.current);

        const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
        setStatus({
          isLoading: false,
          error: errorMsg,
          elapsedSeconds: 0,
          isSlowWarning: false,
        });

        throw err;
      }
    },
    [updateElapsedTime]
  );

  const queryEventsAsync = useCallback(
    async (request: EventQueryRequest): Promise<EventsResponse> => {
      if (!clientRef.current) {
        throw new Error('Query client not initialized');
      }

      setStatus({
        isLoading: true,
        error: null,
        elapsedSeconds: 0,
        isSlowWarning: false,
      });

      startTimeRef.current = Date.now();

      // Update elapsed time every second
      elapsedIntervalRef.current = setInterval(updateElapsedTime, 1000);

      // Show slow query warning after SLOW_QUERY_THRESHOLD_MS
      slowWarningTimeoutRef.current = setTimeout(() => {
        setStatus((prev) => ({
          ...prev,
          isSlowWarning: true,
        }));
      }, SLOW_QUERY_THRESHOLD_MS);

      try {
        const result = await clientRef.current.queryEventsAsync(request, 120000); // 2 minute backend timeout

        if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
        if (slowWarningTimeoutRef.current) clearTimeout(slowWarningTimeoutRef.current);

        setStatus({
          isLoading: false,
          error: null,
          elapsedSeconds: 0,
          isSlowWarning: false,
        });

        return result;
      } catch (err) {
        if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
        if (slowWarningTimeoutRef.current) clearTimeout(slowWarningTimeoutRef.current);

        const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
        setStatus({
          isLoading: false,
          error: errorMsg,
          elapsedSeconds: 0,
          isSlowWarning: false,
        });

        throw err;
      }
    },
    [updateElapsedTime]
  );

  const cancelQuery = useCallback(() => {
    if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
    if (slowWarningTimeoutRef.current) clearTimeout(slowWarningTimeoutRef.current);
    if (activeTimeoutRef.current) clearTimeout(activeTimeoutRef.current);

    clientRef.current?.cancelAllRequests();

    setStatus({
      isLoading: false,
      error: null,
      elapsedSeconds: 0,
      isSlowWarning: false,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
      if (slowWarningTimeoutRef.current) clearTimeout(slowWarningTimeoutRef.current);
      if (activeTimeoutRef.current) clearTimeout(activeTimeoutRef.current);
      clientRef.current?.cancelAllRequests();
    };
  }, []);

  return {
    queryCandlesAsync,
    queryEventsAsync,
    status,
    isLoading: status.isLoading,
    error: status.error,
    cancelQuery,
  };
}

export default useCandleQuery;
