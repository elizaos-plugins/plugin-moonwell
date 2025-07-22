import { Service, IAgentRuntime, logger } from "@elizaos/core";
import { BigNumber } from "bignumber.js";
import { ethers } from "ethers";
import { 
  createMoonwellClient, 
  type MoonwellClient,
  type MorphoMarket as SDKMorphoMarket,
  type MorphoVault as SDKMorphoVault,
  type MorphoVaultSnapshot as SDKMorphoVaultSnapshot,
  type MorphoMarketUserPosition as SDKMorphoMarketUserPosition,
  type MorphoVaultUserPosition as SDKMorphoVaultUserPosition,
  type UserBalance as SDKUserBalance,
  type MarketSnapshot as SDKMarketSnapshot
} from "@moonwell-fi/moonwell-sdk";

// Extended client interface to include all documented methods
type ExtendedMoonwellClient = MoonwellClient & {
  getMorphoMarkets: (params?: { network?: string; chainId?: number; includeRewards?: boolean }) => Promise<SDKMorphoMarket[]>;
  getMorphoMarketUserPosition: (params: { network?: string; chainId?: number; marketId: string; userAddress: string }) => Promise<SDKMorphoMarketUserPosition | undefined>;
  getMorphoUserBalances: (params: { network?: string; chainId?: number; userAddress: string }) => Promise<SDKUserBalance[]>;
  getMorphoUserRewards: (params: { network?: string; chainId?: number; userAddress: string }) => Promise<any>;
  getMorphoVaults: (params?: { network?: string; chainId?: number; includeRewards?: boolean }) => Promise<SDKMorphoVault[]>;
  getUserBalances: (params: { network?: string; chainId?: number; userAddress: string }) => Promise<SDKUserBalance[]>;
  getMarketSnapshots: (params: { type: "core" | "isolated"; network?: string; chainId?: number; marketId: string }) => Promise<SDKMarketSnapshot[]>;
};
import {
  MoonwellConfig,
  MoonwellServiceState,
  UserPosition,
  MarketData,
  SupplyParams,
  SupplyResult,
  BorrowParams,
  BorrowResult,
  RepayParams,
  RepayResult,
  WithdrawParams,
  WithdrawResult,
  AssetPosition,
  MoonwellErrorCode,
  // Use our custom types for compatibility
  MorphoUserPosition,
  MorphoUserRewards,
  MorphoVaultSummary,
  MorphoVaultPortfolio,
  MorphoVaultFilters,
  EnhancedUserBalance,
  BalanceBreakdown,
  ComprehensiveUserData,
  PortfolioSummary,
  UserBalanceParams,
  UserRewards,
  MarketSnapshot,
  MarketSnapshotSummary,
  SnapshotFilters,
} from "../types";
import {
  validateAmount,
  validateAsset,
  validateHealthFactor,
  validateBorrowCapacity,
  validateLiquidity,
  SUPPORTED_ASSETS,
  calculateHealthFactor,
  formatAmount,
  parseAmount,
  createError,
} from "../utils/validation";
import { handleError } from "../utils/error-handler";

// Default RPC URLs
const DEFAULT_RPC_URLS = {
  base: "https://mainnet.base.org",
  "base-sepolia": "https://sepolia.base.org",
};

// Moonwell protocol addresses with checksum addresses
const MOONWELL_ADDRESSES = {
  base: {
    comptroller: ethers.getAddress("0xfBb21d0380beE3312B33c4353c8936a0F13EF26C"),
    oracle: "0xEc942bE8A8114bFD0396A5052c36027f2cA6C9d0",
    multiRewardDistributor: ethers.getAddress("0xe9005b078701e2A0948D2EaC43010D35870Ad9d2"),
    morphoViews: ethers.getAddress("0xc72fCC9793a10b9c363EeaAcaAbe422E0672B42B"),
    morphoBundler: ethers.getAddress("0xb98c948CFA24072e58935BC004a8A7b376AE746A"),
    markets: {
      USDC: ethers.getAddress("0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22"),
      WETH: ethers.getAddress("0x628ff693426583D9a7FB391E54366292F509D457"),
      cbETH: ethers.getAddress("0x3bf93770f2d4a794c3d9EBEfBAeBAE2a8f09A5E5"),
      DAI: ethers.getAddress("0x73b06D8d18De422E269645eaCe15400DE7462417"),
      USDbC: ethers.getAddress("0x703843C3379b52F9FF486c9f5892218d2a065cC8"),
      wstETH: ethers.getAddress("0x627Fe393Bc6EdDA28e99AE648fD6fF362514304b"),
      rETH: ethers.getAddress("0xcb1dacd30638ae38f2b94ea64f066045b7d45f44"),
    },
    morphoVaults: {
      mwUSDC: ethers.getAddress("0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca"),
      mwETH: ethers.getAddress("0xa0E430870c4604CcfC7B38Ca7845B1FF653D0ff1"),
      mwEURC: ethers.getAddress("0xf24608E0CCb972b0b0f4A6446a0BBf58c701a026"),
      mwcbBTC: ethers.getAddress("0x543257ef2161176d7c8cd90ba65c2d4caef5a796"),
    },
  },
  "base-sepolia": {
    // Testnet addresses - these would be the actual testnet deployment addresses
    comptroller: ethers.getAddress("0x0000000000000000000000000000000000000000"),
    oracle: ethers.getAddress("0x0000000000000000000000000000000000000000"),
    multiRewardDistributor: ethers.getAddress("0x0000000000000000000000000000000000000000"),
    morphoViews: ethers.getAddress("0x0000000000000000000000000000000000000000"),
    morphoBundler: ethers.getAddress("0x0000000000000000000000000000000000000000"),
    markets: {
      USDC: ethers.getAddress("0x0000000000000000000000000000000000000000"),
      WETH: ethers.getAddress("0x0000000000000000000000000000000000000000"),
    },
    morphoVaults: {},
  },
};

// Minimal ABI for Moonwell markets (mToken)
const MTOKEN_ABI = [
  "function mint(uint256 mintAmount) returns (uint256)",
  "function redeem(uint256 redeemTokens) returns (uint256)",
  "function redeemUnderlying(uint256 redeemAmount) returns (uint256)",
  "function borrow(uint256 borrowAmount) returns (uint256)",
  "function repayBorrow(uint256 repayAmount) returns (uint256)",
  "function repayBorrowBehalf(address borrower, uint256 repayAmount) returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function borrowBalanceStored(address account) view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
  "function supplyRatePerBlock() view returns (uint256)",
  "function borrowRatePerBlock() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function totalBorrows() view returns (uint256)",
  "function getCash() view returns (uint256)",
  "function underlying() view returns (address)",
];

// Comptroller ABI
const COMPTROLLER_ABI = [
  "function enterMarkets(address[] calldata mTokens) returns (uint256[] memory)",
  "function exitMarket(address mTokenAddress) returns (uint256)",
  "function getAccountLiquidity(address account) view returns (uint256, uint256, uint256)",
  "function markets(address mTokenAddress) view returns (bool, uint256, bool)",
  "function checkMembership(address account, address mToken) view returns (bool)",
];

// Price Oracle ABI
const ORACLE_ABI = [
  "function getUnderlyingPrice(address mToken) view returns (uint256)",
];

// Multi-Reward Distributor ABI
const MULTI_REWARD_DISTRIBUTOR_ABI = [
  "function claimAllRewards(address user) external returns (uint256[] memory)",
  "function claimReward(address user, address mToken) external returns (uint256)",
  "function getOutstandingRewardsForUser(address user) view returns (address[] memory, uint256[] memory)",
  "function getOutstandingRewardsForUserAndMarket(address user, address mToken) view returns (address[] memory, uint256[] memory)",
];

export class MoonwellService extends Service {
  static serviceType = "moonwell";
  capabilityDescription =
    "Provides integration with Moonwell Protocol for DeFi lending and borrowing operations on Base L2";

  private state: MoonwellServiceState = {
    isInitialized: false,
    network: "base",
  };

  private moonwellConfig: MoonwellConfig;
  private provider?: ethers.Provider;
  private signer?: ethers.Signer;
  private comptroller?: ethers.Contract;
  private oracle?: ethers.Contract;
  private multiRewardDistributor?: ethers.Contract;
  private markets: Map<string, ethers.Contract> = new Map();
  private moonwellClient?: ExtendedMoonwellClient;

