// frontend/src/components/PriceChart.tsx
import { Card, Heading, Button, Text } from '@chakra-ui/react';
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
import { calculateTimeBucket, generateTimeBuckets } from '../utils/timeBuckets';
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
    setDataBounds(minTime, maxTime);
  }, [minTime, maxTime, setDataBounds]);

  // Handle clear chart
  const handleClearChart = async () => {
    clearEvents();
    await engineWS.clearTicks();
  };

  // Filter events by viewport and prepare chart data
  const chartData = useMemo(() => {
    if (!viewportStartMs || !viewportEndMs || events.length === 0) {
      return [];
    }

    // Get ticks in viewport
    const visibleEvents = events.filter((e) => e.ms >= viewportStartMs && e.ms <= viewportEndMs);
    
    // Convert ticks to chart data
    const chartDataPoints = visibleEvents
      .filter((e): e is TickEvent => e.type === 'tick')
      .map((tick) => ({
        ms: tick.ms,
        time: new Date(tick.ms).toLocaleTimeString('en-US', { hour12: false }),
        price: tick.price,
        symbol: tick.symbol,
      }));

    return chartDataPoints;
  }, [events, viewportStartMs, viewportEndMs]);

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
      x: e.ms,
      y: e.fillPrice,
      orderId: e.orderId,
    }));
    if (mapped.length > 0) {
      console.log('[PriceChart] Buy orders in viewport:', mapped.map(o => `#${o.orderId} @ ${new Date(o.ms).toISOString()}`));
    }
    return mapped;
  }, [events, viewportStartMs, viewportEndMs]);

  const sellOrders = useMemo(() => {
    if (!viewportStartMs || !viewportEndMs) return [];

    const filled = events.filter((e) => e.type === 'orderFilled' && (e as any).side === 'Sell' && e.ms >= viewportStartMs && e.ms <= viewportEndMs);
    const mapped = filled.map((e: any) => ({
      ms: e.ms,
      x: e.ms,
      y: e.fillPrice,
      orderId: e.orderId,
    }));
    if (mapped.length > 0) {
      console.log('[PriceChart] Sell orders in viewport:', mapped.map(o => `#${o.orderId} @ ${new Date(o.ms).toISOString()}`));
    }
    return mapped;
  }, [events, viewportStartMs, viewportEndMs]);

  // Debug: show all events on each render
  useEffect(() => {
    const orderFilledCount = events.filter(e => e.type === 'orderFilled').length;
    console.log('[PriceChart] Rendering with', events.length, 'total events (', orderFilledCount, 'orderFilled ),', chartData.length, 'visible ticks, viewport: [' + (viewportStartMs ? new Date(viewportStartMs).toISOString() : 'null') + ', ' + (viewportEndMs ? new Date(viewportEndMs).toISOString() : 'null') + ']');
  }, [events, chartData.length, viewportStartMs, viewportEndMs]);

  return (
    <Card.Root height="100%" minHeight="500px">
      <Card.Header pb={2}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Heading size="md">Price Chart (Mock BTCUSD)</Heading>
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
                domain={['dataMin - 0.5', 'dataMax + 0.5']}
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
                  x={order.ms}
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
                  x={order.ms}
                  y={order.y}
                  r={4}
                  fill="#f56565"
                  stroke="#c53030"
                  strokeWidth={2}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card.Body>
    </Card.Root>
  );
}
