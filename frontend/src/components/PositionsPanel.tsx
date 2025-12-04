// src/components/PositionsPanel.tsx
import {
  Card,
  Heading,
  Table,
  Badge,
  Text,
} from '@chakra-ui/react';
import { useMemo } from 'react';
import { useOrderStore } from '../store/orderStore';
import { useTickStore } from '../store/tickStore';

export function PositionsPanel() {
  const positionsMap = useOrderStore((s) => s.positions);
  const positions = useMemo(() => Array.from(positionsMap.values()), [positionsMap]);
  const ticks = useTickStore((s) => s.ticks);
  
  // Get the latest price from ticks (for demo, assume single symbol BTCUSD)
  const latestPrice = ticks.length > 0 ? ticks[ticks.length - 1].last : 0;

  const calculatePnL = (position: typeof positions[0]) => {
    if (latestPrice === 0) return 0;
    const priceDelta = latestPrice - position.avgPrice;
    return priceDelta * position.qty;
  };

  const pnlColor = (pnl: number) => {
    if (pnl > 0) return 'green';
    if (pnl < 0) return 'red';
    return 'gray';
  };

  return (
    <Card.Root height="100%">
      <Card.Header pb={2}>
        <Heading size="md">Positions ({positions.length})</Heading>
      </Card.Header>
      <Card.Body overflowY="auto">
        {positions.length === 0 ? (
          <Text color="gray.500" fontSize="sm">No open positions</Text>
        ) : (
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Symbol</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="right">Qty</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="right">Avg Price</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="right">Last Price</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="right">Unrealized PnL</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {positions.map((p) => {
                const pnl = calculatePnL(p);
                return (
                  <Table.Row key={p.symbol}>
                    <Table.Cell fontSize="xs">{p.symbol}</Table.Cell>
                    <Table.Cell textAlign="right" fontSize="xs">{(p.qty ?? 0).toFixed(4)}</Table.Cell>
                    <Table.Cell textAlign="right" fontSize="xs">{(p.avgPrice ?? 0).toFixed(2)}</Table.Cell>
                    <Table.Cell textAlign="right" fontSize="xs">{(latestPrice ?? 0).toFixed(2)}</Table.Cell>
                    <Table.Cell textAlign="right" fontSize="xs">
                      <Badge colorScheme={pnlColor(pnl)}>
                        {(pnl ?? 0) >= 0 ? '+' : ''}{(pnl ?? 0).toFixed(2)}
                      </Badge>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Root>
        )}
      </Card.Body>
    </Card.Root>
  );
}