  constructor(protected runtime: IAgentRuntime) {
    super(runtime);

    const network = (runtime.getSetting("MOONWELL_NETWORK") as "base" | "base-sepolia") || "base";
    const rpcUrl = runtime.getSetting("BASE_RPC_URL") || DEFAULT_RPC_URLS.base;

    this.moonwellConfig = {
      network,
      rpcUrl,
      moonwellApiKey: runtime.getSetting("MOONWELL_API_KEY"),
      healthFactorThreshold:
        Number(runtime.getSetting("HEALTH_FACTOR_ALERT")) || 1.5,
      retryAttempts: 3,
      monitoringInterval: 60000, // 1 minute
    };
  }

  static async start(runtime: IAgentRuntime): Promise<MoonwellService> {
    logger.info("Starting Moonwell service...");
    const service = new MoonwellService(runtime);
    await service.initialize();
    return service;
  }

  static async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info("Stopping Moonwell service...");
    const service = runtime.getService(
      MoonwellService.serviceType,
    ) as MoonwellService;
    if (service) {
      await service.stop();
    }
  }

  async initialize(): Promise<void> {
    try {
      logger.info("Initializing Moonwell service...");

      // Initialize provider
      this.provider = new ethers.JsonRpcProvider(this.moonwellConfig.rpcUrl);

      // Initialize signer if private key is available
      const privateKey = this.runtime.getSetting("WALLET_PRIVATE_KEY");
      if (privateKey) {
        this.signer = new ethers.Wallet(privateKey, this.provider);
        this.state.userAddress = await this.signer.getAddress();
        logger.info(`Wallet connected: ${this.state.userAddress}`);
      }

      // Initialize contracts
      const addresses = MOONWELL_ADDRESSES[this.moonwellConfig.network];
      this.comptroller = new ethers.Contract(
        addresses.comptroller,
        COMPTROLLER_ABI,
        this.signer || this.provider,
      );

      this.oracle = new ethers.Contract(
        addresses.oracle,
        ORACLE_ABI,
        this.provider,
      );

      this.multiRewardDistributor = new ethers.Contract(
        addresses.multiRewardDistributor,
        MULTI_REWARD_DISTRIBUTOR_ABI,
        this.signer || this.provider,
      );

      // Initialize market contracts
      for (const [asset, address] of Object.entries(addresses.markets)) {
        this.markets.set(
          asset,
          new ethers.Contract(
            address as string,
            MTOKEN_ABI,
            this.signer || this.provider,
          ),
        );
      }

      // Initialize Moonwell SDK client
      try {
        this.moonwellClient = (await createMoonwellClient({
          networks: {
            [this.moonwellConfig.network]: {
              rpcUrls: [this.moonwellConfig.rpcUrl],
            },
          },
        })) as ExtendedMoonwellClient;
        logger.info("Moonwell SDK client initialized");
      } catch (error) {
        logger.warn("Failed to initialize Moonwell SDK client:", error);
        // Continue without SDK - fallback to direct contract calls
      }

      this.state.isInitialized = true;
      this.state.network = this.moonwellConfig.network;

      // Start position monitoring if user is connected
      if (this.state.userAddress) {
        this.startPositionMonitoring();
      }

      logger.info("Moonwell service initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize Moonwell service:", error);
      throw handleError(error);
    }
  }

  private ensureInitialized(): void {
    if (!this.state.isInitialized) {
      throw createError(
        MoonwellErrorCode.WALLET_NOT_CONNECTED,
        "Moonwell service not initialized",
      );
    }
  }

  private ensureWallet(): void {
    if (!this.signer || !this.state.userAddress) {
      throw createError(
        MoonwellErrorCode.WALLET_NOT_CONNECTED,
        "Wallet not connected. Please provide WALLET_PRIVATE_KEY",
      );
    }
  }

  async supply(params: SupplyParams): Promise<SupplyResult> {
    try {
      this.ensureInitialized();
      this.ensureWallet();

      const asset = validateAsset(params.asset);
      const amount = validateAmount(params.amount);
      const assetInfo =
        SUPPORTED_ASSETS[asset as keyof typeof SUPPORTED_ASSETS];
      const market = this.markets.get(asset);

      if (!market) {
        throw createError(
          MoonwellErrorCode.UNSUPPORTED_ASSET,
          `Market not found for ${asset}`,
        );
      }

      // Get current position to check health after supply
      const positionBefore = await this.getUserPosition();

      // Parse amount to proper decimals
      const amountInWei = parseAmount(amount.toString(), assetInfo.decimals);

      // If not native ETH, need to approve
      if (asset !== "ETH") {
        const tokenContract = new ethers.Contract(
          assetInfo.address,
          ["function approve(address spender, uint256 amount) returns (bool)"],
          this.signer,
        );

        const approveTx = await tokenContract.approve(
          await market.getAddress(),
          amountInWei.toString(),
        );
        await approveTx.wait();
        logger.info(`Approved ${asset} for supply`);
      }

      // Execute supply transaction
      const tx = await market.mint(amountInWei.toString(), {
        value: asset === "ETH" ? amountInWei.toString() : 0,
      });

      const receipt = await tx.wait();
      logger.info(`Supply transaction confirmed: ${receipt.hash}`);

      // Enable as collateral if requested
      if (params.enableAsCollateral) {
        const enterMarketsTx = await this.comptroller!.enterMarkets([
          await market.getAddress(),
        ]);
        await enterMarketsTx.wait();
        logger.info(`Enabled ${asset} as collateral`);
      }

      // Get updated position
      const positionAfter = await this.getUserPosition();
      const marketData = await this.getMarketData(asset);

      // Get mToken balance
      const mTokenBalance = await market.balanceOf(this.state.userAddress);

      return {
        transactionHash: receipt.hash,
        mTokenBalance: new BigNumber(mTokenBalance.toString()),
        currentAPY: marketData[0].supplyAPY,
        collateralEnabled: params.enableAsCollateral,
      };
    } catch (error) {
      throw handleError(error);
    }
  }

  async borrow(params: BorrowParams): Promise<BorrowResult> {
    try {
      this.ensureInitialized();
      this.ensureWallet();

      const asset = validateAsset(params.asset);
      const amount = validateAmount(params.amount);
      const assetInfo =
        SUPPORTED_ASSETS[asset as keyof typeof SUPPORTED_ASSETS];
      const market = this.markets.get(asset);

      if (!market) {
        throw createError(
          MoonwellErrorCode.UNSUPPORTED_ASSET,
          `Market not found for ${asset}`,
        );
      }

      // Get current position and check borrowing capacity
      const position = await this.getUserPosition();
      validateBorrowCapacity(amount, position.availableToBorrow);

      // Check market liquidity
      const cash = await market.getCash();
      const cashBN = new BigNumber(cash.toString());
      validateLiquidity(amount, cashBN);

      // Parse amount to proper decimals
      const amountInWei = parseAmount(amount.toString(), assetInfo.decimals);

      // Execute borrow transaction
      const tx = await market.borrow(amountInWei.toString());
      const receipt = await tx.wait();
      logger.info(`Borrow transaction confirmed: ${receipt.hash}`);

      // Get updated position
      const positionAfter = await this.getUserPosition();
      const marketData = await this.getMarketData(asset);

      // Validate health factor after borrow
      validateHealthFactor(
        positionAfter.healthFactor,
        this.moonwellConfig.healthFactorThreshold,
      );

      return {
        transactionHash: receipt.hash,
        borrowedAmount: amount,
        interestRate: marketData[0].borrowAPY,
        healthFactor: positionAfter.healthFactor,
      };
    } catch (error) {
      throw handleError(error);
    }
  }

  async repay(params: RepayParams): Promise<RepayResult> {
    try {
      this.ensureInitialized();
      this.ensureWallet();

      const asset = validateAsset(params.asset);
      const assetInfo =
        SUPPORTED_ASSETS[asset as keyof typeof SUPPORTED_ASSETS];
      const market = this.markets.get(asset);

      if (!market) {
        throw createError(
          MoonwellErrorCode.UNSUPPORTED_ASSET,
          `Market not found for ${asset}`,
        );
      }

      // Get current borrow balance
      const borrowBalance = await market.borrowBalanceStored(
        this.state.userAddress,
      );
      const borrowBalanceBN = new BigNumber(borrowBalance.toString());

      // Determine repay amount
      let repayAmount: BigNumber;
      if (params.isMax) {
        repayAmount = borrowBalanceBN;
      } else {
        const amount = validateAmount(params.amount);
        repayAmount = parseAmount(amount.toString(), assetInfo.decimals);

        // Cap at borrow balance
        if (repayAmount.gt(borrowBalanceBN)) {
          repayAmount = borrowBalanceBN;
        }
      }

      // If not native ETH, need to approve
      if (asset !== "ETH") {
        const tokenContract = new ethers.Contract(
          assetInfo.address,
          ["function approve(address spender, uint256 amount) returns (bool)"],
          this.signer,
        );

        const approveTx = await tokenContract.approve(
          await market.getAddress(),
          repayAmount.toString(),
        );
        await approveTx.wait();
        logger.info(`Approved ${asset} for repayment`);
      }

      // Execute repay transaction
      const tx = await market.repayBorrow(repayAmount.toString(), {
        value: asset === "ETH" ? repayAmount.toString() : 0,
      });

      const receipt = await tx.wait();
      logger.info(`Repay transaction confirmed: ${receipt.hash}`);

      // Get updated position
      const positionAfter = await this.getUserPosition();
      const remainingBorrow = await market.borrowBalanceStored(
        this.state.userAddress,
      );

      return {
        transactionHash: receipt.hash,
        repaidAmount: new BigNumber(repayAmount.toString()),
        remainingDebt: new BigNumber(remainingBorrow.toString()),
        healthFactor: positionAfter.healthFactor,
      };
    } catch (error) {
      throw handleError(error);
    }
  }

  async withdraw(params: WithdrawParams): Promise<WithdrawResult> {
    try {
      this.ensureInitialized();
      this.ensureWallet();

      const asset = validateAsset(params.asset);
      const assetInfo =
        SUPPORTED_ASSETS[asset as keyof typeof SUPPORTED_ASSETS];
      const market = this.markets.get(asset);

      if (!market) {
        throw createError(
          MoonwellErrorCode.UNSUPPORTED_ASSET,
          `Market not found for ${asset}`,
        );
      }

      // Get current position to check health after withdrawal
      const positionBefore = await this.getUserPosition();

      // Get mToken balance and exchange rate
      const mTokenBalance = await market.balanceOf(this.state.userAddress);
      const exchangeRate = await market.exchangeRateStored();

      // Calculate underlying balance
      const underlyingBalance = new BigNumber(mTokenBalance.toString())
        .multipliedBy(new BigNumber(exchangeRate.toString()))
        .dividedBy(new BigNumber(10).pow(18));

      // Determine withdraw amount
      let withdrawAmount: BigNumber;
      let redeemTokens: BigNumber;

      if (params.isMax) {
        withdrawAmount = underlyingBalance;
        redeemTokens = new BigNumber(mTokenBalance.toString());
      } else {
        const amount = validateAmount(params.amount);
        withdrawAmount = parseAmount(amount.toString(), assetInfo.decimals);

        // Calculate mTokens to redeem
        redeemTokens = withdrawAmount
          .multipliedBy(new BigNumber(10).pow(18))
          .dividedBy(new BigNumber(exchangeRate.toString()));
      }

      // Simulate withdrawal to check health factor
      // This is a simplified check - in production, use a more accurate simulation
      const simulatedCollateral =
        positionBefore.totalSupplied.minus(withdrawAmount);
      const simulatedHealthFactor = calculateHealthFactor(
        simulatedCollateral,
        positionBefore.totalBorrowed,
        positionBefore.liquidationThreshold,
      );

      validateHealthFactor(
        simulatedHealthFactor,
        this.moonwellConfig.healthFactorThreshold,
      );

      // Execute withdrawal transaction
      const tx = params.isMax
        ? await market.redeem(redeemTokens.toString())
        : await market.redeemUnderlying(withdrawAmount.toString());

      const receipt = await tx.wait();
      logger.info(`Withdraw transaction confirmed: ${receipt.hash}`);

      // Get updated position
      const positionAfter = await this.getUserPosition();
      const remainingBalance = await market.balanceOf(this.state.userAddress);

      return {
        transactionHash: receipt.hash,
        withdrawnAmount: withdrawAmount,
        remainingSupply: new BigNumber(remainingBalance.toString()),
        healthFactor: positionAfter.healthFactor,
      };
    } catch (error) {
      throw handleError(error);
    }
  }

  async getUserPosition(): Promise<UserPosition> {
    try {
      this.ensureInitialized();
      this.ensureWallet();

      const supplies: AssetPosition[] = [];
      const borrows: AssetPosition[] = [];
      let totalSuppliedUSD = new BigNumber(0);
      let totalBorrowedUSD = new BigNumber(0);

      // Get account liquidity from comptroller
      const [error, collateral, shortfall] =
        await this.comptroller!.getAccountLiquidity(this.state.userAddress);

      if (error.toString() !== "0") {
        throw createError(
          MoonwellErrorCode.RPC_ERROR,
          "Failed to get account liquidity",
        );
      }

      // Iterate through all markets
      for (const [asset, market] of this.markets.entries()) {
        const marketAddress = await market.getAddress();

        // Get mToken balance
        const mTokenBalance = await market.balanceOf(this.state.userAddress);
        const exchangeRate = await market.exchangeRateStored();
        const underlyingPrice =
          await this.oracle!.getUnderlyingPrice(marketAddress);

        // Calculate underlying balance
        const underlyingBalance = new BigNumber(mTokenBalance.toString())
          .multipliedBy(new BigNumber(exchangeRate.toString()))
          .dividedBy(new BigNumber(10).pow(18));

        if (underlyingBalance.gt(0)) {
          const balanceInUSD = underlyingBalance
            .multipliedBy(new BigNumber(underlyingPrice.toString()))
            .dividedBy(new BigNumber(10).pow(36)); // Price has 18 decimals

          const supplyRate = await market.supplyRatePerBlock();
          const blocksPerYear = 2628000; // Approximate blocks per year on Base
          const apy = new BigNumber(supplyRate.toString())
            .multipliedBy(blocksPerYear)
            .dividedBy(new BigNumber(10).pow(18))
            .toNumber();

          // Check if enabled as collateral
          const isCollateral = await this.comptroller!.checkMembership(
            this.state.userAddress,
            marketAddress,
          );

          supplies.push({
            asset,
            symbol: asset,
            balance: underlyingBalance,
            balanceInUSD,
            apy,
            isCollateral,
          });

          if (isCollateral) {
            totalSuppliedUSD = totalSuppliedUSD.plus(balanceInUSD);
          }
        }

        // Get borrow balance
        const borrowBalance = await market.borrowBalanceStored(
          this.state.userAddress,
        );

        if (new BigNumber(borrowBalance.toString()).gt(0)) {
          const borrowBalanceBN = new BigNumber(borrowBalance.toString());
          const balanceInUSD = borrowBalanceBN
            .multipliedBy(new BigNumber(underlyingPrice.toString()))
            .dividedBy(new BigNumber(10).pow(36));

          const borrowRate = await market.borrowRatePerBlock();
          const blocksPerYear = 2628000;
          const apy = new BigNumber(borrowRate.toString())
            .multipliedBy(blocksPerYear)
            .dividedBy(new BigNumber(10).pow(18))
            .toNumber();

          borrows.push({
            asset,
            symbol: asset,
            balance: borrowBalanceBN,
            balanceInUSD,
            apy,
          });

          totalBorrowedUSD = totalBorrowedUSD.plus(balanceInUSD);
        }
      }

      // Calculate health factor
      const healthFactor = totalBorrowedUSD.isZero()
        ? 999
        : calculateHealthFactor(totalSuppliedUSD, totalBorrowedUSD, 0.8); // Default 80% LTV

      // Calculate available to borrow
      const availableToBorrow = new BigNumber(collateral.toString()).dividedBy(
        new BigNumber(10).pow(18),
      );

      const position: UserPosition = {
        totalSupplied: totalSuppliedUSD,
        totalBorrowed: totalBorrowedUSD,
        healthFactor,
        liquidationThreshold: 0.8,
        availableToBorrow,
        supplies,
        borrows,
      };

      // Update cache
      this.state.positionCache = position;
      this.state.lastUpdate = Date.now();

      return position;
    } catch (error) {
      throw handleError(error);
    }
  }

  async getMarketData(asset?: string): Promise<MarketData[]> {
    try {
      this.ensureInitialized();

      const marketDataList: MarketData[] = [];
      const assetsToCheck = asset
        ? [validateAsset(asset)]
        : Object.keys(SUPPORTED_ASSETS);

      for (const assetSymbol of assetsToCheck) {
        const market = this.markets.get(assetSymbol);
        if (!market) continue;

        const marketAddress = await market.getAddress();
        const assetInfo =
          SUPPORTED_ASSETS[asset as keyof typeof SUPPORTED_ASSETS];

        // Get market data
        const [
          supplyRate,
          borrowRate,
          totalSupply,
          totalBorrows,
          cash,
          exchangeRate,
          underlyingPrice,
        ] = await Promise.all([
          market.supplyRatePerBlock(),
          market.borrowRatePerBlock(),
          market.totalSupply(),
          market.totalBorrows(),
          market.getCash(),
          market.exchangeRateStored(),
          this.oracle!.getUnderlyingPrice(marketAddress),
        ]);

        // Get collateral factor from comptroller
        const marketInfo = await this.comptroller!.markets(marketAddress);
        const collateralFactor = new BigNumber(
          marketInfo[1].toString(),
        ).dividedBy(new BigNumber(10).pow(18));

        // Calculate APYs
        const blocksPerYear = 2628000;
        const supplyAPY = new BigNumber(supplyRate.toString())
          .multipliedBy(blocksPerYear)
          .dividedBy(new BigNumber(10).pow(18))
          .toNumber();

        const borrowAPY = new BigNumber(borrowRate.toString())
          .multipliedBy(blocksPerYear)
          .dividedBy(new BigNumber(10).pow(18))
          .toNumber();

        // Calculate total supply in underlying
        const totalSupplyUnderlying = new BigNumber(totalSupply.toString())
          .multipliedBy(new BigNumber(exchangeRate.toString()))
          .dividedBy(new BigNumber(10).pow(18));

        // Calculate utilization rate
        const totalLiquidity = new BigNumber(cash.toString()).plus(
          new BigNumber(totalBorrows.toString()),
        );
        const utilizationRate = totalLiquidity.isZero()
          ? 0
          : new BigNumber(totalBorrows.toString())
              .dividedBy(totalLiquidity)
              .toNumber();

        // Price in USD (price has 18 decimals)
        const priceInUSD = new BigNumber(underlyingPrice.toString())
          .dividedBy(new BigNumber(10).pow(18))
          .toNumber();

        marketDataList.push({
          asset: assetSymbol,
          symbol: assetSymbol,
          supplyAPY,
          borrowAPY,
          totalSupply: totalSupplyUnderlying,
          totalBorrow: new BigNumber(totalBorrows.toString()),
          utilizationRate,
          liquidityAvailable: new BigNumber(cash.toString()),
          collateralFactor: collateralFactor.toNumber(),
          priceInUSD,
        });
      }

      // Update cache
      this.state.marketDataCache = marketDataList;
      this.state.lastUpdate = Date.now();

      return marketDataList;
    } catch (error) {
      throw handleError(error);
    }
  }

  getCachedPosition(): UserPosition | null {
    // Return cached position if fresh (less than 30 seconds old)
    if (
      this.state.positionCache &&
      this.state.lastUpdate &&
      Date.now() - this.state.lastUpdate < 30000
    ) {
      return this.state.positionCache;
    }
    return null;
  }

  async updatePositionCache(): Promise<void> {
    if (this.state.userAddress) {
      await this.getUserPosition();
    }
  }

  private startPositionMonitoring(): void {
    // Monitor position health every minute
    setInterval(async () => {
      try {
        const position = await this.getUserPosition();

        if (position.healthFactor < this.moonwellConfig.healthFactorThreshold) {
          logger.warn(
            `Health factor alert: ${position.healthFactor.toFixed(2)} is below threshold ${
              this.moonwellConfig.healthFactorThreshold
            }`,
          );

          // In a real implementation, this would trigger notifications
          // For now, just log the warning
        }
      } catch (error) {
        logger.error("Error monitoring position:", error);
      }
    }, this.moonwellConfig.monitoringInterval);
  }

  async getUserRewards(): Promise<{
    rewards: Array<{
      token: string;
      symbol: string;
      amount: BigNumber;
      valueInUSD: BigNumber;
    }>;
    totalValueInUSD: BigNumber;
  }> {
    try {
      this.ensureInitialized();
      this.ensureWallet();

      if (!this.multiRewardDistributor) {
        throw createError(
          MoonwellErrorCode.RPC_ERROR,
          "Multi-Reward Distributor not initialized",
        );
      }

      // Get outstanding rewards for user
      const [rewardTokens, rewardAmounts] =
        await this.multiRewardDistributor.getOutstandingRewardsForUser(
          this.state.userAddress,
        );

      const rewards: Array<{
        token: string;
        symbol: string;
        amount: BigNumber;
        valueInUSD: BigNumber;
      }> = [];

      let totalValueInUSD = new BigNumber(0);

      // Process each reward token
      for (let i = 0; i < rewardTokens.length; i++) {
        const tokenAddress = rewardTokens[i];
        const amount = new BigNumber(rewardAmounts[i].toString());

        if (amount.gt(0)) {
          // Get token symbol (simplified - in production, you'd fetch from token contract)
          let symbol = "UNKNOWN";
          if (tokenAddress.toLowerCase() === "0xa88594d404727625a9437c3f886c7643872296ae".toLowerCase()) {
            symbol = "WELL";
          }

          // For value calculation, we'd need price oracle for reward tokens
          // For now, we'll use a placeholder
          const valueInUSD = new BigNumber(0); // TODO: Implement price fetching for reward tokens

          rewards.push({
            token: tokenAddress,
            symbol,
            amount,
            valueInUSD,
          });

          totalValueInUSD = totalValueInUSD.plus(valueInUSD);
        }
      }

      return {
        rewards,
        totalValueInUSD,
      };
    } catch (error) {
      throw handleError(error);
    }
  }

  async claimAllRewards(): Promise<{
    transactionHash: string;
    rewardsClaimed: Array<{
      token: string;
      amount: BigNumber;
    }>;
  }> {
    try {
      this.ensureInitialized();
      this.ensureWallet();

      if (!this.multiRewardDistributor) {
        throw createError(
          MoonwellErrorCode.RPC_ERROR,
          "Multi-Reward Distributor not initialized",
        );
      }

      // Get rewards before claiming
      const rewardsBefore = await this.getUserRewards();

      // Claim all rewards
      const tx = await this.multiRewardDistributor.claimAllRewards(
        this.state.userAddress,
      );
      const receipt = await tx.wait();

      logger.info(`Claimed all rewards: ${receipt.hash}`);

      return {
        transactionHash: receipt.hash,
        rewardsClaimed: rewardsBefore.rewards.map((r) => ({
          token: r.token,
          amount: r.amount,
        })),
      };
    } catch (error) {
      throw handleError(error);
    }
  }

  // Morpho Markets Methods
  async getMorphoMarkets(): Promise<SDKMorphoMarket[]> {
    try {
      this.ensureInitialized();
      
      if (!this.moonwellClient) {
        logger.warn("Moonwell client not initialized");
        return [];
      }
      
      try {
        logger.info("Fetching Morpho markets using Moonwell SDK...");
        const morphoMarkets = await this.moonwellClient.getMorphoMarkets({
          chainId: this.moonwellConfig.network === 'base' ? 8453 : 84532,
          includeRewards: true
        });
        
        logger.info(`Fetched ${morphoMarkets.length} Morpho markets from SDK`);
        return morphoMarkets;
      } catch (error) {
        logger.error("Failed to fetch Morpho markets from SDK:", error);
        return [];
      }
    } catch (error) {
      logger.error("Failed to fetch Morpho markets:", error);
      return [];
    }
  }

  async getMorphoUserPosition(marketId: string): Promise<SDKMorphoMarketUserPosition | null> {
    try {
      this.ensureInitialized();
      this.ensureWallet();
      
      if (!this.moonwellClient) {
        logger.warn("Moonwell client not initialized");
        return null;
      }
      
      try {
        logger.info(`Fetching Morpho user position for market ${marketId}...`);
        const userPosition = await this.moonwellClient.getMorphoMarketUserPosition({
          chainId: this.moonwellConfig.network === 'base' ? 8453 : 84532,
          marketId,
          userAddress: this.state.userAddress!
        });

        if (!userPosition) {
          logger.debug(`No position found for market ${marketId}`);
          return null;
        }

        logger.info(`Fetched Morpho position for market ${marketId}`);
        return userPosition;
      } catch (error) {
        logger.error(`Failed to fetch Morpho user position for market ${marketId}:`, error);
        return null;
      }
    } catch (error) {
      logger.error(`Failed to fetch Morpho user position for market ${marketId}:`, error);
      return null;
    }
  }

  async getMorphoUserBalances(): Promise<SDKUserBalance[]> {
    try {
      this.ensureInitialized();
      this.ensureWallet();
      
      if (!this.moonwellClient) {
        logger.warn("Moonwell client not initialized");
        return [];
      }
      
      try {
        logger.info("Fetching Morpho user balances using Moonwell SDK...");
        const userBalances = await this.moonwellClient.getMorphoUserBalances({
          chainId: this.moonwellConfig.network === 'base' ? 8453 : 84532,
          userAddress: this.state.userAddress!
        });

        logger.info(`Fetched ${userBalances.length} Morpho user balances`);
        return userBalances;
      } catch (error) {
        logger.error("Failed to fetch Morpho user balances from SDK:", error);
        return [];
      }
    } catch (error) {
      logger.error("Failed to fetch Morpho user balances:", error);
      return [];
    }
  }

  async getMorphoUserRewards(): Promise<MorphoUserRewards> {
    try {
      this.ensureInitialized();
      this.ensureWallet();
      
      if (!this.moonwellClient) {
        logger.warn("Moonwell client not initialized");
        return { rewards: [], totalValueInUSD: new BigNumber(0) };
      }
      
      try {
        logger.info("Fetching Morpho user rewards using Moonwell SDK...");
        const userRewards = await this.moonwellClient.getMorphoUserRewards({
          chainId: this.moonwellConfig.network === 'base' ? 8453 : 84532,
          userAddress: this.state.userAddress!
        });

        // Transform SDK data to our interface format
        const rewards: MorphoUserRewards = {
          rewards: (userRewards.rewards || []).map((reward: any) => ({
            token: reward.token,
            symbol: reward.symbol || "UNKNOWN",
            amount: new BigNumber(reward.amount?.toString() || "0"),
            valueInUSD: new BigNumber(reward.valueInUSD?.toString() || "0"),
            marketId: reward.marketId,
          })),
          totalValueInUSD: new BigNumber(userRewards.totalValueInUSD?.toString() || "0"),
        };

        logger.info(`Fetched ${rewards.rewards.length} Morpho reward tokens`);
        return rewards;
      } catch (error) {
        logger.error("Failed to fetch Morpho user rewards from SDK:", error);
        return { rewards: [], totalValueInUSD: new BigNumber(0) };
      }
    } catch (error) {
      logger.error("Failed to fetch Morpho user rewards:", error);
      return { rewards: [], totalValueInUSD: new BigNumber(0) };
    }
  }

  // Morpho Vault Methods
  async getMorphoVaults(): Promise<SDKMorphoVault[]> {
    try {
      this.ensureInitialized();
      
      if (!this.moonwellClient) {
        logger.warn("Moonwell client not initialized");
        return [];
      }
      
      try {
        logger.info("Fetching Morpho vaults using Moonwell SDK...");
        const morphoVaults = await this.moonwellClient.getMorphoVaults({
          chainId: this.moonwellConfig.network === 'base' ? 8453 : 84532,
          includeRewards: true
        });
        
        logger.info(`Fetched ${morphoVaults.length} Morpho vaults from SDK`);
        return morphoVaults;
      } catch (error) {
        logger.error("Failed to fetch Morpho vaults from SDK:", error);
        return [];
      }
    } catch (error) {
      logger.error("Failed to fetch Morpho vaults:", error);
      return [];
    }
  }

  async getMorphoVaultUserPosition(vaultId: string): Promise<SDKMorphoVaultUserPosition | null> {
    try {
      this.ensureInitialized();
      this.ensureWallet();
      
      // Check if SDK client has the getMorphoVaultUserPosition method
      if (this.moonwellClient && 'getMorphoVaultUserPosition' in this.moonwellClient) {
        try {
          logger.info(`Fetching Morpho vault user position for vault ${vaultId}...`);
          const userPosition = await (this.moonwellClient as any).getMorphoVaultUserPosition(
            vaultId,
            this.state.userAddress!
          );

          if (!userPosition || new BigNumber(userPosition.shares?.toString() || "0").isZero()) {
            return null;
          }

          // Return SDK data directly
          return userPosition;

          logger.info(`Fetched Morpho vault position for vault ${vaultId}`);
          return userPosition;
        } catch (error) {
          logger.warn("SDK method failed, falling back to mock data:", error);
        }
      }
      
      // Fallback implementation - return mock data until SDK is fully implemented
      if (vaultId === "mw-usdc-vault-1") {
        logger.warn("Morpho vault user position integration not yet fully implemented - returning mock data");
        
        // Return null for no position - mock data removed
        return null;
      }
      
      return null; // No position in other vaults for mock data
    } catch (error) {
      logger.error(`Failed to fetch Morpho vault user position for vault ${vaultId}:`, error);
      throw handleError(error);
    }
  }

  async getMorphoVaultSnapshots(vaultId: string, timeframe: "7d" | "30d" | "90d" = "30d"): Promise<SDKMorphoVaultSnapshot[]> {
    try {
      this.ensureInitialized();
      
      // Check if SDK client has the getMorphoVaultSnapshots method
      if (this.moonwellClient && 'getMorphoVaultSnapshots' in this.moonwellClient) {
        try {
          logger.info(`Fetching Morpho vault snapshots for vault ${vaultId}...`);
          const snapshots = await (this.moonwellClient as any).getMorphoVaultSnapshots(vaultId, timeframe);
          
          // Transform SDK data to our interface format
          const vaultSnapshots: SDKMorphoVaultSnapshot[] = snapshots.map((snapshot: any) => ({
            vaultId,
            timestamp: snapshot.timestamp || Date.now(),
            totalAssets: new BigNumber(snapshot.totalAssets?.toString() || "0"),
            totalShares: new BigNumber(snapshot.totalShares?.toString() || "0"),
            sharePrice: new BigNumber(snapshot.sharePrice?.toString() || "1"),
            apy: snapshot.apy || 0,
            tvl: new BigNumber(snapshot.tvl?.toString() || "0"),
            tvlInUSD: new BigNumber(snapshot.tvlInUSD?.toString() || "0"),
            utilizationRate: snapshot.utilizationRate || 0,
            performance1d: snapshot.performance1d || 0,
            performance7d: snapshot.performance7d || 0,
            performance30d: snapshot.performance30d || 0,
            volume24h: new BigNumber(snapshot.volume24h?.toString() || "0"),
            uniqueDepositors: snapshot.uniqueDepositors || 0,
            strategyAllocations: snapshot.strategyAllocations || [],
          }));

          logger.info(`Fetched ${vaultSnapshots.length} snapshots for vault ${vaultId}`);
          return vaultSnapshots;
        } catch (error) {
          logger.warn("SDK method failed, falling back to mock data:", error);
        }
      }
      
      // Fallback implementation - return mock snapshots
      logger.warn("Morpho vault snapshots integration not yet fully implemented - returning mock data");
      
      const days = timeframe === "7d" ? 7 : timeframe === "30d" ? 30 : 90;
      const snapshots: SDKMorphoVaultSnapshot[] = [];
      const now = Date.now();
      
      // Generate daily snapshots
      for (let i = days - 1; i >= 0; i--) {
        const timestamp = now - (i * 86400000); // i days ago
        const progressFactor = (days - i) / days; // Growth over time
        
        snapshots.push({
          chainId: this.moonwellConfig.network === 'base' ? 8453 : 84532,
          vaultAddress: vaultId,
          totalSupply: 5000000 + (progressFactor * 100000),
          totalSupplyUsd: 5000000 + (progressFactor * 100000),
          totalBorrows: 0,
          totalBorrowsUsd: 0,
          totalLiquidity: 4500000 + (progressFactor * 90000),
          totalLiquidityUsd: 4500000 + (progressFactor * 90000),
          timestamp
        });
      }
      
      return snapshots;
    } catch (error) {
      logger.error(`Failed to fetch Morpho vault snapshots for vault ${vaultId}:`, error);
      throw handleError(error);
    }
  }

  async getMorphoVaultSummary(): Promise<{
    totalVaults: number;
    totalTVL: BigNumber;
    totalTVLInUSD: BigNumber; 
    averageAPY: number;
    vaults: SDKMorphoVault[];
  }> {
    try {
      const vaults = await this.getMorphoVaults();
      
      return {
        totalVaults: vaults.length,
        totalTVL: vaults.reduce((sum, vault) => sum.plus(new BigNumber(vault.totalSupply.value.toString())), new BigNumber(0)),
        totalTVLInUSD: vaults.reduce((sum, vault) => sum.plus(vault.totalSupplyUsd), new BigNumber(0)),
        averageAPY: vaults.length > 0 
          ? vaults.reduce((sum, vault) => sum + vault.totalApy, 0) / vaults.length 
          : 0,
        vaults,
      };
    } catch (error) {
      logger.error("Failed to get Morpho vault summary:", error);
      throw handleError(error);
    }
  }

  async getMorphoVaultPortfolio(): Promise<{
    userAddress: string;
    positions: SDKMorphoVaultUserPosition[];
    lastUpdated: number;
  } | null> {
    try {
      this.ensureWallet();
      
      const vaults = await this.getMorphoVaults();
      const positions: SDKMorphoVaultUserPosition[] = [];
      
      // Get user positions for all vaults - simplified implementation
      for (const vault of vaults) {
        const position = await this.getMorphoVaultUserPosition(vault.vaultKey);
        if (position) {
          positions.push(position);
        }
      }
      
      if (positions.length === 0) {
        return null;
      }
      
      return {
        userAddress: this.state.userAddress!,
        positions,
        lastUpdated: Date.now(),
      };
    } catch (error) {
      logger.error("Failed to get Morpho vault portfolio:", error);
      throw handleError(error);
    }
  }

  private applyVaultFilters(vaults: SDKMorphoVault[], filters?: MorphoVaultFilters): SDKMorphoVault[] {
    if (!filters) {
      return vaults;
    }

    if (!filters) {
      return vaults;
    }
    
    return vaults.filter(vault => {
      if (filters.asset && vault.underlyingToken.symbol.toLowerCase() !== filters.asset.toLowerCase()) {
        return false;
      }
      
      if (filters.minAPY && vault.totalApy < filters.minAPY) {
        return false;
      }
      
      if (filters.minTVL && new BigNumber(filters.minTVL).gt(vault.totalSupplyUsd)) {
        return false;
      }
      
      return true;
    });
  }

  // Enhanced Balance Methods
  async getAllUserBalances(params: UserBalanceParams = {}): Promise<BalanceBreakdown> {
    try {
      this.ensureInitialized();
      this.ensureWallet();

      const {
        includeWallet = true,
        includeCore = true,
        includeMorpho = true,
        includeVaults = true,
        minBalanceThreshold = new BigNumber(0.01) // $0.01 minimum
      } = params;

      const breakdown: BalanceBreakdown = {
        walletBalances: [],
        corePositions: [],
        morphoPositions: [],
        vaultPositions: [],
        totalBalanceInUSD: new BigNumber(0),
        totalWalletValueInUSD: new BigNumber(0),
        totalCoreValueInUSD: new BigNumber(0),
        totalMorphoValueInUSD: new BigNumber(0),
        totalVaultValueInUSD: new BigNumber(0)
      };

      // Get wallet balances
      if (includeWallet) {
        try {
          const walletBalances = await this.getWalletBalances();
          breakdown.walletBalances = walletBalances.filter(balance => 
            balance.balanceInUSD.gte(minBalanceThreshold)
          );
          breakdown.totalWalletValueInUSD = breakdown.walletBalances
            .reduce((sum, balance) => sum.plus(balance.balanceInUSD), new BigNumber(0));
        } catch (error) {
          logger.warn("Failed to fetch wallet balances:", error);
        }
      }

      // Get core Moonwell positions
      if (includeCore) {
        try {
          const corePosition = await this.getUserPosition();
          breakdown.corePositions = this.convertCorePositionsToEnhanced(corePosition);
          breakdown.totalCoreValueInUSD = breakdown.corePositions
            .reduce((sum, balance) => sum.plus(balance.balanceInUSD), new BigNumber(0));
        } catch (error) {
          logger.warn("Failed to fetch core positions:", error);
        }
      }

      // Get Morpho positions
      if (includeMorpho) {
        try {
          const morphoBalances = await this.getMorphoBalances();
          breakdown.morphoPositions = morphoBalances.filter(balance => 
            balance.balanceInUSD.gte(minBalanceThreshold)
          );
          breakdown.totalMorphoValueInUSD = breakdown.morphoPositions
            .reduce((sum, balance) => sum.plus(balance.balanceInUSD), new BigNumber(0));
        } catch (error) {
          logger.warn("Failed to fetch Morpho positions:", error);
        }
      }

      // Get vault positions
      if (includeVaults) {
        try {
          const vaultBalances = await this.getVaultBalances();
          breakdown.vaultPositions = vaultBalances.filter(balance => 
            balance.balanceInUSD.gte(minBalanceThreshold)
          );
          breakdown.totalVaultValueInUSD = breakdown.vaultPositions
            .reduce((sum, balance) => sum.plus(balance.balanceInUSD), new BigNumber(0));
        } catch (error) {
          logger.warn("Failed to fetch vault positions:", error);
        }
      }

      // Calculate total
      breakdown.totalBalanceInUSD = breakdown.totalWalletValueInUSD
        .plus(breakdown.totalCoreValueInUSD)
        .plus(breakdown.totalMorphoValueInUSD)
        .plus(breakdown.totalVaultValueInUSD);

      return breakdown;
    } catch (error) {
      logger.error("Failed to get all user balances:", error);
      throw handleError(error);
    }
  }

  async getComprehensiveUserData(): Promise<{
    userAddress: string;
    corePosition: UserPosition;
    coreRewards: UserRewards;
    morphoMarkets: SDKMorphoMarket[];
    morphoPositions: SDKMorphoMarketUserPosition[];
    morphoRewards: MorphoUserRewards;
    morphoVaultPortfolio: { userAddress: string; positions: SDKMorphoVaultUserPosition[]; lastUpdated: number; } | null;
    balanceBreakdown: BalanceBreakdown;
    portfolioSummary: PortfolioSummary;
    lastUpdated: number;
  }> {
    try {
      this.ensureInitialized();
      this.ensureWallet();

      logger.info("Fetching comprehensive user data...");

      // Fetch all data in parallel for better performance
      const [corePosition, coreRewards, morphoMarkets, morphoRewards, morphoVaultPortfolio, balanceBreakdown] = await Promise.all([
        this.getUserPosition().catch(error => {
          logger.warn("Failed to fetch core position:", error);
          return this.getEmptyUserPosition();
        }),
        this.getUserRewards().catch(error => {
          logger.warn("Failed to fetch core rewards:", error);
          return { rewards: [], totalValueInUSD: new BigNumber(0) };
        }),
        this.getMorphoMarkets().catch(error => {
          logger.warn("Failed to fetch Morpho markets:", error);
          return [];
        }),
        this.getMorphoUserRewards().catch(error => {
          logger.warn("Failed to fetch Morpho rewards:", error);
          return { rewards: [], totalValueInUSD: new BigNumber(0) };
        }),
        this.getMorphoVaultPortfolio().catch(error => {
          logger.warn("Failed to fetch Morpho vault portfolio:", error);
          return null;
        }),
        this.getAllUserBalances().catch(error => {
          logger.warn("Failed to fetch balance breakdown:", error);
          return this.getEmptyBalanceBreakdown();
        })
      ]);

      // Get Morpho positions for all markets
      const morphoPositions: SDKMorphoMarketUserPosition[] = [];
      for (const market of morphoMarkets) {
        try {
          const position = await this.getMorphoUserPosition(market.marketId);
          if (position) {
            morphoPositions.push(position);
          }
        } catch (error) {
          logger.debug(`Failed to fetch position for market ${market.marketId}:`, error);
        }
      }

      // Calculate portfolio summary
      const portfolioSummary = this.calculatePortfolioSummary(
        corePosition,
        coreRewards,
        morphoPositions,
        morphoRewards,
        morphoVaultPortfolio,
        balanceBreakdown
      );

      const comprehensiveData = {
        userAddress: this.state.userAddress!,
        corePosition,
        coreRewards,
        morphoMarkets,
        morphoPositions,
        morphoRewards,
        morphoVaultPortfolio,
        balanceBreakdown,
        portfolioSummary,
        lastUpdated: Date.now()
      };

      logger.info("Successfully fetched comprehensive user data");
      return comprehensiveData;
    } catch (error) {
      logger.error("Failed to get comprehensive user data:", error);
      throw handleError(error);
    }
  }

  // Helper methods for enhanced balance functionality
  private async getWalletBalances(): Promise<EnhancedUserBalance[]> {
    const balances: EnhancedUserBalance[] = [];
    
    if (!this.moonwellClient) {
      logger.debug("Moonwell client not initialized, using fallback");
    } else {
      try {
        const sdkBalances = await this.moonwellClient.getUserBalances({
          chainId: this.moonwellConfig.network === 'base' ? 8453 : 84532,
          userAddress: this.state.userAddress!
        });
        return sdkBalances.map((balance: any) => ({
          tokenAddress: balance.tokenAddress,
          symbol: balance.symbol,
          balance: new BigNumber(balance.balance.toString()),
          balanceInUSD: new BigNumber(balance.balanceInUSD.toString()),
          price: balance.price || 0,
          source: "wallet" as const
        }));
      } catch (error) {
        logger.debug("SDK getUserBalances failed, using fallback", error);
      }
    }
    
    // Fallback: Check balances for supported assets
    for (const [asset, assetInfo] of Object.entries(SUPPORTED_ASSETS)) {
      try {
        let balance: BigNumber;
        if (asset === "ETH") {
          const ethBalance = await this.provider!.getBalance(this.state.userAddress!);
          balance = new BigNumber(ethBalance.toString());
        } else {
          const tokenContract = new ethers.Contract(
            assetInfo.address,
            ["function balanceOf(address) view returns (uint256)"],
            this.provider!
          );
          const tokenBalance = await tokenContract.balanceOf(this.state.userAddress!);
          balance = new BigNumber(tokenBalance.toString());
        }
        
        if (balance.gt(0)) {
          // Get market data for price
          const marketData = await this.getMarketData(asset);
          const price = marketData.length > 0 ? marketData[0].priceInUSD : 0;
          const formattedBalance = balance.dividedBy(new BigNumber(10).pow(assetInfo.decimals));
          const balanceInUSD = formattedBalance.multipliedBy(price);
          
          balances.push({
            tokenAddress: assetInfo.address,
            symbol: asset,
            balance: formattedBalance,
            balanceInUSD,
            price,
            source: "wallet"
          });
        }
      } catch (error) {
        logger.debug(`Failed to get wallet balance for ${asset}:`, error);
      }
    }
    
    return balances;
  }

  private convertCorePositionsToEnhanced(position: UserPosition): EnhancedUserBalance[] {
    const enhanced: EnhancedUserBalance[] = [];
    
    // Convert supplies
    position.supplies.forEach(supply => {
      enhanced.push({
        tokenAddress: SUPPORTED_ASSETS[supply.asset as keyof typeof SUPPORTED_ASSETS]?.address || "",
        symbol: supply.symbol,
        balance: supply.balance,
        balanceInUSD: supply.balanceInUSD,
        price: supply.balanceInUSD.dividedBy(supply.balance.gt(0) ? supply.balance : 1).toNumber(),
        source: "core",
        apy: supply.apy,
        isCollateral: supply.isCollateral
      });
    });
    
    // Convert borrows (negative balances)
    position.borrows.forEach(borrow => {
      enhanced.push({
        tokenAddress: SUPPORTED_ASSETS[borrow.asset as keyof typeof SUPPORTED_ASSETS]?.address || "",
        symbol: borrow.symbol,
        balance: borrow.balance.negated(), // Negative for borrows
        balanceInUSD: borrow.balanceInUSD.negated(),
        price: borrow.balanceInUSD.dividedBy(borrow.balance.gt(0) ? borrow.balance : 1).toNumber(),
        source: "core",
        apy: borrow.apy
      });
    });
    
    return enhanced;
  }

  private async getMorphoBalances(): Promise<EnhancedUserBalance[]> {
    const balances: EnhancedUserBalance[] = [];
    
    try {
      const userBalances = await this.getMorphoUserBalances();
      
      for (const balance of userBalances) {
        if (balance.tokenBalance && !new BigNumber(balance.tokenBalance.exponential.toString()).isZero()) {
          balances.push({
            tokenAddress: balance.token.address,
            symbol: balance.token.symbol,
            balance: new BigNumber(balance.tokenBalance.value.toString()),
            balanceInUSD: new BigNumber("0"), // USD value not available in SDK balance
            price: 0,
            source: "morpho"
          });
        }
      }
    } catch (error) {
      logger.debug("Failed to get Morpho balances:", error);
    }
    
    return balances;
  }

  private async getVaultBalances(): Promise<EnhancedUserBalance[]> {
    const balances: EnhancedUserBalance[] = [];
    
    try {
      const vaultPortfolio = await this.getMorphoVaultPortfolio();
      
      if (vaultPortfolio && vaultPortfolio.positions.length > 0) {
        const vaults = await this.getMorphoVaults();
        
        for (const position of vaultPortfolio.positions) {
          const vault = vaults.find(v => v.vaultKey === position.account);
          if (vault) {
            balances.push({
              tokenAddress: vault.underlyingToken.address,
              symbol: vault.underlyingToken.symbol,
              balance: new BigNumber(position.supplied.value.toString()),
              balanceInUSD: new BigNumber("0"), // USD value calculation needed
              price: vault.underlyingPrice || 0,
              source: "vault",
              apy: vault.totalApy
            });
          }
        }
      }
    } catch (error) {
      logger.debug("Failed to get vault balances:", error);
    }
    
    return balances;
  }

  private calculatePortfolioSummary(
    corePosition: UserPosition,
    coreRewards: UserRewards,
    morphoPositions: SDKMorphoMarketUserPosition[],
    morphoRewards: MorphoUserRewards,
    vaultPortfolio: { userAddress: string; positions: SDKMorphoVaultUserPosition[]; lastUpdated: number; } | null,
    balanceBreakdown: BalanceBreakdown
  ): PortfolioSummary {
    // Calculate totals
    const totalNetWorth = balanceBreakdown.totalBalanceInUSD;
    const totalSupplied = corePosition.totalSupplied
      .plus(morphoPositions.reduce((sum, pos) => 
        sum.plus(new BigNumber(pos.supplied.value.toString()).multipliedBy(1)), new BigNumber(0)))
      .plus(vaultPortfolio ? new BigNumber("0") : new BigNumber(0));
    
    const totalBorrowed = corePosition.totalBorrowed
      .plus(morphoPositions.reduce((sum, pos) => 
        sum.plus(new BigNumber(pos.borrowed.value.toString()).multipliedBy(1)), new BigNumber(0)));
    
    const totalRewardsValue = coreRewards.totalValueInUSD.plus(morphoRewards.totalValueInUSD);
    
    // Calculate overall health factor (weighted)
    let overallHealthFactor = corePosition.healthFactor;
    if (morphoPositions.length > 0) {
      // Morpho positions don't have health factor in SDK, use default
      const morphoAvgHealth = 999;
      const coreWeight = corePosition.totalBorrowed.dividedBy(totalBorrowed.gt(0) ? totalBorrowed : 1).toNumber();
      const morphoWeight = 1 - coreWeight;
      overallHealthFactor = (corePosition.healthFactor * coreWeight) + (morphoAvgHealth * morphoWeight);
    }
    
    // Calculate weighted APYs
    let weightedSupplyAPY = 0;
    let weightedBorrowAPY = 0;
    let totalSupplyWeight = new BigNumber(0);
    let totalBorrowWeight = new BigNumber(0);
    
    // Core positions
    corePosition.supplies.forEach(supply => {
      weightedSupplyAPY += supply.apy * supply.balanceInUSD.toNumber();
      totalSupplyWeight = totalSupplyWeight.plus(supply.balanceInUSD);
    });
    
    corePosition.borrows.forEach(borrow => {
      weightedBorrowAPY += borrow.apy * borrow.balanceInUSD.toNumber();
      totalBorrowWeight = totalBorrowWeight.plus(borrow.balanceInUSD);
    });
    
    // Normalize APYs
    if (!totalSupplyWeight.isZero()) {
      weightedSupplyAPY = weightedSupplyAPY / totalSupplyWeight.toNumber();
    }
    
    if (!totalBorrowWeight.isZero()) {
      weightedBorrowAPY = weightedBorrowAPY / totalBorrowWeight.toNumber();
    }
    
    // Risk distribution based on health factor
    const riskDistribution = {
      safe: new BigNumber(0),
      moderate: new BigNumber(0),
      high: new BigNumber(0),
      critical: new BigNumber(0)
    };
    
    if (overallHealthFactor >= 2.0) {
      riskDistribution.safe = totalNetWorth;
    } else if (overallHealthFactor >= 1.5) {
      riskDistribution.moderate = totalNetWorth;
    } else if (overallHealthFactor >= 1.2) {
      riskDistribution.high = totalNetWorth;
    } else {
      riskDistribution.critical = totalNetWorth;
    }
    
    return {
      totalNetWorth,
      totalSupplied,
      totalBorrowed,
      totalRewardsValue,
      overallHealthFactor,
      weightedAverageSupplyAPY: weightedSupplyAPY,
      weightedAverageBorrowAPY: weightedBorrowAPY,
      riskDistribution,
      marketDistribution: {
        core: balanceBreakdown.totalCoreValueInUSD,
        morpho: balanceBreakdown.totalMorphoValueInUSD,
        vaults: balanceBreakdown.totalVaultValueInUSD
      }
    };
  }

  private getEmptyUserPosition(): UserPosition {
    return {
      totalSupplied: new BigNumber(0),
      totalBorrowed: new BigNumber(0),
      healthFactor: 999,
      liquidationThreshold: 0.8,
      availableToBorrow: new BigNumber(0),
      supplies: [],
      borrows: []
    };
  }

  private getEmptyBalanceBreakdown(): BalanceBreakdown {
    return {
      walletBalances: [],
      corePositions: [],
      morphoPositions: [],
      vaultPositions: [],
      totalBalanceInUSD: new BigNumber(0),
      totalWalletValueInUSD: new BigNumber(0),
      totalCoreValueInUSD: new BigNumber(0),
      totalMorphoValueInUSD: new BigNumber(0),
      totalVaultValueInUSD: new BigNumber(0)
    };
  }


  // Market Snapshots Methods
  async getMarketSnapshots(filters: SnapshotFilters = {}): Promise<MarketSnapshot[]> {
    try {
      this.ensureInitialized();
      
      const {
        asset,
        timeframe = "7d",
        includeVolume = true,
        includeUserMetrics = false
      } = filters;
      
      if (!this.moonwellClient) {
        logger.warn("Moonwell client not initialized");
        return [];
      }
      
      try {
        logger.info("Fetching market snapshots using Moonwell SDK...");
        const sdkSnapshots = await this.moonwellClient.getMarketSnapshots({
          type: "core",
          chainId: this.moonwellConfig.network === 'base' ? 8453 : 84532,
          marketId: asset || "0x0000000000000000000000000000000000000000"
        });
        
        const snapshots: MarketSnapshot[] = sdkSnapshots.map((snapshot: any) => ({
          asset: snapshot.asset,
          symbol: snapshot.symbol,
          timestamp: snapshot.timestamp,
          supplyAPY: snapshot.supplyAPY || 0,
          borrowAPY: snapshot.borrowAPY || 0,
          totalSupply: new BigNumber(snapshot.totalSupply?.toString() || "0"),
          totalBorrow: new BigNumber(snapshot.totalBorrow?.toString() || "0"),
          utilizationRate: snapshot.utilizationRate || 0,
          liquidityAvailable: new BigNumber(snapshot.liquidityAvailable?.toString() || "0"),
          priceInUSD: snapshot.priceInUSD || 0,
          volume24h: new BigNumber(snapshot.volume24h?.toString() || "0"),
          uniqueUsers: snapshot.uniqueUsers || 0
        }));
        
        logger.info(`Fetched ${snapshots.length} market snapshots`);
        return snapshots;
      } catch (error) {
        logger.error("Failed to fetch market snapshots from SDK:", error);
        return [];
      }
      
      // Fallback implementation - generate mock historical data
      logger.warn("Market snapshots integration not yet fully implemented - returning mock data");
      
      const assetsToProcess = asset ? [asset] : Object.keys(SUPPORTED_ASSETS).slice(0, 3) as string[]; // Limit to 3 for demo
      const days = timeframe === "1d" ? 1 : timeframe === "7d" ? 7 : timeframe === "30d" ? 30 : 90;
      const snapshots: MarketSnapshot[] = [];
      const now = Date.now();
      
      for (const assetSymbol of assetsToProcess) {
        // Generate daily snapshots for each asset
        for (let i = days - 1; i >= 0; i--) {
          const timestamp = now - (i * 86400000); // i days ago
          const progressFactor = (days - i) / days; // Progress over time
          const volatilityFactor = Math.sin(progressFactor * Math.PI * 4) * 0.1; // Simulate market volatility
          
          // Base values (different for each asset)
          const baseSupplyAPY = assetSymbol === "USDC" ? 4.5 : assetSymbol === "WETH" ? 3.2 : 5.8;
          const baseBorrowAPY = assetSymbol === "USDC" ? 6.2 : assetSymbol === "WETH" ? 4.8 : 7.5;
          const basePrice = assetSymbol === "USDC" ? 1.0 : assetSymbol === "WETH" ? 3500 : 2850;
          const baseLiquidity = assetSymbol === "USDC" ? "50000000" : assetSymbol === "WETH" ? "15000" : "8000";
          
          snapshots.push({
            asset: assetSymbol as string,
            symbol: assetSymbol as string,
            timestamp,
            supplyAPY: baseSupplyAPY + volatilityFactor,
            borrowAPY: baseBorrowAPY + volatilityFactor,
            totalSupply: new BigNumber(baseLiquidity).multipliedBy(2.5 + progressFactor * 0.3),
            totalBorrow: new BigNumber(baseLiquidity).multipliedBy(1.8 + progressFactor * 0.2),
            utilizationRate: 0.65 + volatilityFactor,
            liquidityAvailable: new BigNumber(baseLiquidity).multipliedBy(1.2 + progressFactor * 0.2),
            priceInUSD: basePrice * (0.95 + progressFactor * 0.1 + volatilityFactor),
            volume24h: includeVolume ? new BigNumber(baseLiquidity).dividedBy(10).multipliedBy(0.5 + Math.random()) : new BigNumber(0),
            uniqueUsers: includeUserMetrics ? Math.floor(100 + progressFactor * 50 + Math.random() * 20) : 0
          });
        }
      }
      
      return snapshots;
    } catch (error) {
      logger.error("Failed to fetch market snapshots:", error);
      throw handleError(error);
    }
  }
  
  async getMarketSnapshotSummary(asset: string, timeframe: "7d" | "30d" | "90d" = "30d"): Promise<MarketSnapshotSummary> {
    try {
      const snapshots = await this.getMarketSnapshots({
        asset,
        timeframe,
        includeVolume: true,
        includeUserMetrics: true
      });
      
      if (snapshots.length === 0) {
        throw createError(
          MoonwellErrorCode.UNSUPPORTED_ASSET,
          `No snapshot data available for ${asset}`
        );
      }
      
      // Sort by timestamp
      snapshots.sort((a, b) => a.timestamp - b.timestamp);
      
      const latest = snapshots[snapshots.length - 1];
      const oldest = snapshots[0];
      const mid7d = snapshots[Math.max(0, snapshots.length - 7)];
      
      // Calculate price changes
      const priceChange24h = snapshots.length > 1 ? 
        ((latest.priceInUSD - snapshots[snapshots.length - 2].priceInUSD) / snapshots[snapshots.length - 2].priceInUSD) * 100 :
        0;
      const priceChange7d = ((latest.priceInUSD - mid7d.priceInUSD) / mid7d.priceInUSD) * 100;
      
      // Calculate APY averages
      const last7d = snapshots.slice(-7);
      const supplyAPYAvg7d = last7d.reduce((sum, s) => sum + s.supplyAPY, 0) / last7d.length;
      const borrowAPYAvg7d = last7d.reduce((sum, s) => sum + s.borrowAPY, 0) / last7d.length;
      const supplyAPYAvg30d = snapshots.reduce((sum, s) => sum + s.supplyAPY, 0) / snapshots.length;
      const borrowAPYAvg30d = snapshots.reduce((sum, s) => sum + s.borrowAPY, 0) / snapshots.length;
      
      // Calculate utilization averages
      const utilizationAvg7d = last7d.reduce((sum, s) => sum + s.utilizationRate, 0) / last7d.length;
      const utilizationAvg30d = snapshots.reduce((sum, s) => sum + s.utilizationRate, 0) / snapshots.length;
      
      // Calculate liquidity metrics
      const liquidityAvg7d = last7d.reduce((sum, s) => sum.plus(s.liquidityAvailable), new BigNumber(0)).dividedBy(last7d.length);
      const liquidityMin7d = last7d.reduce((min, s) => s.liquidityAvailable.lt(min) ? s.liquidityAvailable : min, last7d[0].liquidityAvailable);
      const liquidityMax7d = last7d.reduce((max, s) => s.liquidityAvailable.gt(max) ? s.liquidityAvailable : max, last7d[0].liquidityAvailable);
      
      // Calculate volume metrics
      const volumeTotal24h = latest.volume24h;
      const volumeAvg7d = last7d.reduce((sum, s) => sum.plus(s.volume24h), new BigNumber(0)).dividedBy(last7d.length);
      const volumeTotal7d = last7d.reduce((sum, s) => sum.plus(s.volume24h), new BigNumber(0));
      
      return {
        asset: asset || "UNKNOWN",
        symbol: latest.symbol || "UNKNOWN",
        currentPrice: latest.priceInUSD,
        priceChange24h,
        priceChange7d,
        apyTrend: {
          supply: {
            current: latest.supplyAPY,
            avg7d: supplyAPYAvg7d,
            avg30d: supplyAPYAvg30d
          },
          borrow: {
            current: latest.borrowAPY,
            avg7d: borrowAPYAvg7d,
            avg30d: borrowAPYAvg30d
          }
        },
        utilizationTrend: {
          current: latest.utilizationRate,
          avg7d: utilizationAvg7d,
          avg30d: utilizationAvg30d
        },
        liquidityTrend: {
          current: latest.liquidityAvailable,
          avg7d: liquidityAvg7d,
          min7d: liquidityMin7d,
          max7d: liquidityMax7d
        },
        volumeTrend: {
          total24h: volumeTotal24h,
          avg7d: volumeAvg7d,
          total7d: volumeTotal7d
        },
        snapshots
      };
    } catch (error) {
      logger.error(`Failed to get market snapshot summary for ${asset}:`, error);
      throw handleError(error);
    }
  }

  async stop(): Promise<void> {
    logger.info("Stopping Moonwell service...");
    // Clean up any resources if needed
  }
}
