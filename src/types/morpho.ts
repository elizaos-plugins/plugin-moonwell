import { BigNumber } from "bignumber.js";

// Morpho Market Interface
export interface MorphoMarket {
  id: string;
  chainId: number;
  loanToken: {
    address: string;
    symbol: string;
    decimals: number;
  };
  collateralToken: {
    address: string;
    symbol: string;
    decimals: number;
  };
  oracle: string;
  irm: string; // Interest Rate Model
  lltv: BigNumber; // Loan-to-Liquidation Threshold Value
  supplyAPY: number;
  borrowAPY: number;
  totalSupplyAssets: BigNumber;
  totalBorrowAssets: BigNumber;
  totalSupplyShares: BigNumber;
  totalBorrowShares: BigNumber;
  fee: BigNumber;
  utilization: number;
  priceInUSD?: number;
}

// Morpho User Position Interface
export interface MorphoUserPosition {
  marketId: string;
  supplyShares: BigNumber;
  supplyAssets: BigNumber;
  borrowShares: BigNumber;
  borrowAssets: BigNumber;
  collateral: BigNumber;
  healthFactor: number;
  supplyAPY: number;
  borrowAPY: number;
  isCollateralEnabled: boolean;
}

// Morpho Reward Interface
export interface MorphoReward {
  token: string;
  symbol: string;
  amount: BigNumber;
  valueInUSD: BigNumber;
  marketId?: string; // Optional - which market the reward is from
}

// Morpho User Rewards Interface
export interface MorphoUserRewards {
  rewards: MorphoReward[];
  totalValueInUSD: BigNumber;
}

// Morpho Market Parameters for actions
export interface MorphoSupplyParams {
  marketId: string;
  amount: BigNumber;
  enableAsCollateral?: boolean;
}

export interface MorphoBorrowParams {
  marketId: string;
  amount: BigNumber;
}

export interface MorphoRepayParams {
  marketId: string;
  amount: BigNumber;
  isMax?: boolean;
}

export interface MorphoWithdrawParams {
  marketId: string;
  amount: BigNumber;
  isMax?: boolean;
}

// Morpho Transaction Results
export interface MorphoSupplyResult {
  transactionHash: string;
  suppliedAmount: BigNumber;
  newSupplyShares: BigNumber;
  newSupplyAssets: BigNumber;
  currentAPY: number;
  collateralEnabled: boolean;
}

export interface MorphoBorrowResult {
  transactionHash: string;
  borrowedAmount: BigNumber;
  newBorrowShares: BigNumber;
  newBorrowAssets: BigNumber;
  interestRate: number;
  healthFactor: number;
}

export interface MorphoRepayResult {
  transactionHash: string;
  repaidAmount: BigNumber;
  remainingBorrowShares: BigNumber;
  remainingBorrowAssets: BigNumber;
  healthFactor: number;
}

export interface MorphoWithdrawResult {
  transactionHash: string;
  withdrawnAmount: BigNumber;
  remainingSupplyShares: BigNumber;
  remainingSupplyAssets: BigNumber;
  healthFactor: number;
}

// Morpho Market Info (simplified view for display)
export interface MorphoMarketInfo {
  id: string;
  name: string;
  loanToken: string;
  collateralToken: string;
  supplyAPY: number;
  borrowAPY: number;
  utilization: number;
  totalSuppliedUSD: BigNumber;
  totalBorrowedUSD: BigNumber;
  availableLiquidity: BigNumber;
  ltv: number; // Loan-to-Value ratio as percentage
}

// Morpho Portfolio Summary
export interface MorphoPortfolio {
  totalSuppliedUSD: BigNumber;
  totalBorrowedUSD: BigNumber;
  netWorth: BigNumber;
  totalRewardsUSD: BigNumber;
  avgSupplyAPY: number;
  avgBorrowAPY: number;
  positions: MorphoUserPosition[];
  rewards: MorphoUserRewards;
}

// Morpho Market Filters
export interface MorphoMarketFilters {
  loanToken?: string;
  collateralToken?: string;
  minSupplyAPY?: number;
  minBorrowAPY?: number;
  minLiquidity?: BigNumber;
  maxUtilization?: number;
}

// Morpho Vault Interface
export interface MorphoVault {
  id: string;
  address: string;
  name: string;
  symbol: string;
  asset: {
    address: string;
    symbol: string;
    decimals: number;
  };
  totalAssets: BigNumber;
  totalShares: BigNumber;
  sharePrice: BigNumber;
  apy: number;
  tvl: BigNumber;
  tvlInUSD: BigNumber;
  strategy: string;
  strategyDescription: string;
  curator: string;
  fee: BigNumber; // Management fee percentage
  performanceFee: BigNumber;
  capacity: BigNumber;
  available: BigNumber; // Available deposit capacity
  utilizationRate: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  createdAt: number; // Timestamp
  lastUpdate: number; // Timestamp
}

