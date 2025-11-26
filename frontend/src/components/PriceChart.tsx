// src/components/PriceChart.tsx
import { Card, Heading, Button, HStack } from '@chakra-ui/react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useMemo } from 'react';
import { useTickStore } from '../store/tickStore';
import { engineWS } from '../api/engineWS';

export function PriceChart() {
  const ticks = useTickStore((s) => s.ticks);
  const clear = useTickStore((s) => s.clear);

  console.log('[PriceChart] Rendering with', ticks.length, 'ticks');

  const handleClearChart = async () => {
    // Clear the local store
    clear();
    // Clear the backend file
    await engineWS.clearTicks();
  };

  const data = useMemo(
    () =>
      ticks.map((t, index) => ({
        idx: index,
        time: new Date(t.ts).toLocaleTimeString(),
        price: t.last,
      })),
    [ticks]
  );

  return (
    <Card.Root height="100%" minHeight="400px">
      <Card.Header pb={2}>
        <HStack justify="space-between">
          <Heading size="md">Price Chart (Mock BTCUSD)</Heading>
          <Button 
            size="sm" 
            bg="red.500"
            color="white"
            _hover={{ bg: "red.600" }}
            onClick={handleClearChart}
          >
            Clear Chart
          </Button>
        </HStack>
      </Card.Header>
      <Card.Body display="flex" flexDirection="column" flex="1" minHeight="0">
        {data.length === 0 ? (
          <div>Waiting for ticks...</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <XAxis 
                dataKey="time" 
                tick={{ fontSize: 12 }}
                angle={data.length > 40 ? -45 : 0}
                textAnchor={data.length > 40 ? "end" : "middle"}
                height={data.length > 40 ? 80 : 30}
              />
              <YAxis
                domain={['dataMin - 1', 'dataMax + 1']}
                tickFormatter={(v: number) => v.toFixed(2)}
                width={50}
              />
              <Tooltip
                formatter={(value: any) => Number(value).toFixed(2)}
                labelFormatter={(label) => `Time: ${label}`}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="#8884d8"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card.Body>
    </Card.Root>
  );
}
