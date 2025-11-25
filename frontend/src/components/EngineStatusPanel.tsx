// src/components/EngineStatusPanel.tsx
import { Card, Heading, Text, Badge, HStack } from '@chakra-ui/react';

export function EngineStatusPanel() {
  // later you can wire this to actual engine status over REST/WS
  const status = 'RUNNING (mock)';
  const latencyMs = 5; // placeholder

  return (
    <Card.Root>
      <Card.Header pb={2}>
        <Heading size="md">Engine Status</Heading>
      </Card.Header>
      <Card.Body>
        <HStack gap={3} mb={2}>
          <Text>Status:</Text>
          <Badge colorScheme="green">{status}</Badge>
        </HStack>
        <Text fontSize="sm" color="gray.400">
          Mocked data for now. Later this will reflect live state from the C++ engine.
        </Text>
        <Text mt={4} fontSize="sm">
          Approx. tick latency: <b>{latencyMs} ms</b> (placeholder)
        </Text>
      </Card.Body>
    </Card.Root>
  );
}
