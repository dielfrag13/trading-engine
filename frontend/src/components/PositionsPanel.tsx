// src/components/PositionsPanel.tsx
import {
  Card,
  Heading,
  Table,
} from '@chakra-ui/react';

export function PositionsPanel() {
  // placeholder data; later this will come from backend
  const positions = [
    { symbol: 'BTCUSD', qty: 0.05, avgPrice: 595.12, unrealizedPnl: 12.34 },
  ];

  return (
    <Card.Root height="100%">
      <Card.Header pb={2}>
        <Heading size="md">Positions</Heading>
      </Card.Header>
      <Card.Body>
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Symbol</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="right">Qty</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="right">Avg Price</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="right">Unrealized PnL</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {positions.map((p) => (
              <Table.Row key={p.symbol}>
                <Table.Cell>{p.symbol}</Table.Cell>
                <Table.Cell textAlign="right">{p.qty.toFixed(4)}</Table.Cell>
                <Table.Cell textAlign="right">{p.avgPrice.toFixed(2)}</Table.Cell>
                <Table.Cell textAlign="right">{p.unrealizedPnl.toFixed(2)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Card.Body>
    </Card.Root>
  );
}
