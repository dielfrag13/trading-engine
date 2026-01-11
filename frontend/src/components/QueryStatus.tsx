/**
 * QueryStatus Component
 * 
 * Displays loading status, error messages, and timeout warnings for RPC queries.
 * Manages the 5-second timeout detection overlay.
 */

import React from 'react';

export interface QueryStatusState {
  isLoading: boolean;
  error: string | null;
  elapsedSeconds: number;
  isSlowWarning: boolean;
}

interface QueryStatusProps {
  state: QueryStatusState;
  onCancel?: () => void;
}

export const QueryStatus: React.FC<QueryStatusProps> = ({ state, onCancel }) => {
  if (!state.isLoading || !state.isSlowWarning) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'white',
        border: '2px solid #ed8936',
        borderRadius: '8px',
        padding: '24px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        zIndex: 1000,
        minWidth: '400px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <span style={{ fontSize: '20px' }}>⚠️</span>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>Query In Progress</h2>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <p style={{ margin: '8px 0' }}>
          Your query is taking longer than expected ({state.elapsedSeconds}s). The backend is processing a large result set.
        </p>
        <p style={{ margin: '8px 0', fontSize: '14px', color: '#666' }}>
          This is normal for large queries. Please hold tight while we fetch your data.
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid #cbd5e0',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};

export default QueryStatus;