// Morpho Vault User Position Interface
export interface MorphoVaultUserPosition {
  vaultId: string;
  vaultAddress: string;
  userAddress: string;
  shares: BigNumber;
  assets: BigNumber; // Underlying asset amount
  assetsInUSD: BigNumber;
  entryPrice: BigNumber; // Share price when user entered
  currentPrice: BigNumber; // Current share price
  unrealizedGain: BigNumber; // In underlying asset
  unrealizedGainInUSD: BigNumber;
  unrealizedGainPercent: number;
  depositedAmount: BigNumber; // Total amount deposited historically
  depositedAmountInUSD: BigNumber;
  weightedAverageEntry: BigNumber; // Average entry price
  lastDepositTime: number; // Timestamp
  totalDeposits: number; // Number of deposits
  totalWithdrawals: number; // Number of withdrawals
}

// Morpho Vault Snapshot Interface for historical data
export interface MorphoVaultSnapshot {
  vaultId: string;
  timestamp: number;
  totalAssets: BigNumber;
  totalShares: BigNumber;
  sharePrice: BigNumber;
  apy: number;
  tvl: BigNumber;
  tvlInUSD: BigNumber;
  utilizationRate: number;
  performance1d: number; // 1-day performance %
  performance7d: number; // 7-day performance %
  performance30d: number; // 30-day performance %
  volume24h: BigNumber;
  uniqueDepositors: number;
  strategyAllocations: StrategyAllocation[];
}

// Strategy Allocation for vault snapshots
export interface StrategyAllocation {
  strategy: string;
  allocation: BigNumber; // Amount allocated to this strategy
  percentage: number; // Percentage of total vault assets
  apy: number; // Strategy-specific APY
}

// Morpho Vault Performance Metrics
export interface MorphoVaultPerformance {
  vaultId: string;
  timeframe: "1d" | "7d" | "30d" | "90d" | "1y" | "all";
  startPrice: BigNumber;
  endPrice: BigNumber;
  totalReturn: number; // Percentage return
  annualizedReturn: number; // Annualized return percentage
  volatility: number; // Volatility percentage
  sharpeRatio: number;
  maxDrawdown: number; // Maximum drawdown percentage
  totalVolume: BigNumber;
  averageApy: number;
  snapshots: MorphoVaultSnapshot[];
}

// Morpho Vault Deposit Parameters
export interface MorphoVaultDepositParams {
  vaultId: string;
  amount: BigNumber;
  minShares?: BigNumber; // Minimum shares to receive (slippage protection)
}

// Morpho Vault Withdraw Parameters
export interface MorphoVaultWithdrawParams {
  vaultId: string;
  shares?: BigNumber; // Either shares or amount
  amount?: BigNumber;
  maxShares?: BigNumber; // Maximum shares to burn
  isMaxWithdraw?: boolean; // Withdraw all shares
}

// Morpho Vault Transaction Results
export interface MorphoVaultDepositResult {
  transactionHash: string;
  vaultId: string;
  depositedAmount: BigNumber;
  receivedShares: BigNumber;
  sharePrice: BigNumber;
  newTotalShares: BigNumber;
  newTotalAssets: BigNumber;
}

export interface MorphoVaultWithdrawResult {
  transactionHash: string;
  vaultId: string;
  withdrawnAmount: BigNumber;
  burnedShares: BigNumber;
  sharePrice: BigNumber;
  newTotalShares: BigNumber;
  newTotalAssets: BigNumber;
}

// Morpho Vault Summary for display
export interface MorphoVaultSummary {
  totalVaults: number;
  totalTVL: BigNumber;
  totalTVLInUSD: BigNumber;
  averageAPY: number;
  topPerformingVault: {
    id: string;
    name: string;
    apy: number;
    performance30d: number;
  };
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
  };
  vaults: MorphoVault[];
}

// Morpho Vault User Portfolio
export interface MorphoVaultPortfolio {
  userAddress: string;
  totalValueInUSD: BigNumber;
  totalUnrealizedGainInUSD: BigNumber;
  totalUnrealizedGainPercent: number;
  averageAPY: number;
  positions: MorphoVaultUserPosition[];
  riskExposure: {
    low: BigNumber;
    medium: BigNumber;
    high: BigNumber;
  };
  lastUpdated: number;
}

// Morpho Vault Filters
export interface MorphoVaultFilters {
  asset?: string;
  minAPY?: number;
  maxRiskLevel?: "LOW" | "MEDIUM" | "HIGH";
  minTVL?: BigNumber;
  strategy?: string;
  hasUserPosition?: boolean;
}