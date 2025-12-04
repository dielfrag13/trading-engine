// frontend/src/utils/timeBuckets.ts
// Calculate responsive time bucket granularity based on zoom level and viewport width

export type TimeBucket = {
  intervalMs: number; // milliseconds between buckets
  format: (date: Date) => string; // Format function for displaying time
  label: string; // Human readable (e.g., "10 seconds", "5 minutes")
};

// Define bucket strategies at different zoom levels
const BUCKET_STRATEGIES: Array<{
  label: string;
  intervalMs: number;
  format: (date: Date) => string;
}> = [
  {
    label: '250ms',
    intervalMs: 250,
    format: (d) => d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 1 }),
  },
  {
    label: '500ms',
    intervalMs: 500,
    format: (d) => d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 1 }),
  },
  {
    label: '1 second',
    intervalMs: 1000,
    format: (d) => d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  },
  {
    label: '5 seconds',
    intervalMs: 5000,
    format: (d) => d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  },
  {
    label: '10 seconds',
    intervalMs: 10000,
    format: (d) => d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  },
  {
    label: '30 seconds',
    intervalMs: 30000,
    format: (d) => d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  },
  {
    label: '1 minute',
    intervalMs: 60000,
    format: (d) => d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
  },
  {
    label: '5 minutes',
    intervalMs: 5 * 60000,
    format: (d) => d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
  },
  {
    label: '15 minutes',
    intervalMs: 15 * 60000,
    format: (d) => d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
  },
  {
    label: '30 minutes',
    intervalMs: 30 * 60000,
    format: (d) => d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
  },
  {
    label: '1 hour',
    intervalMs: 60 * 60000,
    format: (d) => d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
  },
  {
    label: '4 hours',
    intervalMs: 4 * 60 * 60000,
    format: (d) => d.toLocaleDateString('en-US') + ' ' + d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
  },
  {
    label: '1 day',
    intervalMs: 24 * 60 * 60000,
    format: (d) => d.toLocaleDateString('en-US'),
  },
  {
    label: '1 week',
    intervalMs: 7 * 24 * 60 * 60000,
    format: (d) => d.toLocaleDateString('en-US'),
  },
  {
    label: '1 month',
    intervalMs: 30 * 24 * 60 * 60000,
    format: (d) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
  },
];

/**
 * Calculate the best time bucket for given viewport and width
 * @param viewportStartMs - Start of viewport in milliseconds
 * @param viewportEndMs - End of viewport in milliseconds
 * @param widthPixels - Width available for chart in pixels
 * @returns TimeBucket with appropriate interval and formatter
 */
export function calculateTimeBucket(viewportStartMs: number, viewportEndMs: number, widthPixels: number): TimeBucket {
  const totalMs = viewportEndMs - viewportStartMs;
  
  // Aim for 50-100 pixels per label (readable without crowding)
  const targetPixelsPerLabel = 75;
  const targetLabels = Math.max(4, widthPixels / targetPixelsPerLabel);
  const msPerLabel = totalMs / targetLabels;
  
  // Find the best strategy that's close to msPerLabel
  let bestStrategy = BUCKET_STRATEGIES[0];
  let bestDiff = Math.abs(bestStrategy.intervalMs - msPerLabel);
  
  for (const strategy of BUCKET_STRATEGIES) {
    const diff = Math.abs(strategy.intervalMs - msPerLabel);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestStrategy = strategy;
    }
  }
  
  return {
    intervalMs: bestStrategy.intervalMs,
    format: bestStrategy.format,
    label: bestStrategy.label,
  };
}

/**
 * Generate time bucket boundaries for x-axis labels
 * @param viewportStartMs - Start of viewport in milliseconds
 * @param viewportEndMs - End of viewport in milliseconds
 * @param intervalMs - Interval between buckets
 * @returns Array of {ms, label} for each bucket
 */
export function generateTimeBuckets(viewportStartMs: number, viewportEndMs: number, intervalMs: number, formatter: (date: Date) => string): Array<{ ms: number; label: string }> {
  const buckets: Array<{ ms: number; label: string }> = [];
  
  // Round start down to nearest bucket boundary
  const startBucket = Math.floor(viewportStartMs / intervalMs) * intervalMs;
  
  for (let ms = startBucket; ms <= viewportEndMs; ms += intervalMs) {
    if (ms >= viewportStartMs) {
      buckets.push({
        ms,
        label: formatter(new Date(ms)),
      });
    }
  }
  
  return buckets;
}
