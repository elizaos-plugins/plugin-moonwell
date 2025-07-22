import { BigNumber } from "bignumber.js";

// Supply Operations
export interface SupplyParams {
  asset: string;
  amount: BigNumber;
  enableAsCollateral: boolean;
}

export interface SupplyResult {
  transactionHash: string;
  mTokenBalance: BigNumber;
  currentAPY: number;
  collateralEnabled: boolean;
}

// Borrow Operations
export interface BorrowParams {
  asset: string;
  amount: BigNumber;
  interestRateMode: "stable" | "variable";
}

export interface BorrowResult {
  transactionHash: string;
  borrowedAmount: BigNumber;
  interestRate: number;
  healthFactor: number;
}

// Repay Operations
export interface RepayParams {
  asset: string;
  amount: BigNumber;
  isMax?: boolean;
}

export interface RepayResult {
  transactionHash: string;
  repaidAmount: BigNumber;
  remainingDebt: BigNumber;
  healthFactor: number;
}

// Withdraw Operations
export interface WithdrawParams {
  asset: string;
  amount: BigNumber;
  isMax?: boolean;
}

export interface WithdrawResult {
  transactionHash: string;
  withdrawnAmount: BigNumber;
  remainingSupply: BigNumber;
  healthFactor: number;
}

// Position Data
export interface UserPosition {
  totalSupplied: BigNumber;
  totalBorrowed: BigNumber;
  healthFactor: number;
  liquidationThreshold: number;
  availableToBorrow: BigNumber;
  supplies: AssetPosition[];
  borrows: AssetPosition[];
}

export interface AssetPosition {
  asset: string;
  symbol: string;
  balance: BigNumber;
  balanceInUSD: BigNumber;
  apy: number;
  isCollateral?: boolean;
  liquidationThreshold?: number;
}

// Market Data
export interface MarketData {
  asset: string;
  symbol: string;
  supplyAPY: number;
  borrowAPY: number;
  totalSupply: BigNumber;
  totalBorrow: BigNumber;
  utilizationRate: number;
  liquidityAvailable: BigNumber;
  collateralFactor: number;
  priceInUSD: number;
}

// Error Handling
export interface MoonwellError {
  code: MoonwellErrorCode;
  message: string;
  details?: any;
  suggestions?: string[];
  healthFactor?: number;
}

export enum MoonwellErrorCode {
  // Validation Errors
  INVALID_AMOUNT = "INVALID_AMOUNT",
  UNSUPPORTED_ASSET = "UNSUPPORTED_ASSET",
  INVALID_PARAMETERS = "INVALID_PARAMETERS",

  // Position Errors
  INSUFFICIENT_COLLATERAL = "INSUFFICIENT_COLLATERAL",
  LIQUIDATION_RISK = "LIQUIDATION_RISK",
  EXCEEDS_BORROW_CAPACITY = "EXCEEDS_BORROW_CAPACITY",

  // Market Errors
  INSUFFICIENT_LIQUIDITY = "INSUFFICIENT_LIQUIDITY",
  MARKET_PAUSED = "MARKET_PAUSED",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",

  // Network Errors
  RPC_ERROR = "RPC_ERROR",
  TRANSACTION_FAILED = "TRANSACTION_FAILED",
  TIMEOUT = "TIMEOUT",

  // Wallet Errors
  WALLET_NOT_CONNECTED = "WALLET_NOT_CONNECTED",
  INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
  APPROVAL_REQUIRED = "APPROVAL_REQUIRED",
}

// Configuration
export interface MoonwellConfig {
  network: "base" | "base-sepolia";
  rpcUrl: string;
  moonwellApiUrl?: string;
  moonwellApiKey?: string;
  healthFactorThreshold: number;
  maxGasPrice?: BigNumber;
  retryAttempts: number;
  monitoringInterval: number;
}

// Transaction Types
export interface Transaction {
  to: string;
  from: string;
  data: string;
  value?: string;
  gasLimit?: string;
  gasPrice?: string;
}

export interface SignedTransaction extends Transaction {
  signature: string;
  hash?: string;
}

export interface TransactionReceipt {
  transactionHash: string;
  blockNumber: number;
  blockHash: string;
  gasUsed: string;
  status: "success" | "reverted";
  logs: any[];
}

// Service State
export interface MoonwellServiceState {
  isInitialized: boolean;
  network: "base" | "base-sepolia";
  userAddress?: string;
  positionCache?: UserPosition;
  marketDataCache?: MarketData[];
  lastUpdate?: number;
}

