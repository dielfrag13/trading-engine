import React, { useState, useEffect } from 'react';
import { HStack, Circle, Text, Spinner, Button } from '@chakra-ui/react';
import { engineWS, type ConnectionStatus as ConnectionStatusType } from '../api/engineWS';

export const ConnectionStatus: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatusType>('disconnected');
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    // Subscribe to status changes
    const unsubscribe = engineWS.onStatusChange((newStatus) => {
      setStatus(newStatus);
      setIsReconnecting(false);
    });

    // Try to connect immediately
    engineWS.connect().catch(() => {
      // Connection failed, will retry automatically
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleReconnect = async () => {
    setIsReconnecting(true);
    try {
      await engineWS.reconnect();
    } catch (e) {
      console.error('Reconnection failed:', e);
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return 'green';
      case 'connecting':
        return 'yellow';
      case 'disconnected':
        return 'gray';
      case 'error':
        return 'red';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connected':
        return 'Connected to Engine';
      case 'connecting':
        return 'Connecting to Engine...';
      case 'disconnected':
        return 'Disconnected from Engine';
      case 'error':
        return 'Connection Error';
    }
  };

  // Make disconnected status clickable
  const isClickable = status === 'disconnected' || status === 'error';

  return (
    <HStack
      as={isClickable ? Button : 'div'}
      gap={2}
      p={3}
      bg="gray.900"
      borderRadius="md"
      border="1px solid"
      borderColor={`${getStatusColor()}.500`}
      minW="200px"
      onClick={isClickable && !isReconnecting ? handleReconnect : undefined}
      cursor={isClickable && !isReconnecting ? 'pointer' : 'default'}
      transition="all 0.2s"
      _hover={isClickable && !isReconnecting ? {
        bg: 'gray.800',
        borderColor: `${getStatusColor()}.400`,
      } : undefined}
      opacity={isReconnecting ? 0.7 : 1}
    >
      {status === 'connecting' || isReconnecting ? (
        <Spinner size="sm" color="yellow.500" />
      ) : (
        <Circle
          size="2"
          bg={`${getStatusColor()}.500`}
          boxShadow={`0 0 10px ${getStatusColor()}`}
        />
      )}
      <Text
        color={`${getStatusColor()}.400`}
        fontSize="sm"
        fontWeight="500"
        whiteSpace="nowrap"
      >
        {getStatusText()}
        {isClickable && !isReconnecting && ' (click to reconnect)'}
      </Text>
    </HStack>
  );
};
