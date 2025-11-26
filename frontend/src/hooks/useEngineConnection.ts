// frontend/src/hooks/useEngineConnection.ts
// React hook to manage WebSocket connection to C++ engine and dispatch ticks to store

import { useEffect } from 'react';
import { engineWS, type ProviderTickMessage, type RunStartMessage, type EngineMessage } from '../api/engineWS';
import { useTickStore } from '../store/tickStore';

export function useEngineConnection() {
  const addTick = useTickStore((s) => s.addTick);
  const setRunId = useTickStore((s) => s.setRunId);
  const clear = useTickStore((s) => s.clear);
  const currentRunId = useTickStore((s) => s.currentRunId);

  useEffect(() => {
    // Connect to the WebSocket server
    engineWS.connect()
      .then(() => {
        console.log('[useEngineConnection] Connected to engine server');
      })
      .catch((e: unknown) => {
        console.error('[useEngineConnection] Failed to connect:', e);
      });

    // Subscribe to messages
    const unsubscribe = engineWS.onMessage((msg: EngineMessage) => {
      console.log('[useEngineConnection] Received message:', msg.type);
      if (msg.type === 'RunStart') {
        const runStart = msg as RunStartMessage;
        // New run detected
        if (currentRunId && currentRunId !== runStart.data.runId) {
          // Different run ID = new engine start, auto-clear
          console.log('[useEngineConnection] New run detected, clearing chart');
          clear();
        }
        setRunId(runStart.data.runId);
        console.log('[useEngineConnection] Run started:', runStart.data.runId);
      } else if (msg.type === 'ProviderTick') {
        const tick = msg as ProviderTickMessage;
        console.log('[useEngineConnection] Adding tick:', tick.data.price);
        addTick({
          symbol: tick.data.symbol,
          last: tick.data.price,
          ts: tick.data.timestamp,
        });
      }
    });

    // Cleanup on unmount
    return () => {
      unsubscribe();
      engineWS.disconnect();
    };
  }, [addTick, setRunId, clear, currentRunId]);
}
