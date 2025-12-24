// frontend/src/components/PriceChart.tsx
import { Card, Heading, Button, Text, Box } from '@chakra-ui/react';
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Line,
  Legend,
  ReferenceDot,
} from 'recharts';
import { useMemo, useRef, useEffect, useState } from 'react';
import { useEventStore, type TickEvent } from '../store/eventStore';
import { useChartStore } from '../store/chartStore';
import { useChartZoom } from '../hooks/useChartZoom';
import { calculateTimeBucket, generateTimeBuckets, formatDateRange } from '../utils/timeBuckets';
import { engineWS } from '../api/engineWS';

export function PriceChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  
  // Event store
  const events = useEventStore((s) => s.getAllEvents());
  const minTime = useEventStore((s) => s.minTime);
  const maxTime = useEventStore((s) => s.maxTime);
  const clearEvents = useEventStore((s) => s.clear);

  // Chart store
  const viewportStartMs = useChartStore((s) => s.viewportStartMs);
  const viewportEndMs = useChartStore((s) => s.viewportEndMs);
  const autoScroll = useChartStore((s) => s.autoScroll);
  const setDataBounds = useChartStore((s) => s.setDataBounds);
  const zoomToPreset = useChartStore((s) => s.zoomToPreset);

  // Zoom interaction hook
  const { zoomIn, zoomOut, setAutoScroll: setAutoScrollAction } = useChartZoom(chartContainerRef as React.RefObject<HTMLDivElement>);

  // Handle follow latest toggle
  const handleToggleFollowLatest = () => {
    setAutoScrollAction(!autoScroll);
  };

  // Track container width for responsive buckets
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const updateWidth = () => {
      if (chartContainerRef.current) {
        setContainerWidth(chartContainerRef.current.offsetWidth);
      }
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Update data bounds when events change
  useEffect(() => {
    if (minTime && maxTime) {
      console.log('[PriceChart] Data bounds:', {
        minTime,
        maxTime,
        minDate: new Date(minTime).toISOString(),
        maxDate: new Date(maxTime).toISOString(),
      });
    }
    setDataBounds(minTime, maxTime);
  }, [minTime, maxTime, setDataBounds]);

  // Debug: log viewport changes
  useEffect(() => {
    if (viewportStartMs && viewportEndMs) {
      console.log('[PriceChart] Viewport:', {
        viewportStartMs,
        viewportEndMs,
        startDate: new Date(viewportStartMs).toISOString(),
        endDate: new Date(viewportEndMs).toISOString(),
      });
    }
  }, [viewportStartMs, viewportEndMs]);

  // Handle clear chart
  const handleClearChart = async () => {
    clearEvents();
    await engineWS.clearTicks();
  };

  // Helper: snap a timestamp to the nearest candle boundary (1-second intervals)
  // This allows trade markers to align with candles for rendering performance
  // while preserving exact timestamps in the data for tooltips/details
  const snapToCandle = (ms: number): number => {
    const CANDLE_INTERVAL_MS = 1000;
    return Math.round(ms / CANDLE_INTERVAL_MS) * CANDLE_INTERVAL_MS;
  };

  // Filter events by viewport and prepare chart data
  const chartData = useMemo(() => {
    if (!viewportStartMs || !viewportEndMs || events.length === 0) {
      return [];
    }

    // Get ticks in viewport
    const visibleEvents = events.filter((e) => e.ms >= viewportStartMs && e.ms <= viewportEndMs);
    
    // Convert ticks to chart data
    let chartDataPoints = visibleEvents
      .filter((e): e is TickEvent => e.type === 'tick')
      .map((tick) => ({
        ms: tick.ms,
        time: new Date(tick.ms).toLocaleTimeString('en-US', { hour12: false }),
        price: tick.price,
        symbol: tick.symbol,
      }));

    // If no ticks but there are order fills, create synthetic points at order fill locations
    // This ensures the Y-axis scales correctly and markers are visible
    if (chartDataPoints.length === 0) {
      const orderFills = visibleEvents.filter((e) => e.type === 'orderFilled');
      if (orderFills.length > 0) {
        chartDataPoints = orderFills.map((e: any) => ({
          ms: snapToCandle(e.ms),  // Use snapped ms for chart data alignment
          time: new Date(e.ms).toLocaleTimeString('en-US', { hour12: false }),
          price: e.fillPrice,
          symbol: e.symbol,
        }));
      }
    }

    // Silenced debug logging
    // console.log('[PriceChart] chartData: ticks=', chartDataPoints.filter(d => d).length);

    return chartDataPoints;
  }, [events, viewportStartMs, viewportEndMs, snapToCandle]);

  // Calculate time buckets for x-axis
  const timeBuckets = useMemo(() => {
    if (!viewportStartMs || !viewportEndMs || containerWidth === 0) {
      return [];
    }

    const bucket = calculateTimeBucket(viewportStartMs, viewportEndMs, containerWidth);
    return generateTimeBuckets(viewportStartMs, viewportEndMs, bucket.intervalMs, bucket.format);
  }, [viewportStartMs, viewportEndMs, containerWidth]);

  // Calculate if viewing all data
  const isViewingAllData = useMemo(() => {
    if (!minTime || !maxTime || !viewportStartMs || !viewportEndMs) return false;
    // Allow small buffer (< 100ms) for "fit-all" detection
    return (viewportStartMs - minTime < 100) && (maxTime - viewportEndMs < 100);
  }, [minTime, maxTime, viewportStartMs, viewportEndMs]);

  // Prepare buy and sell order indicators
  const buyOrders = useMemo(() => {
    if (!viewportStartMs || !viewportEndMs) return [];

    const filled = events.filter((e) => e.type === 'orderFilled' && (e as any).side === 'Buy' && e.ms >= viewportStartMs && e.ms <= viewportEndMs);
    const mapped = filled.map((e: any) => ({
      ms: e.ms,
      x: snapToCandle(e.ms),
      y: e.fillPrice,
      orderId: e.orderId,
    }));
    // Silenced: if (mapped.length > 0) { console.log('[PriceChart] Buy orders:', mapped.length); }
    return mapped;
  }, [events, viewportStartMs, viewportEndMs, snapToCandle]);

  const sellOrders = useMemo(() => {
    if (!viewportStartMs || !viewportEndMs) return [];

    const filled = events.filter((e) => e.type === 'orderFilled' && (e as any).side === 'Sell' && e.ms >= viewportStartMs && e.ms <= viewportEndMs);
    const mapped = filled.map((e: any) => ({
      ms: e.ms,
      x: snapToCandle(e.ms),
      y: e.fillPrice,
      orderId: e.orderId,
    }));
    // Silenced: if (mapped.length > 0) { console.log('[PriceChart] Sell orders:', mapped.length); }
    return mapped;
  }, [events, viewportStartMs, viewportEndMs, snapToCandle]);

  // Debug: silenced verbose rendering logs
  useEffect(() => {
    // Silenced: verbose console logging about render state
  }, [events, chartData.length, viewportStartMs, viewportEndMs]);

  return (
    <Card.Root height="100%" minHeight="500px">
      <Card.Header pb={2}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <Heading size="md">Price Chart (Mock BTCUSD)</Heading>
              {viewportStartMs && viewportEndMs && (
                <Box
                  px={3}
                  py={1}
                  bg="gray.100"
                  borderRadius="md"
                  fontSize="sm"
                  fontWeight="500"
                  color="gray.700"
                  border="1px solid"
                  borderColor="gray.300"
                >
                  {formatDateRange(viewportStartMs, viewportEndMs)}
                </Box>
              )}
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <Button size="sm" onClick={() => zoomOut()} variant="outline" bg="white" color="black" fontWeight="bold" border="2px solid #2d3748">
                −
              </Button>
              <Button size="sm" onClick={() => zoomToPreset('1m')} variant="outline" bg="white" color="black" fontWeight="bold" border="2px solid #2d3748" fontSize="xs">
                1m
              </Button>
              <Button size="sm" onClick={() => zoomToPreset('5m')} variant="outline" bg="white" color="black" fontWeight="bold" border="2px solid #2d3748" fontSize="xs">
                5m
              </Button>
              <Button size="sm" onClick={() => zoomToPreset('15m')} variant="outline" bg="white" color="black" fontWeight="bold" border="2px solid #2d3748" fontSize="xs">
                15m
              </Button>
              <Button size="sm" onClick={() => zoomToPreset('1h')} variant="outline" bg="white" color="black" fontWeight="bold" border="2px solid #2d3748" fontSize="xs">
                1h
              </Button>
              <Button size="sm" onClick={() => zoomToPreset('fit-all')} variant="outline" bg="white" color="black" fontWeight="bold" border="2px solid #2d3748" fontSize="xs">
                All
              </Button>
              <Button size="sm" onClick={() => zoomIn()} variant="outline" bg="white" color="black" fontWeight="bold" border="2px solid #2d3748">
                +
              </Button>
              <Button
                size="sm"
                bg="red.500"
                color="white"
                _hover={{ bg: 'red.600' }}
                onClick={handleClearChart}
                fontWeight="bold"
              >
                Clear
              </Button>
            </div>
          </div>
          <Text fontSize="xs" color="gray.600">
            Scroll to zoom • Ctrl+Drag to pan •{' '}
            {!isViewingAllData && (
              <button
                onClick={handleToggleFollowLatest}
                style={{
                  padding: '2px 6px',
                  fontSize: '12px',
                  backgroundColor: autoScroll ? '#e8f5e9' : 'transparent',
                  border: autoScroll ? '1px solid #4caf50' : '1px solid #ccc',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  color: autoScroll ? '#2e7d32' : '#666',
                  fontWeight: autoScroll ? 'bold' : 'normal',
                  marginLeft: '4px'
                }}
              >
                {autoScroll ? '🔴 Following' : '⚪ Not Following'}
              </button>
            )}
            {isViewingAllData && <span>Viewing all data</span>}
          </Text>
        </div>
      </Card.Header>

      <Card.Body position="relative" overflowY="auto" flex="1" display="flex" flexDirection="column">
        <div ref={chartContainerRef} style={{ width: '100%', height: '100%', flex: 1 }}>
          {chartData.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '600px', color: '#999' }}>
              <p>No data in this time range. Try zooming out or scrolling to a different period.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={600}>
              <ComposedChart
                data={chartData}
                margin={{ top: 20, right: 30, left: 0, bottom: 60 }}
              >
              <XAxis
                dataKey="ms"
                tickFormatter={(ms: number) => {
                  const bucket = timeBuckets.find(
                    (b) => Math.abs(b.ms - ms) < ((viewportEndMs ?? 0) - (viewportStartMs ?? 0)) / 20
                  );
                  return bucket ? bucket.label : '';
                }}
                angle={-45}
                textAnchor="end"
                height={80}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                domain={chartData.length > 0 ? ['dataMin - 0.5', 'dataMax + 0.5'] : [0, 1]}
                type="number"
                tick={{ fontSize: 12 }}
                width={55}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  padding: '8px',
                }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    // Find order fill at this timestamp
                    const orderFill = events.find((e) => e.type === 'orderFilled' && e.ms === data.ms) as any;
                    return (
                      <div style={{ color: '#000' }}>
                        <p style={{ margin: '0 0 4px 0' }}>
                          {data.time}
                        </p>
                        <p style={{ margin: '0', fontWeight: 'bold', color: '#3182ce' }}>
                          Price: ${(data.price ?? 0).toFixed(2)}
                        </p>
                        {orderFill && orderFill.side && (
                          <>
                            <p style={{ margin: '4px 0 2px 0', fontSize: '11px', color: '#e53e3e', fontWeight: 'bold' }}>
                              {orderFill.side === 'Buy' ? '🟢' : '🔴'} {orderFill.side?.toUpperCase()} @ ${(orderFill.fillPrice ?? 0).toFixed(2)}
                            </p>
                            <p style={{ margin: '2px 0 0 0', fontSize: '10px', color: '#666' }}>
                              Qty: {(orderFill.filledQty ?? 0).toFixed(4)}
                            </p>
                            <p style={{ margin: '2px 0 0 0', fontSize: '10px', color: orderFill.side === 'Buy' ? '#e53e3e' : '#48bb78', fontWeight: 'bold' }}>
                              {orderFill.side === 'Buy' ? '−' : '+'} ${(Math.abs((orderFill.filledQty ?? 0) * (orderFill.fillPrice ?? 0))).toFixed(2)}
                            </p>
                          </>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="price"
                stroke="#3182ce"
                name="Price"
                dot={false}
                isAnimationActive={false}
              />
              {/* Dummy lines for legend entries */}
              <Line
                type="monotone"
                dataKey={() => null}
                stroke="#48bb78"
                name="Buy Orders"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey={() => null}
                stroke="#f56565"
                name="Sell Orders"
                isAnimationActive={false}
              />

              {/* Buy order markers */}
              {buyOrders.map((order) => (
                <ReferenceDot
                  key={`buy-${order.orderId}-${order.ms}`}
                  x={order.x}
                  y={order.y}
                  r={4}
                  fill="#48bb78"
                  stroke="#2f855a"
                  strokeWidth={2}
                />
              ))}

              {/* Sell order markers */}
              {sellOrders.map((order) => (
                <ReferenceDot
                  key={`sell-${order.orderId}-${order.ms}`}
                  x={order.x}
                  y={order.y}
                  r={4}
                  fill="#f56565"
                  stroke="#c53030"
                  strokeWidth={2}
                />
              ))}
            </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card.Body>
    </Card.Root>
  );
}
