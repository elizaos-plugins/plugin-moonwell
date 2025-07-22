# @elizaos/plugin-moonwell

A Moonwell Protocol integration plugin for ElizaOS that enables DeFi lending, borrowing, and yield farming operations on Base L2, with additional support for Morpho protocol integration.

## Features

### 🏦 DeFi Operations
- **Base L2 Support**: Primary support for Base mainnet and Base Sepolia testnet
- **Lending & Borrowing**: Supply assets to earn yield and borrow against collateral
- **Morpho Integration**: Access to Morpho markets and vaults for enhanced yield opportunities
- **Position Management**: Monitor health factors and liquidation risks
- **Market Data**: Real-time APYs, liquidity, and utilization rates
- **Rewards**: Claim protocol rewards and incentives
- **Safety Features**: Health factor monitoring and liquidation prevention

## Installation

```bash
bun add @elizaos/plugin-moonwell
```

## Configuration

Create a `.env` file in your project root:

```env
# Required
BASE_RPC_URL=https://mainnet.base.org   # Base L2 RPC endpoint

# Optional
MOONWELL_API_KEY=your_api_key           # Moonwell API key for enhanced data
MOONWELL_NETWORK=base                   # Options: base, base-sepolia
WALLET_PRIVATE_KEY=your_private_key     # For transaction execution
HEALTH_FACTOR_ALERT=1.5                 # Health factor alert threshold
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

// Action format
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

// Action format
{
  action: "MOONWELL_BORROW",
  options: {
    asset: "USDC",
    amount: "500",
    interestRateMode: "variable"
  }
}
```

#### Repay Debt
```typescript
// Natural language
"Repay 300 USDC to Moonwell"
"Pay back all my DAI debt on Moonwell"

// Action format
{
  action: "MOONWELL_REPAY",
  options: {
    asset: "USDC",
    amount: "300",  // or use isMax: true for full repayment
    isMax: false
  }
}
```

#### Withdraw Assets
```typescript
// Natural language
"Withdraw 500 USDC from Moonwell"
"Remove 0.1 ETH from my Moonwell position"

// Action format
{
  action: "MOONWELL_WITHDRAW",
  options: {
    asset: "USDC",
    amount: "500",
    isMax: false
  }
}
```

#### Check Position
```typescript
// Natural language
"What's my Moonwell position?"
"Check my health factor on Moonwell"
"Show my Moonwell lending and borrowing balances"

// Action: MOONWELL_POSITION
```

#### Market Data
```typescript
// Natural language
"What are the current Moonwell lending rates?"
"Show me USDC supply and borrow APYs"
"What's the best yield on Moonwell?"

// Action: MOONWELL_MARKET_DATA
```

#### Morpho Markets
```typescript
// Natural language
"Show me Morpho markets on Moonwell"
"What are the Morpho lending opportunities?"

// Action: MOONWELL_MORPHO_MARKETS
```

#### Morpho Vaults
```typescript
// Natural language
"Show me available Morpho vaults"
"What vaults can I deposit into?"

// Action: MOONWELL_MORPHO_VAULTS
```

#### Claim Rewards
```typescript
// Natural language
"Claim my Moonwell rewards"
"Collect my protocol incentives"

// Action: MOONWELL_CLAIM_REWARDS
```

### Providers

The plugin includes context providers that supply Moonwell data to the agent:

#### MOONWELL_POSITION_CONTEXT
Provides comprehensive user position data across all markets:
```typescript
"Moonwell Position Summary:
- Total Portfolio Value: $5,000.00 (Health Factor: 2.15)
- Core Markets:
  - USDC: $3,000.00 supplied (5.25% APY)
  - ETH: $2,000.00 supplied (3.80% APY)
- Morpho Positions:
  - Active vaults: 2
  - Total borrowed: $1,500.00
- DAI: $1,500.00 borrowed (6.50% APY)"
```

#### MOONWELL_MARKET_DATA
Provides current market conditions and opportunities:
```typescript
"Moonwell Markets Overview:
Core Markets:
- USDC: 5.25% supply / 6.50% borrow APY (85% utilized)
- ETH: 3.80% supply / 4.95% borrow APY (78% utilized)
- DAI: 4.10% supply / 5.75% borrow APY (71% utilized)

Morpho Markets: 15 available
Top Morpho Vaults: 8 active"
```

## Supported Networks & Assets

### Networks
- **Base**: Primary Ethereum L2 with low fees (mainnet)
- **Base Sepolia**: Base testnet for development

### Common Assets on Base
- **USDC** - USD Coin
- **WETH** - Wrapped Ethereum  
- **DAI** - Dai Stablecoin
- **USDT** - Tether USD
- **cbETH** - Coinbase Wrapped Staked ETH
- **rETH** - Rocket Pool ETH
- Additional assets available through Morpho integration

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

// Get Morpho markets
const morphoMarkets = await moonwellService.getMorphoMarkets();

// Get Morpho vaults
const morphoVaults = await moonwellService.getMorphoVaults();

// Claim rewards
const rewards = await moonwellService.claimRewards();
```

## Morpho Protocol Integration

This plugin includes comprehensive Morpho protocol support:

### Features
- **Morpho Markets**: Access isolated lending markets with competitive rates
- **Morpho Vaults**: Automated yield strategies and risk management
- **Enhanced Analytics**: Detailed position tracking across both protocols
- **Unified Interface**: Manage Moonwell and Morpho positions through one plugin

### Morpho-Specific Operations
- View available Morpho markets and their parameters
- Monitor Morpho vault performance and yields
- Track user positions across Morpho markets
- Access Morpho-specific rewards and incentives

## Safety Features

- **Health Factor Monitoring**: Continuous monitoring with configurable alerts
- **Liquidation Prevention**: Blocks risky operations that could lead to liquidation  
- **Transaction Validation**: Comprehensive validation before executing transactions
- **Error Recovery**: Detailed error messages with remediation suggestions
- **Multi-Protocol Risk Assessment**: Unified risk monitoring across Moonwell and Morpho

## Development

### Building
```bash
bun run build
```

### Testing
```bash
bun run test
```

### Development Mode
```bash
bun run dev
```

### Linting
```bash
bun run lint
```

### Formatting
```bash
bun run format
```

## Error Handling

The plugin includes comprehensive error handling with specific error codes:

- `INSUFFICIENT_BALANCE`: Not enough tokens for operation
- `INSUFFICIENT_COLLATERAL`: Not enough collateral for borrowing
- `HEALTH_FACTOR_TOO_LOW`: Operation would result in liquidation risk
- `ASSET_NOT_SUPPORTED`: Requested asset not available
- `NETWORK_ERROR`: RPC or network connectivity issues
- `TRANSACTION_FAILED`: Blockchain transaction failed

## Configuration Schema

The plugin validates configuration using Zod schema:

```typescript
{
  MOONWELL_API_KEY?: string,      // Optional API key for enhanced data
  BASE_RPC_URL: string,           // Required Base RPC endpoint
  WALLET_PRIVATE_KEY?: string,    // Optional for read-only mode
  HEALTH_FACTOR_ALERT?: number,   // Default: 1.5
  MOONWELL_NETWORK?: "base" | "base-sepolia"  // Default: "base"
}
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and feature requests, please create an issue on the [GitHub repository](https://github.com/elizaos/eliza).

## Version

Current version: 1.2.3

Built with:
- Moonwell SDK v0.8.1+
- ElizaOS Core v1.2.5+
- Ethers v6.13.4+
- Viem v2.21.54+