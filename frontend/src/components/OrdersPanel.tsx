// src/components/OrdersPanel.tsx
import {
  Card,
  Heading,
  Table,
  Badge,
  Text,
  HStack,
  Button,
} from '@chakra-ui/react';
import { useMemo, useState } from 'react';
import { useOrderStore } from '../store/orderStore';

const ORDERS_PER_PAGE = 10;

export function OrdersPanel() {
  const orders = useOrderStore((s) => s.orders);
  const [currentPage, setCurrentPage] = useState(0);

  // All orders, newest first
  const allOrders = useMemo(() => 
    [...orders].reverse(),
    [orders]
  );

  // Calculate pagination
  const totalPages = Math.ceil(allOrders.length / ORDERS_PER_PAGE);
  const startIdx = currentPage * ORDERS_PER_PAGE;
  const endIdx = startIdx + ORDERS_PER_PAGE;
  const pageOrders = allOrders.slice(startIdx, endIdx);

  const statusColor = (status: string) => {
    switch (status) {
      case 'WORKING':
        return 'yellow';
      case 'FILLED':
        return 'green';
      case 'PARTIALLY_FILLED':
        return 'blue';
      case 'REJECTED':
        return 'red';
      case 'CANCELED':
        return 'red';
      default:
        return 'gray';
    }
  };

  const sideColor = (side: string) => side === 'Buy' ? 'green' : 'red';

  // Reset to first page if page becomes invalid
  if (currentPage >= totalPages && totalPages > 0) {
    setCurrentPage(totalPages - 1);
  }

  return (
    <Card.Root height="100%">
      <Card.Header pb={2}>
        <HStack justify="space-between" width="100%">
          <Heading size="md">Recent Orders (showing {pageOrders.length} of {orders.length})</Heading>
          {totalPages > 1 && (
            <HStack gap={1}>
              <Button
                size="xs"
                onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                disabled={currentPage === 0}
                variant="outline"
                bg="white"
                color="black"
                fontWeight="bold"
                border="2px solid #2d3748"
              >
                ← Prev
              </Button>
              <Text fontSize="xs" minWidth="60px" textAlign="center">
                Page {currentPage + 1} of {totalPages}
              </Text>
              <Button
                size="xs"
                onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                disabled={currentPage === totalPages - 1}
                variant="outline"
                bg="white"
                color="black"
                fontWeight="bold"
                border="2px solid #2d3748"
              >
                Next →
              </Button>
            </HStack>
          )}
        </HStack>
      </Card.Header>
      <Card.Body overflowY="auto">
        {pageOrders.length === 0 ? (
          <Text color="gray.500" fontSize="sm">No orders yet</Text>
        ) : (
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Time</Table.ColumnHeader>
                <Table.ColumnHeader>Symbol</Table.ColumnHeader>
                <Table.ColumnHeader>Side</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="right">Qty</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="right">Filled</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="right">Price</Table.ColumnHeader>
                <Table.ColumnHeader>Status</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {pageOrders.map((o) => (
                <Table.Row key={o.orderId + '-' + o.timestamp}>
                  <Table.Cell fontSize="xs">{new Date(o.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 1 })}</Table.Cell>
                  <Table.Cell fontSize="xs">{o.symbol}</Table.Cell>
                  <Table.Cell>
                    <Badge colorScheme={sideColor(o.side)} fontSize="xs">{o.side}</Badge>
                  </Table.Cell>
                  <Table.Cell textAlign="right" fontSize="xs">{(o.qty ?? 0).toFixed(4)}</Table.Cell>
                  <Table.Cell textAlign="right" fontSize="xs">{(o.filledQty ?? 0).toFixed(4)}</Table.Cell>
                  <Table.Cell textAlign="right" fontSize="xs">{(o.fillPrice ?? 0).toFixed(2)}</Table.Cell>
                  <Table.Cell>
                    <Badge colorScheme={statusColor(o.status)} fontSize="xs">
                      {o.status}
                    </Badge>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        )}
      </Card.Body>
    </Card.Root>
  );
}
