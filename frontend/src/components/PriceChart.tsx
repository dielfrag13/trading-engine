// src/components/PriceChart.tsx
import { Card, Heading } from '@chakra-ui/react';
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

export function PriceChart() {
  const ticks = useTickStore((s) => s.ticks);

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
    <Card.Root height="100%">
      <Card.Header pb={2}>
        <Heading size="md">Price Chart (Mock BTCUSD)</Heading>
      </Card.Header>
      <Card.Body>
        {data.length === 0 ? (
          <div>Waiting for ticks...</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
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
