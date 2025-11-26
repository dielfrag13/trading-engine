// src/App.tsx
import {
  Box,
  Flex,
  Grid,
  GridItem,
  Heading,
  IconButton,
  Spacer,
} from '@chakra-ui/react';
import { FiMoon, FiSun } from "react-icons/fi";
import { PriceChart } from './components/PriceChart';
import { EngineStatusPanel } from './components/EngineStatusPanel';
import { PositionsPanel } from './components/PositionsPanel';
import { OrdersPanel } from './components/OrdersPanel';
import { ConnectionStatus } from './components/ConnectionStatus';
import { useEngineConnection } from './hooks/useEngineConnection';
import { useState } from 'react';

function App() {
  // Use real live connection to C++ engine instead of mock
  useEngineConnection();
  // useMockTickStream('BTCUSD'); // Disabled in favor of live connection

  const [isDark, setIsDark] = useState(true);

  const toggleColorMode = () => {
    setIsDark(!isDark);
    document.documentElement.style.colorScheme = isDark ? 'light' : 'dark';
  };

  return (
    <Flex direction="column" minHeight="100vh" padding={4} gap={4}>
      {/* Top Bar */}
      <Flex align="center">
        <Heading size="lg">Trading Engine Dashboard (Frontend)</Heading>
        <Spacer />
        <ConnectionStatus />
        <IconButton
          aria-label="Toggle color mode"
          onClick={toggleColorMode}
          variant="ghost"
          ml={2}
        >
          {isDark ? <FiSun /> : <FiMoon />}
        </IconButton>
      </Flex>

      {/* Main Grid */}
      <Grid
        templateColumns={{ base: '1fr', lg: '2fr 1fr' }}
        templateRows={{ base: 'auto auto auto', lg: '1fr' }}
        gap={4}
        flex="1"
        alignItems="stretch"
      >
        <GridItem rowSpan={{ base: 1, lg: 1 }}>
          <PriceChart />
        </GridItem>

        <GridItem display="flex" flexDirection="column" gap={4}>
          <EngineStatusPanel />
          <Box flex="1" display="flex" flexDirection="column" gap={4} minHeight="0">
            <PositionsPanel />
            <OrdersPanel />
          </Box>
        </GridItem>
      </Grid>
    </Flex>
  );
}

export default App;
