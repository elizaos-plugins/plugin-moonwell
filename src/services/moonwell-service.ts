import { Service, IAgentRuntime, logger } from "@elizaos/core";
import { BigNumber } from "bignumber.js";
import { ethers } from "ethers";
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

// Moonwell protocol addresses on Base
const MOONWELL_ADDRESSES = {
  base: {
    comptroller: "0xfBb21d0380beE3312B33c4353c8936a0F13EF26C",
    oracle: "0xEC942bE8A8114bFD0396A5052c36027f2cA6C9d2",
    markets: {
      USDC: "0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22",
      WETH: "0x628ff693426583D9a7FB391E54366292F509D457",
      cbETH: "0x3c9f5385c288cE438Ed55620938A4B967c080101",
      DAI: "0x73b06D8d18De422E269645eaCe15400DE7462417",
      USDbC: "0x703843C3379b52F9FF486c9f5892218d2a065cC8",
    },
  },
  "base-sepolia": {
    comptroller: "0x0000000000000000000000000000000000000000", // To be filled with testnet addresses
    oracle: "0x0000000000000000000000000000000000000000",
    markets: {
      USDC: "0x0000000000000000000000000000000000000000",
      WETH: "0x0000000000000000000000000000000000000000",
      cbETH: "0x0000000000000000000000000000000000000000",
      DAI: "0x0000000000000000000000000000000000000000",
      USDbC: "0x0000000000000000000000000000000000000000",
    },
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
  private markets: Map<string, ethers.Contract> = new Map();

  constructor(protected runtime: IAgentRuntime) {
    super(runtime);

    this.moonwellConfig = {
      network:
        (runtime.getSetting("MOONWELL_NETWORK") as "base" | "base-sepolia") ||
        "base",
      rpcUrl: runtime.getSetting("BASE_RPC_URL") || "https://mainnet.base.org",
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

      // Initialize market contracts
      for (const [asset, address] of Object.entries(addresses.markets)) {
        this.markets.set(
          asset,
          new ethers.Contract(
            address,
            MTOKEN_ABI,
            this.signer || this.provider,
          ),
        );
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

  async stop(): Promise<void> {
    logger.info("Stopping Moonwell service...");
    // Clean up any resources if needed
  }
}
