# @elizaos/plugin-moonwell

A comprehensive Moonwell Protocol integration plugin for ElizaOS that enables AI agents to interact with Moonwell's lending and borrowing markets on Base, Optimism, and Moonbeam networks. Built on the official Moonwell SDK for reliable protocol integration.

## Features

### 🏦 Core Capabilities
- **Multi-Network Support**: Base, Optimism, and Moonbeam networks via official SDK
- **Market Data Access**: Real-time lending and borrowing rates across all supported markets
- **Position Management**: Track user positions, health factors, and liquidation risks
- **Governance Integration**: Monitor proposals and voting power
- **Rewards Tracking**: View pending rewards and staking information

### 📊 Data Access (Currently Implemented)
- **Market Data Action**: Get current supply/borrow APYs, liquidity, and utilization
- **Position Action**: Check lending/borrowing positions and health factor
- **Governance Action**: View active proposals and voting power

### 💸 Transaction Support (Coming Soon)
- **Supply Assets**: Lend crypto assets to earn yield
- **Borrow Assets**: Borrow against supplied collateral
- **Repay Debt**: Repay borrowed assets to maintain healthy positions
- **Withdraw Assets**: Remove supplied assets while maintaining safe collateral ratios

## Installation

```bash
bun add @elizaos/plugin-moonwell
```

## Configuration

The plugin requires the following environment variables:

```env
# Network Configuration
MOONWELL_NETWORK=base                  # Options: base, optimism, moonbeam
BASE_RPC_URL=https://base.llamarpc.com # Base L2 RPC endpoint
OPTIMISM_RPC_URL=https://optimism.llamarpc.com # Optimism RPC endpoint

# Optional
MOONWELL_API_KEY=your_api_key_here     # For enhanced API access
WALLET_PRIVATE_KEY=your_private_key    # For transaction execution (testnet only)
HEALTH_FACTOR_ALERT=1.5                # Health factor alert threshold
```

## Usage

### Register the Plugin

```typescript
import { moonwellPlugin } from '@elizaos/plugin-moonwell';

// In your agent configuration
export const agentConfig = {
  name: "MyDeFiAgent",
  plugins: [moonwellPlugin],
  // ... other config
};
```

### Available Commands

#### Market Data
```
"What are the current Moonwell lending rates?"
"Show me USDC supply and borrow rates on Moonwell"
"What's the best APY on Moonwell right now?"
```

#### Position Monitoring
```
"What's my Moonwell position?"
"Check my health factor on Moonwell"
"Show me my Moonwell lending and borrowing balances"
```

#### Governance
```
"What are the active Moonwell proposals?"
"Check my Moonwell voting power"
"Show me Moonwell governance activity"
```

#### Transaction Commands (Coming Soon)
```
"Supply 1000 USDC to Moonwell"
"Borrow 500 USDC from Moonwell"
"Repay 300 USDC to Moonwell"
"Withdraw 500 USDC from Moonwell"
```

## Architecture

### Services

- **MoonwellService**: Core service using official Moonwell SDK for all protocol interactions
- **WalletService**: Manages wallet operations and transaction signing

### Actions

- **MarketDataAction**: Fetches and displays current market rates and conditions
- **PositionAction**: Shows user's lending/borrowing positions and health factor
- **GovernanceAction**: Displays governance proposals and voting power
- **SupplyAction**: Processes asset supply requests (coming soon)
- **BorrowAction**: Handles borrowing with collateral checks (coming soon)
- **RepayAction**: Manages debt repayment operations (coming soon)
- **WithdrawAction**: Processes withdrawals with safety checks (coming soon)

### Providers

- **PositionContextProvider**: Supplies current position data to agent context
- **MarketDataProvider**: Provides real-time market rates and conditions

### Evaluators

- **PositionHealthEvaluator**: Analyzes position changes post-interaction
- **InterestRateEvaluator**: Learns from lending/borrowing timing decisions

## Supported Networks & Assets

### Networks
- **Base**: Ethereum L2 with low fees
- **Optimism**: Fast and scalable L2
- **Moonbeam**: Polkadot-based EVM chain

### Common Assets Across Networks
- **USDC** - USD Coin
- **WETH** - Wrapped Ethereum
- **DAI** - Dai Stablecoin
- Network-specific assets available through SDK

## Safety Features

- **Health Factor Monitoring**: Continuous monitoring with configurable alerts
- **Liquidation Prevention**: Blocks risky operations that could lead to liquidation
- **Transaction Validation**: Comprehensive validation before executing transactions
- **Error Recovery**: Detailed error messages with suggested remediation actions

## Development

### Building

```bash
bun run build
```

### Testing

```bash
bun test
```

### Formatting

```bash
bun run format
```

## Example Integration

```typescript
import { ElizaAgent } from '@elizaos/core';
import { moonwellPlugin } from '@elizaos/plugin-moonwell';

const agent = new ElizaAgent({
  name: "DeFiAssistant",
  plugins: [moonwellPlugin],
  modelProvider: "openai",
});

// The agent can now handle Moonwell operations
// User: "Supply 1000 USDC to earn yield"
// Agent: "I'll help you supply 1000 USDC to Moonwell protocol..."
```

## Error Handling

The plugin provides detailed error messages for common issues:

- Insufficient balance
- Low health factor warnings
- Market liquidity constraints
- Network connectivity issues

## SDK Integration

This plugin is built on the official [Moonwell SDK](https://sdk.moonwell.fi/) v3.0.0+ and leverages:

- **Market Data**: `getMarkets()` and `getMarketSnapshots()` for real-time data
- **User Positions**: `getUserBalances()` for comprehensive position tracking
- **Governance**: `getProposals()` and `getStakingInfo()` for governance features
- **Multi-Network**: All SDK-supported networks with unified interface

## API Endpoints

The plugin exposes REST API endpoints for external access:

- `GET /moonwell/position/:address` - Get user position data
- `GET /moonwell/markets` - Get all market data
- `GET /moonwell/governance` - Get governance information

## Contributing

Contributions are welcome! Please ensure all tests pass and follow the existing code style.

## License

MIT