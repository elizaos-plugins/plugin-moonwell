# @elizaos/plugin-moonwell

A Moonwell Protocol integration plugin for ElizaOS that enables DeFi lending, borrowing, and yield farming operations across Base, Optimism, and Moonbeam networks.

## Features

###  DeFi Operations
- **Multi-Network Support**: Base, Optimism, and Moonbeam via official Moonwell SDK
- **Lending & Borrowing**: Supply assets to earn yield and borrow against collateral
- **Position Management**: Monitor health factors and liquidation risks
- **Market Data**: Real-time APYs, liquidity, and utilization rates
- **Safety Features**: Health factor monitoring and liquidation prevention

## Installation

```bash
bun add @elizaos/plugin-moonwell
```

## Configuration

Create a `.env` file in your project root:

```env
# Required
MOONWELL_NETWORK=base                    # Options: base, optimism, moonbeam
BASE_RPC_URL=https://mainnet.base.org   # Base L2 RPC endpoint

# Optional
OPTIMISM_RPC_URL=https://optimism.llamarpc.com  # For Optimism network
MOONBEAM_RPC_URL=https://rpc.api.moonbeam.network  # For Moonbeam network
WALLET_PRIVATE_KEY=your_private_key      # For transaction execution
HEALTH_FACTOR_ALERT=1.5                  # Health factor alert threshold
```

## Usage

### Register the Plugin

```typescript
import { moonwellPlugin } from '@elizaos/plugin-moonwell';

// Register with your ElizaOS agent
agent.registerPlugin(moonwellPlugin);
```

### Available Actions

#### Supply Assets
```typescript
// Natural language
"Supply 1000 USDC to Moonwell"
"Lend 0.5 ETH to earn yield on Moonwell"

// With options
{
  action: "MOONWELL_SUPPLY",
  options: {
    asset: "USDC",
    amount: "1000",
    enableAsCollateral: true
  }
}
```

#### Borrow Assets
```typescript
// Natural language
"Borrow 500 USDC from Moonwell"
"Borrow 0.2 ETH against my collateral"

// With options
{
  action: "MOONWELL_BORROW",
  options: {
    asset: "USDC",
    amount: "500"
  }
}
```

#### Repay Debt
```typescript
// Natural language
"Repay 300 USDC to Moonwell"
"Pay back all my DAI debt on Moonwell"

// With options
{
  action: "MOONWELL_REPAY",
  options: {
    asset: "USDC",
    amount: "300"  // or "max" for full repayment
  }
}
```

#### Withdraw Assets
```typescript
// Natural language
"Withdraw 500 USDC from Moonwell"
"Remove 0.1 ETH from my Moonwell position"

// With options
{
  action: "MOONWELL_WITHDRAW",
  options: {
    asset: "USDC",
    amount: "500"
  }
}
```

#### Check Position
```typescript
// Natural language
"What's my Moonwell position?"
"Check my health factor on Moonwell"
"Show my Moonwell lending and borrowing balances"
```

#### Market Data
```typescript
// Natural language
"What are the current Moonwell lending rates?"
"Show me USDC supply and borrow APYs"
"What's the best yield on Moonwell?"
```

### Providers

The plugin includes context providers that supply Moonwell data to the agent:

#### MOONWELL_POSITION
Provides current user position data:
```typescript
"Moonwell Position:
- Total Supplied: $5,000.00 (Health Factor: 2.15)
- USDC: $3,000.00 supplied (5.25% APY)
- ETH: $2,000.00 supplied (3.80% APY)
- Total Borrowed: $1,500.00
- DAI: $1,500.00 borrowed (6.50% APY)"
```

#### MOONWELL_MARKETS
Provides current market conditions:
```typescript
"Moonwell Markets:
- USDC: 5.25% supply / 6.50% borrow APY (85% utilized)
- ETH: 3.80% supply / 4.95% borrow APY (78% utilized)
- DAI: 4.10% supply / 5.75% borrow APY (71% utilized)"
```

## Supported Networks & Assets

### Networks
- **Base**: Ethereum L2 with low fees
- **Optimism**: Fast and scalable L2
- **Moonbeam**: Polkadot-based EVM chain

### Common Assets
- **USDC** - USD Coin
- **WETH** - Wrapped Ethereum  
- **DAI** - Dai Stablecoin
- **USDT** - Tether USD
- Network-specific assets available

## Service API

The plugin exposes a `MoonwellService` for programmatic access:

```typescript
const moonwellService = runtime.getService<MoonwellService>('moonwell');

// Supply assets
const supplyResult = await moonwellService.supply({
  asset: 'USDC',
  amount: new BigNumber('1000'),
  enableAsCollateral: true
});

// Get user position
const position = await moonwellService.getUserPosition();

// Get market data
const markets = await moonwellService.getMarketData();
```

## Safety Features

- **Health Factor Monitoring**: Continuous monitoring with configurable alerts
- **Liquidation Prevention**: Blocks risky operations that could lead to liquidation  
- **Transaction Validation**: Comprehensive validation before executing transactions
- **Error Recovery**: Detailed error messages with remediation suggestions

## Development

### Building
```bash
bun run build
```

### Testing
```bash
bun run test
```

### Linting
```bash
bun run lint
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and feature requests, please create an issue on the [GitHub repository](https://github.com/elizaos/eliza).