// SDK Types (minimal interface for what we need from Moonwell SDK)
export interface MoonwellSDKConfig {
  network: "base" | "base-sepolia";
  rpcUrl: string;
  apiKey?: string;
}

export interface MoonwellMarket {
  address: string;
  symbol: string;
  underlyingAsset: string;
  supplyRate: BigNumber;
  borrowRate: BigNumber;
  totalSupply: BigNumber;
  totalBorrows: BigNumber;
  exchangeRate: BigNumber;
  collateralFactor: BigNumber;
}

// Reward Types
export interface UserReward {
  token: string;
  symbol: string;
  amount: BigNumber;
  valueInUSD: BigNumber;
}

export interface UserRewards {
  rewards: UserReward[];
  totalValueInUSD: BigNumber;
}

export interface ClaimRewardsResult {
  transactionHash: string;
  rewardsClaimed: Array<{
    token: string;
    amount: BigNumber;
  }>;
}

// Enhanced Balance Types
export interface EnhancedUserBalance {
  tokenAddress: string;
  symbol: string;
  balance: BigNumber;
  balanceInUSD: BigNumber;
  price: number;
  source: "wallet" | "core" | "morpho" | "vault";
  apy?: number;
  isCollateral?: boolean;
  marketId?: string;
  vaultId?: string;
}

export interface BalanceBreakdown {
  walletBalances: EnhancedUserBalance[];
  corePositions: EnhancedUserBalance[];
  morphoPositions: EnhancedUserBalance[];
  vaultPositions: EnhancedUserBalance[];
  totalBalanceInUSD: BigNumber;
  totalWalletValueInUSD: BigNumber;
  totalCoreValueInUSD: BigNumber;
  totalMorphoValueInUSD: BigNumber;
  totalVaultValueInUSD: BigNumber;
}

export interface ComprehensiveUserData {
  userAddress: string;
  // Core Moonwell position data
  corePosition: UserPosition;
  coreRewards: UserRewards;
  // Morpho-related data (imported from morpho types)
  morphoMarkets: any[]; // MorphoMarket[]
  morphoPositions: any[]; // MorphoUserPosition[]
  morphoRewards: any; // MorphoUserRewards
  morphoVaultPortfolio: any | null; // MorphoVaultPortfolio | null
  // Enhanced balance data
  balanceBreakdown: BalanceBreakdown;
  // Portfolio summary
  portfolioSummary: PortfolioSummary;
  lastUpdated: number;
}

export interface PortfolioSummary {
  totalNetWorth: BigNumber;
  totalSupplied: BigNumber;
  totalBorrowed: BigNumber;
  totalRewardsValue: BigNumber;
  overallHealthFactor: number;
  weightedAverageSupplyAPY: number;
  weightedAverageBorrowAPY: number;
  riskDistribution: {
    safe: BigNumber;
    moderate: BigNumber;
    high: BigNumber;
    critical: BigNumber;
  };
  marketDistribution: {
    core: BigNumber;
    morpho: BigNumber;
    vaults: BigNumber;
  };
}

// User Balance Methods Interface
export interface UserBalanceParams {
  includeWallet?: boolean;
  includeCore?: boolean;
  includeMorpho?: boolean;
  includeVaults?: boolean;
  minBalanceThreshold?: BigNumber;
}

// Market Snapshot Types
export interface MarketSnapshot {
  asset: string;
  symbol: string;
  timestamp: number;
  supplyAPY: number;
  borrowAPY: number;
  totalSupply: BigNumber;
  totalBorrow: BigNumber;
  utilizationRate: number;
  liquidityAvailable: BigNumber;
  priceInUSD: number;
  volume24h: BigNumber;
  uniqueUsers: number;
}

export interface MarketSnapshotSummary {
  asset: string;
  symbol: string;
  currentPrice: number;
  priceChange24h: number;
  priceChange7d: number;
  apyTrend: {
    supply: {
      current: number;
      avg7d: number;
      avg30d: number;
    };
    borrow: {
      current: number;
      avg7d: number;
      avg30d: number;
    };
  };
  utilizationTrend: {
    current: number;
    avg7d: number;
    avg30d: number;
  };
  liquidityTrend: {
    current: BigNumber;
    avg7d: BigNumber;
    min7d: BigNumber;
    max7d: BigNumber;
  };
  volumeTrend: {
    total24h: BigNumber;
    avg7d: BigNumber;
    total7d: BigNumber;
  };
  snapshots: MarketSnapshot[];
}

export interface SnapshotFilters {
  asset?: string;
  timeframe?: "1d" | "7d" | "30d" | "90d";
  includeVolume?: boolean;
  includeUserMetrics?: boolean;
}

// Export Morpho types
export * from "./morpho";
