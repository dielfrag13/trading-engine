// src/components/OrdersPanel.tsx
import {
  Card,
  Heading,
  Table,
  Badge,
} from '@chakra-ui/react';

type OrderRow = {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  qty: number;
  price: number;
  status: 'FILLED' | 'OPEN' | 'CANCELLED';
};

export function OrdersPanel() {
  // placeholder data; later wired to actual order events/fills
  const orders: OrderRow[] = [
    { id: '1', symbol: 'BTCUSD', side: 'BUY', qty: 0.01, price: 598.5, status: 'FILLED' },
    { id: '2', symbol: 'BTCUSD', side: 'SELL', qty: 0.01, price: 602.1, status: 'FILLED' },
  ];

  const statusColor = (status: OrderRow['status']) => {
    switch (status) {
      case 'FILLED':
        return 'green';
      case 'OPEN':
        return 'yellow';
      case 'CANCELLED':
        return 'red';
      default:
        return 'gray';
    }
  };

  return (
    <Card.Root height="100%">
      <Card.Header pb={2}>
        <Heading size="md">Recent Orders</Heading>
      </Card.Header>
      <Card.Body>
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>ID</Table.ColumnHeader>
              <Table.ColumnHeader>Symbol</Table.ColumnHeader>
              <Table.ColumnHeader>Side</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="right">Qty</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="right">Price</Table.ColumnHeader>
              <Table.ColumnHeader>Status</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {orders.map((o) => (
              <Table.Row key={o.id}>
                <Table.Cell>{o.id}</Table.Cell>
                <Table.Cell>{o.symbol}</Table.Cell>
                <Table.Cell>
                  <Badge colorScheme={o.side === 'BUY' ? 'green' : 'red'}>{o.side}</Badge>
                </Table.Cell>
                <Table.Cell textAlign="right">{o.qty.toFixed(4)}</Table.Cell>
                <Table.Cell textAlign="right">{o.price.toFixed(2)}</Table.Cell>
                <Table.Cell>
                  <Badge colorScheme={statusColor(o.status)}>{o.status}</Badge>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Card.Body>
    </Card.Root>
  );
}
