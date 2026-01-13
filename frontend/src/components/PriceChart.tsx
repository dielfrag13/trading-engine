// frontend/src/components/PriceChart.tsx
import { Card, Heading, Button, Text, Box, Input } from '@chakra-ui/react';
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
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useEventStore } from '../store/eventStore';
import { useOrderStore } from '../store/orderStore';
import { useChartStore } from '../store/chartStore';
import { useChartZoom } from '../hooks/useChartZoom';
import { calculateTimeBucket, generateTimeBuckets, formatDateRange } from '../utils/timeBuckets';
import { engineWS, responseHandlerRegistry } from '../api/engineWS';

export function PriceChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  
  // Event store (kept for backward compatibility, but not used for chart data anymore)
  const events = useEventStore((s) => s.getAllEvents());
  const minTime = useEventStore((s) => s.minTime);
  const maxTime = useEventStore((s) => s.maxTime);
  const clearEvents = useEventStore((s) => s.clear);

  // Order store for buy/sell markers
  const orders = useOrderStore((s) => s.orders);

  // Chart store
  const candles = useChartStore((s) => s.candles);
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
  
  // Track hovered marker for custom tooltip
  const [hoveredMarker, setHoveredMarker] = useState<{ type: 'buy' | 'sell', orderId: number, ms: number, price: number } | null>(null);
  
  // Manual query widget state
  const [showManualQuery, setShowManualQuery] = useState(false);
  const [manualStartDate, setManualStartDate] = useState<Date | null>(null);
  const [manualEndDate, setManualEndDate] = useState<Date | null>(null);
  const [manualResolution, setManualResolution] = useState('60000'); // Default 1m
  const [manualQueryStatus, setManualQueryStatus] = useState('');
  const [timezone, setTimezone] = useState('UTC'); // Add timezone
  
  useEffect(() => {
    // Initialize manual query with current viewport if available
    if (viewportStartMs && viewportEndMs && !manualStartDate) {
      setManualStartDate(new Date(viewportStartMs));
      setManualEndDate(new Date(viewportEndMs));
    }
  }, [viewportStartMs, viewportEndMs, manualStartDate]);
  
  const handleManualQuery = () => {
    try {
      if (!manualStartDate || !manualEndDate) {
        setManualQueryStatus('Please select both start and end dates/times');
        return;
      }
      
      const startMs = manualStartDate.getTime();
      const endMs = manualEndDate.getTime();
      const resolutionMs = parseInt(manualResolution, 10);
      
      if (startMs >= endMs) {
        setManualQueryStatus('Start time must be before end time');
        return;
      }
      
      const durationHours = ((endMs - startMs) / 3600000).toFixed(2);
      
      const resolutionMap: { [key: string]: string } = {
        '1000': '1s', '5000': '5s', '15000': '15s', '30000': '30s',
        '60000': '1m', '300000': '5m', '900000': '15m', '1800000': '30m',
        '3600000': '1h', '14400000': '4h', '86400000': '1d'
      };
      
      const requestId = 'manual_query';
      setManualQueryStatus(`Querying ${durationHours}h at ${resolutionMap[manualResolution] || manualResolution + 'ms'} (${timezone})...`);
      console.log('[ManualQuery] Requesting:', {
        requestId,
        startMs, endMs, resolutionMs, durationHours, timezone,
        startDate: manualStartDate.toISOString(),
        endDate: manualEndDate.toISOString()
      });
      
      // Register response handler before sending query
      responseHandlerRegistry.register(requestId, (response: any) => {
        console.log('[ManualQuery] Response received:', response);
        if (response.error) {
          setManualQueryStatus(`Error: ${response.error}`);
          return;
        }
        if (response.data && response.data.candles) {
          const candleCount = response.data.candles.length;
          setManualQueryStatus(`✓ Received ${candleCount} candles. Updating chart...`);
          console.log('[ManualQuery] Received', candleCount, 'candles at resolution', resolutionMap[manualResolution]);
          
          // Store candles in chart store
          const candles = response.data.candles.map((c: any) => ({
            time: c.ms,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume || 0,
          }));
          
          useChartStore.getState().setCandles(candles);
        }
      });
      
      // Send the query
      engineWS.queryCandles(requestId, 'BTCUSD', resolutionMs, startMs, endMs);
      setManualQueryStatus(`Query sent. Waiting for response...`);
    } catch (err) {
      setManualQueryStatus('Error: ' + (err instanceof Error ? err.message : String(err)));
    }
  };
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

  // Update data bounds when candles change
  useEffect(() => {
    if (candles.length > 0) {
      const minTime = candles[0].time;
      const maxTime = candles[candles.length - 1].time;
      console.log('[PriceChart] Data bounds from candles:', {
        minTime,
        maxTime,
        count: candles.length,
        minDate: new Date(minTime).toISOString(),
        maxDate: new Date(maxTime).toISOString(),
      });
      setDataBounds(minTime, maxTime);
    }
  }, [candles, setDataBounds]);

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

  // Filter candles by viewport and prepare chart data
  const chartData = useMemo(() => {
    if (!viewportStartMs || !viewportEndMs || candles.length === 0) {
      return [];
    }

    // Get candles in viewport
    const visibleCandles = candles.filter((c) => c.time >= viewportStartMs && c.time <= viewportEndMs);
    
    console.log('[PriceChart] Visible candles:', visibleCandles.length, 'of', candles.length);
    
    // Convert candles to chart data
    const chartDataPoints = visibleCandles.map((candle) => ({
      ms: candle.time,
      time: new Date(candle.time).toLocaleTimeString('en-US', { hour12: false }),
      price: candle.close, // Use close price for the line
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    }));

    return chartDataPoints;
  }, [candles, viewportStartMs, viewportEndMs]);

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

  // Prepare buy and sell order indicators from QueryOrders data
  const buyOrders = useMemo(() => {
    if (!viewportStartMs || !viewportEndMs) return [];

    // Detect candle resolution from chartData
    let resolutionMs = 1000; // Default to 1 second
    if (chartData.length >= 2) {
      resolutionMs = chartData[1].ms - chartData[0].ms;
    }

    const filled = orders.filter((o) => 
      o.status === 'FILLED' && 
      o.side === 'Buy' && 
      new Date(o.timestamp).getTime() >= viewportStartMs && 
      new Date(o.timestamp).getTime() <= viewportEndMs
    );
    
    const mapped = filled.map((o) => {
      const orderMs = new Date(o.timestamp).getTime();
      // Snap order timestamp to nearest candle bucket
      const snappedMs = Math.floor(orderMs / resolutionMs) * resolutionMs;
      return {
        ms: orderMs, // Keep original for uniqueness
        x: snappedMs, // Use snapped timestamp for x-axis positioning
        y: o.fillPrice || 0,
        orderId: o.orderId,
      };
    });
    
    console.log('[PriceChart] Buy orders in viewport:', mapped.length, 'at resolution:', resolutionMs + 'ms');
    return mapped;
  }, [orders, viewportStartMs, viewportEndMs, chartData]);

  const sellOrders = useMemo(() => {
    if (!viewportStartMs || !viewportEndMs) return [];

    // Detect candle resolution from chartData
    let resolutionMs = 1000; // Default to 1 second
    if (chartData.length >= 2) {
      resolutionMs = chartData[1].ms - chartData[0].ms;
    }

    const filled = orders.filter((o) => 
      o.status === 'FILLED' && 
      o.side === 'Sell' && 
      new Date(o.timestamp).getTime() >= viewportStartMs && 
      new Date(o.timestamp).getTime() <= viewportEndMs
    );
    
    const mapped = filled.map((o) => {
      const orderMs = new Date(o.timestamp).getTime();
      // Snap order timestamp to nearest candle bucket
      const snappedMs = Math.floor(orderMs / resolutionMs) * resolutionMs;
      return {
        ms: orderMs, // Keep original for uniqueness
        x: snappedMs, // Use snapped timestamp for x-axis positioning
        y: o.fillPrice || 0,
        orderId: o.orderId,
      };
    });
    
    console.log('[PriceChart] Sell orders in viewport:', mapped.length, 'at resolution:', resolutionMs + 'ms');
    return mapped;
  }, [orders, viewportStartMs, viewportEndMs, chartData]);

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
              <Button
                size="sm"
                bg="blue.500"
                color="white"
                _hover={{ bg: 'blue.600' }}
                onClick={() => setShowManualQuery(!showManualQuery)}
                fontWeight="bold"
              >
                {showManualQuery ? 'Hide' : 'Query'}
              </Button>
            </div>
          </div>
          
          {/* Manual Query Widget */}
          {showManualQuery && (
            <Box
              mt={4}
              p={4}
              bg="gray.50"
              borderRadius="md"
              border="1px solid"
              borderColor="gray.300"
            >
              <Heading size="sm" mb={3}>Manual Time Range & Resolution Query</Heading>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <Text fontSize="xs" fontWeight="bold" mb={1}>Start Date & Time</Text>
                    <DatePicker
                      selected={manualStartDate}
                      onChange={(date: Date | null) => setManualStartDate(date)}
                      showTimeSelect
                      timeIntervals={1}
                      dateFormat="MMM dd, yyyy HH:mm:ss"
                      customInput={
                        <Input
                          size="sm"
                          bg="white"
                          cursor="pointer"
                          readOnly
                          _readOnly={{ bg: 'white', cursor: 'pointer' }}
                        />
                      }
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <Text fontSize="xs" fontWeight="bold" mb={1}>End Date & Time</Text>
                    <DatePicker
                      selected={manualEndDate}
                      onChange={(date: Date | null) => setManualEndDate(date)}
                      showTimeSelect
                      timeIntervals={1}
                      dateFormat="MMM dd, yyyy HH:mm:ss"
                      customInput={
                        <Input
                          size="sm"
                          bg="white"
                          cursor="pointer"
                          readOnly
                          _readOnly={{ bg: 'white', cursor: 'pointer' }}
                        />
                      }
                    />
                  </div>
                  <div>
                    <Text fontSize="xs" fontWeight="bold" mb={1}>Resolution</Text>
                    <select
                      value={manualResolution}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setManualResolution(e.target.value)}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '4px',
                        border: '1px solid #cbd5e0',
                        backgroundColor: 'white',
                        fontSize: '14px',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="1000">1s</option>
                      <option value="5000">5s</option>
                      <option value="15000">15s</option>
                      <option value="30000">30s</option>
                      <option value="60000">1m</option>
                      <option value="300000">5m</option>
                      <option value="900000">15m</option>
                      <option value="1800000">30m</option>
                      <option value="3600000">1h</option>
                      <option value="86400000">1d</option>
                    </select>
                  </div>
                  <div>
                    <Text fontSize="xs" fontWeight="bold" mb={1}>Timezone</Text>
                    <select
                      value={timezone}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTimezone(e.target.value)}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '4px',
                        border: '1px solid #cbd5e0',
                        backgroundColor: 'white',
                        fontSize: '14px',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="UTC">UTC</option>
                      <option value="EST">EST (UTC-5)</option>
                      <option value="CST">CST (UTC-6)</option>
                      <option value="MST">MST (UTC-7)</option>
                      <option value="PST">PST (UTC-8)</option>
                      <option value="GMT">GMT (UTC+0)</option>
                      <option value="CET">CET (UTC+1)</option>
                      <option value="EET">EET (UTC+2)</option>
                      <option value="JST">JST (UTC+9)</option>
                      <option value="AEST">AEST (UTC+10)</option>
                    </select>
                  </div>
                </div>
                <Button
                  size="sm"
                  bg="green.500"
                  color="white"
                  _hover={{ bg: 'green.600' }}
                  onClick={handleManualQuery}
                  fontWeight="bold"
                >
                  Query
                </Button>
                {manualQueryStatus && (
                  <Box
                    p={2}
                    bg="white"
                    borderRadius="md"
                    border="1px solid"
                    borderColor="gray.300"
                    fontSize="xs"
                    fontFamily="monospace"
                  >
                    {manualQueryStatus}
                  </Box>
                )}
              </div>
            </Box>
          )}
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
                {autoScroll ? '🔴 Following (polling active)' : '⚪ Not Following (polling paused)'}
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
                wrapperStyle={{
                  zIndex: 9999,
                  opacity: 1,
                }}
                contentStyle={{
                  backgroundColor: '#FF1493',
                  border: '2px solid #333',
                  borderRadius: '4px',
                  padding: '8px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
                  opacity: 1,
                }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    
                    // If hovering over a marker, show only that marker's info
                    if (hoveredMarker) {
                      const order = orders.find(o => o.orderId === hoveredMarker.orderId);
                      const orderTime = new Date(hoveredMarker.ms);
                      const timeStr = orderTime.toLocaleTimeString('en-US', { 
                        hour12: false, 
                        hour: '2-digit', 
                        minute: '2-digit', 
                        second: '2-digit' 
                      }) + '.' + orderTime.getMilliseconds().toString().padStart(3, '0');
                      
                      return (
                        <div style={{ 
                          color: '#000',
                          backgroundColor: '#ffffff',
                          padding: '8px',
                          borderRadius: '4px',
                          border: '2px solid #333',
                          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
                        }}>
                          <p style={{ margin: '0 0 4px 0', fontWeight: 'bold', borderBottom: '1px solid #ccc', paddingBottom: '4px' }}>
                            {hoveredMarker.type === 'buy' ? '🟢 BUY FILL' : '🔴 SELL FILL'}
                          </p>
                          <p style={{ margin: '0 0 4px 0', fontSize: '11px', color: '#666' }}>
                            Time: {timeStr}
                          </p>
                          <p style={{ margin: '0 0 4px 0', fontWeight: 'bold' }}>
                            Price: ${hoveredMarker.price.toFixed(2)}
                          </p>
                          <p style={{ margin: '0 0 4px 0', color: '#666' }}>
                            Qty: {order?.filledQty?.toFixed(4) || '?'}
                          </p>
                          <p style={{ margin: '0', fontWeight: 'bold', color: hoveredMarker.type === 'buy' ? '#e53e3e' : '#48bb78' }}>
                            {hoveredMarker.type === 'buy' ? '−' : '+'} ${((order?.filledQty || 0) * hoveredMarker.price).toFixed(2)}
                          </p>
                        </div>
                      );
                    }
                    
                    // Find all buy and sell orders at this candle's timestamp
                    const buysAtTimestamp = buyOrders.filter(o => o.x === data.ms);
                    const sellsAtTimestamp = sellOrders.filter(o => o.x === data.ms);
                    
                    return (
                      <div style={{ 
                        color: '#000',
                        backgroundColor: '#ffffff',
                        padding: '8px',
                        borderRadius: '4px',
                        border: '2px solid #333',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
                      }}>
                        <p style={{ margin: '0 0 4px 0', fontWeight: 'bold', borderBottom: '1px solid #ccc', paddingBottom: '4px' }}>
                          {data.time}
                        </p>
                        <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: '#3182ce' }}>
                          Price: ${(data.price ?? 0).toFixed(2)}
                        </p>
                        
                        {/* Buy fills */}
                        {buysAtTimestamp.length > 0 && (
                          <>
                            <p style={{ margin: '0 0 4px 0', fontSize: '11px', fontWeight: 'bold', color: '#48bb78' }}>
                              🟢 BUY FILLS ({buysAtTimestamp.length})
                            </p>
                            {buysAtTimestamp.map((order, idx) => {
                              const orderTime = new Date(order.ms);
                              const timeStr = orderTime.toLocaleTimeString('en-US', { 
                                hour12: false, 
                                hour: '2-digit', 
                                minute: '2-digit', 
                                second: '2-digit' 
                              }) + '.' + orderTime.getMilliseconds().toString().padStart(3, '0');
                              
                              return (
                                <div key={`buy-${order.orderId}-${idx}`} style={{ marginLeft: '8px', marginBottom: '6px', fontSize: '10px' }}>
                                  <div style={{ fontWeight: 'bold' }}>@ ${order.y.toFixed(2)}</div>
                                  <div style={{ color: '#666' }}>Qty: {orders.find(o => o.orderId === order.orderId)?.filledQty?.toFixed(4) || '?'} at {timeStr}</div>
                                  <div style={{ color: '#e53e3e', fontWeight: 'bold' }}>
                                    − ${((orders.find(o => o.orderId === order.orderId)?.filledQty || 0) * order.y).toFixed(2)}
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        )}
                        
                        {/* Sell fills */}
                        {sellsAtTimestamp.length > 0 && (
                          <>
                            <p style={{ margin: '8px 0 4px 0', fontSize: '11px', fontWeight: 'bold', color: '#f56565' }}>
                              🔴 SELL FILLS ({sellsAtTimestamp.length})
                            </p>
                            {sellsAtTimestamp.map((order, idx) => {
                              const orderTime = new Date(order.ms);
                              const timeStr = orderTime.toLocaleTimeString('en-US', { 
                                hour12: false, 
                                hour: '2-digit', 
                                minute: '2-digit', 
                                second: '2-digit' 
                              }) + '.' + orderTime.getMilliseconds().toString().padStart(3, '0');
                              
                              return (
                                <div key={`sell-${order.orderId}-${idx}`} style={{ marginLeft: '8px', marginBottom: '6px', fontSize: '10px' }}>
                                  <div style={{ fontWeight: 'bold' }}>@ ${order.y.toFixed(2)}</div>
                                  <div style={{ color: '#666' }}>Qty: {orders.find(o => o.orderId === order.orderId)?.filledQty?.toFixed(4) || '?'} at {timeStr}</div>
                                  <div style={{ color: '#48bb78', fontWeight: 'bold' }}>
                                    + ${((orders.find(o => o.orderId === order.orderId)?.filledQty || 0) * order.y).toFixed(2)}
                                  </div>
                                </div>
                              );
                            })}
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
                  onMouseEnter={() => setHoveredMarker({ type: 'buy', orderId: order.orderId, ms: order.ms, price: order.y })}
                  onMouseLeave={() => setHoveredMarker(null)}
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
                  onMouseEnter={() => setHoveredMarker({ type: 'sell', orderId: order.orderId, ms: order.ms, price: order.y })}
                  onMouseLeave={() => setHoveredMarker(null)}
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
