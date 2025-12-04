// src/components/AccountPanel.tsx
import {
  Card,
  Heading,
  HStack,
  VStack,
  Text,
  Badge,
  Box,
} from '@chakra-ui/react';
import { useMemo } from 'react';
import { useOrderStore } from '../store/orderStore';
import { useTickStore } from '../store/tickStore';

const STARTING_BALANCE = 10000; // Default starting balance for demo

export function AccountPanel() {
  const orders = useOrderStore((s) => s.orders);
  const positionsMap = useOrderStore((s) => s.positions);
  const positions = useMemo(() => Array.from(positionsMap.values()), [positionsMap]);
  const ticks = useTickStore((s) => s.ticks);

  // Get the latest price
  const latestPrice = ticks.length > 0 ? ticks[ticks.length - 1].last : 0;

  // Calculate total filled quantity and cash used
  const filledOrders = orders.filter((o) => o.status === 'FILLED' || o.status === 'PARTIALLY_FILLED');
  
  let cashUsed = 0;
  filledOrders.forEach((o) => {
    const filledQty = o.filledQty ?? 0;
    const fillPrice = o.fillPrice ?? 0;
    const cost = filledQty * fillPrice;
    if (o.side === 'Buy') {
      cashUsed += cost;
    } else {
      cashUsed -= cost;
    }
  });

  // Calculate unrealized P&L
  let unrealizedPnL = 0;
  positions.forEach((pos) => {
    const avgPrice = pos.avgPrice ?? 0;
    const priceDelta = latestPrice - avgPrice;
    unrealizedPnL += priceDelta * (pos.qty ?? 0);
  });

  // Calculate available cash
  const availableCash = STARTING_BALANCE - cashUsed;
  const totalValue = availableCash + unrealizedPnL;
  const dayPnL = totalValue - STARTING_BALANCE;
  const returnPercent = (dayPnL / STARTING_BALANCE) * 100;

  const pnlColor = (pnl: number) => {
    if (pnl > 0) return 'green';
    if (pnl < 0) return 'red';
    return 'gray';
  };

  return (
    <Card.Root height="100%">
      <Card.Header pb={2}>
        <Heading size="md">Account Summary</Heading>
      </Card.Header>
      <Card.Body>
        <VStack gap={4} align="stretch">
          {/* Account Balance Section */}
          <Box>
            <Text fontSize="xs" color="gray.500" mb={1}>STARTING BALANCE</Text>
            <Text fontSize="lg" fontWeight="bold">${STARTING_BALANCE.toFixed(2)}</Text>
          </Box>

          <Box height="1px" bg="gray.700" />

          {/* Cash Section */}
          <HStack justify="space-between">
            <VStack gap={0} align="flex-start">
              <Text fontSize="xs" color="gray.500">Cash Available</Text>
              <Text fontSize="sm" fontWeight="bold">${availableCash.toFixed(2)}</Text>
            </VStack>
            <VStack gap={0} align="flex-end">
              <Text fontSize="xs" color="gray.500">Cash Used</Text>
              <Text fontSize="sm" fontWeight="bold">${cashUsed.toFixed(2)}</Text>
            </VStack>
          </HStack>

          <Box height="1px" bg="gray.700" />

          {/* P&L Section */}
          <VStack gap={2} align="stretch">
            <HStack justify="space-between">
              <Text fontSize="xs" color="gray.500">Unrealized P&L</Text>
              <Badge colorScheme={pnlColor(unrealizedPnL)} fontSize="xs">
                {unrealizedPnL >= 0 ? '+' : ''}{unrealizedPnL.toFixed(2)}
              </Badge>
            </HStack>
            <HStack justify="space-between">
              <Text fontSize="xs" color="gray.500">Day P&L</Text>
              <Badge colorScheme={pnlColor(dayPnL)} fontSize="xs">
                {dayPnL >= 0 ? '+' : ''}{dayPnL.toFixed(2)}
              </Badge>
            </HStack>
            <HStack justify="space-between">
              <Text fontSize="xs" color="gray.500">Return %</Text>
              <Badge colorScheme={pnlColor(dayPnL)} fontSize="xs">
                {returnPercent >= 0 ? '+' : ''}{returnPercent.toFixed(2)}%
              </Badge>
            </HStack>
          </VStack>

          <Box height="1px" bg="gray.700" />

          {/* Portfolio Stats */}
          <HStack justify="space-between">
            <VStack gap={0} align="flex-start">
              <Text fontSize="xs" color="gray.500">Total Portfolio Value</Text>
              <Text fontSize="md" fontWeight="bold" color={pnlColor(dayPnL)}>${totalValue.toFixed(2)}</Text>
            </VStack>
            <VStack gap={0} align="flex-end">
              <Text fontSize="xs" color="gray.500">Open Positions</Text>
              <Text fontSize="md" fontWeight="bold">{positions.length}</Text>
            </VStack>
          </HStack>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}
