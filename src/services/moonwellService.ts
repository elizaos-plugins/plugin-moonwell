import { Service, IAgentRuntime, ServiceType } from "@elizaos/core";
import { BigNumber } from "bignumber.js";
import { createMoonwellClient } from "@moonwell-fi/moonwell-sdk";
import type { MoonwellClient } from "@moonwell-fi/moonwell-sdk";
import { 
    MoonwellServiceState, 
    UserPosition, 
    MarketData, 
    MoonwellError,
    MoonwellErrorCode,
    AssetPosition
} from "../types";

export class MoonwellService extends Service<MoonwellServiceState> {
    private moonwellClient: MoonwellClient | null = null;
    private userAddress: string | null = null;
    private positionCache: UserPosition | null = null;
    private marketDataCache: MarketData[] | null = null;
    private lastCacheUpdate: number = 0;
    private readonly CACHE_DURATION = 30000; // 30 seconds

    static readonly serviceType: ServiceType = ServiceType.DEFI;

    constructor() {
        super();
        this.state = {
            isInitialized: false,
            network: 'base',
            retryAttempts: 3,
            healthFactorThreshold: 1.5,
            monitoringInterval: 30000
        };
    }

    async initialize(runtime: IAgentRuntime): Promise<void> {
        try {
            const rpcUrl = runtime.getSetting('BASE_RPC_URL') || 'https://base.llamarpc.com';
            const optimismRpcUrl = runtime.getSetting('OPTIMISM_RPC_URL') || 'https://optimism.llamarpc.com';
            const network = runtime.getSetting('MOONWELL_NETWORK') || 'base';
            const healthThreshold = parseFloat(runtime.getSetting('HEALTH_FACTOR_ALERT') || '1.5');

            // Initialize Moonwell SDK client
            this.moonwellClient = createMoonwellClient({
                networks: {
                    base: { 
                        rpcUrls: [rpcUrl],
                        chainId: 8453
                    },
                    optimism: { 
                        rpcUrls: [optimismRpcUrl],
                        chainId: 10
                    }
                }
            });

            this.state = {
                ...this.state,
                isInitialized: true,
                network: network as 'base' | 'base-sepolia',
                healthFactorThreshold: healthThreshold,
            };

            // Set user address if private key is available
            const privateKey = runtime.getSetting('WALLET_PRIVATE_KEY');
            if (privateKey) {
                // Extract address from private key (using ethers or viem)
                const { Wallet } = await import('ethers');
                const wallet = new Wallet(privateKey);
                this.userAddress = wallet.address;
                this.state.userAddress = wallet.address;
                this.startPositionMonitoring(runtime);
            }

            console.log('[MoonwellService] Initialized successfully with official SDK');
        } catch (error) {
            console.error('[MoonwellService] Initialization failed:', error);
            throw error;
        }
    }

    private startPositionMonitoring(runtime: IAgentRuntime): void {
        setInterval(async () => {
            try {
                if (this.userAddress) {
                    const position = await this.getUserPosition();
                    if (position && position.healthFactor < this.state.healthFactorThreshold) {
                        console.warn(`[MoonwellService] Low health factor alert: ${position.healthFactor}`);
                        // TODO: Emit event for agent to handle
                    }
                }
            } catch (error) {
                console.error('[MoonwellService] Position monitoring error:', error);
            }
        }, this.state.monitoringInterval);
    }

    async getUserPosition(): Promise<UserPosition | null> {
        if (!this.moonwellClient || !this.userAddress) return null;

        // Check cache
        if (this.positionCache && Date.now() - this.lastCacheUpdate < this.CACHE_DURATION) {
            return this.positionCache;
        }

        try {
            // Fetch user balances across all markets
            const userBalances = await this.moonwellClient.getUserBalances({
                userAddress: this.userAddress,
                chainId: this.state.network === 'base' ? 8453 : 10
            });

            // Calculate aggregated position data
            let totalSuppliedUSD = new BigNumber(0);
            let totalBorrowedUSD = new BigNumber(0);
            const supplies: AssetPosition[] = [];
            const borrows: AssetPosition[] = [];

            for (const balance of userBalances) {
                const supplyBalanceUSD = new BigNumber(balance.supplyBalanceUSD || 0);
                const borrowBalanceUSD = new BigNumber(balance.borrowBalanceUSD || 0);

                if (supplyBalanceUSD.isGreaterThan(0)) {
                    supplies.push({
                        asset: balance.underlyingAsset,
                        symbol: balance.underlyingSymbol,
                        balance: new BigNumber(balance.supplyBalance),
                        balanceInUSD: supplyBalanceUSD,
                        apy: parseFloat(balance.market.supplyApy || '0'),
                        isCollateral: balance.collateralEnabled,
                        liquidationThreshold: parseFloat(balance.market.liquidationThreshold || '0')
                    });
                    totalSuppliedUSD = totalSuppliedUSD.plus(supplyBalanceUSD);
                }

                if (borrowBalanceUSD.isGreaterThan(0)) {
                    borrows.push({
                        asset: balance.underlyingAsset,
                        symbol: balance.underlyingSymbol,
                        balance: new BigNumber(balance.borrowBalance),
                        balanceInUSD: borrowBalanceUSD,
                        apy: parseFloat(balance.market.borrowApy || '0')
                    });
                    totalBorrowedUSD = totalBorrowedUSD.plus(borrowBalanceUSD);
                }
            }

            // Calculate health factor
            const collateralValue = supplies
                .filter(s => s.isCollateral)
                .reduce((sum, supply) => {
                    const ltv = supply.liquidationThreshold || 0.8;
                    return sum.plus(supply.balanceInUSD.multipliedBy(ltv));
                }, new BigNumber(0));

            const healthFactor = totalBorrowedUSD.isZero() 
                ? 999 // Max health factor when no borrows
                : collateralValue.dividedBy(totalBorrowedUSD).toNumber();

            const position: UserPosition = {
                totalSupplied: totalSuppliedUSD,
                totalBorrowed: totalBorrowedUSD,
                healthFactor,
                liquidationThreshold: 0.8, // Average threshold
                availableToBorrow: collateralValue.minus(totalBorrowedUSD).multipliedBy(0.8),
                supplies,
                borrows
            };

            this.positionCache = position;
            this.lastCacheUpdate = Date.now();
            this.state.positionCache = position;

            return position;
        } catch (error) {
            console.error('[MoonwellService] Failed to fetch user position:', error);
            return null;
        }
    }

    async getMarketData(asset?: string): Promise<MarketData[]> {
        if (!this.moonwellClient) return [];

        // Check cache
        if (this.marketDataCache && Date.now() - this.lastCacheUpdate < this.CACHE_DURATION) {
            if (asset) {
                return this.marketDataCache.filter(m => 
                    m.asset.toLowerCase() === asset.toLowerCase() || 
                    m.symbol.toLowerCase() === asset.toLowerCase()
                );
            }
            return this.marketDataCache;
        }

        try {
            // Fetch all markets
            const markets = await this.moonwellClient.getMarkets({
                chainId: this.state.network === 'base' ? 8453 : 10
            });

            // Get latest market snapshots for detailed data
            const marketSnapshots = await this.moonwellClient.getMarketSnapshots({
                chainId: this.state.network === 'base' ? 8453 : 10,
                limit: 50
            });

            const marketDataMap = new Map<string, MarketData>();

            // Process market snapshots
            for (const snapshot of marketSnapshots) {
                const marketData: MarketData = {
                    asset: snapshot.market.underlyingAsset,
                    symbol: snapshot.market.underlyingSymbol,
                    supplyAPY: parseFloat(snapshot.supplyApy || '0'),
                    borrowAPY: parseFloat(snapshot.borrowApy || '0'),
                    totalSupply: new BigNumber(snapshot.totalSupply || 0),
                    totalBorrow: new BigNumber(snapshot.totalBorrows || 0),
                    utilizationRate: parseFloat(snapshot.utilizationRate || '0'),
                    liquidityAvailable: new BigNumber(snapshot.totalSupply || 0)
                        .minus(new BigNumber(snapshot.totalBorrows || 0)),
                    collateralFactor: parseFloat(snapshot.market.collateralFactor || '0'),
                    priceInUSD: parseFloat(snapshot.underlyingPriceUSD || '0')
                };
                
                marketDataMap.set(snapshot.market.underlyingSymbol, marketData);
            }

            const allMarketData = Array.from(marketDataMap.values());

            this.marketDataCache = allMarketData;
            this.lastCacheUpdate = Date.now();
            this.state.marketDataCache = allMarketData;

            if (asset) {
                return allMarketData.filter(m => 
                    m.asset.toLowerCase() === asset.toLowerCase() || 
                    m.symbol.toLowerCase() === asset.toLowerCase()
                );
            }
            return allMarketData;
        } catch (error) {
            console.error('[MoonwellService] Failed to fetch market data:', error);
            return [];
        }
    }

    async getGovernanceInfo(): Promise<any> {
        if (!this.moonwellClient) return null;

        try {
            // Fetch active proposals
            const proposals = await this.moonwellClient.getProposals({
                chainId: this.state.network === 'base' ? 8453 : 10,
                proposalStates: ['active', 'pending']
            });

            // Fetch user voting power if address is available
            let votingPower = null;
            if (this.userAddress) {
                const stakingInfo = await this.moonwellClient.getStakingInfo({
                    userAddress: this.userAddress,
                    chainId: this.state.network === 'base' ? 8453 : 10
                });
                votingPower = stakingInfo?.votingPower;
            }

            return {
                activeProposals: proposals,
                userVotingPower: votingPower
            };
        } catch (error) {
            console.error('[MoonwellService] Failed to fetch governance info:', error);
            return null;
        }
    }

    async getRewards(): Promise<any> {
        if (!this.moonwellClient || !this.userAddress) return null;

        try {
            const rewards = await this.moonwellClient.getUserRewards({
                userAddress: this.userAddress,
                chainId: this.state.network === 'base' ? 8453 : 10
            });

            return rewards;
        } catch (error) {
            console.error('[MoonwellService] Failed to fetch rewards:', error);
            return null;
        }
    }

    getCachedPosition(): UserPosition | null {
        return this.positionCache;
    }

    async updatePositionCache(): Promise<void> {
        await this.getUserPosition();
    }

    private createError(
        code: MoonwellErrorCode,
        message: string,
        details?: any,
        suggestions?: string[]
    ): MoonwellError {
        return {
            code,
            message,
            details,
            suggestions
        };
    }

    private handleError(error: any): MoonwellError {
        if (error.code && error.message) {
            return error as MoonwellError;
        }

        // Map common errors
        if (error.message?.includes('insufficient')) {
            return this.createError(
                MoonwellErrorCode.INSUFFICIENT_BALANCE,
                'Insufficient balance for transaction',
                error
            );
        }

        if (error.message?.includes('network') || error.message?.includes('RPC')) {
            return this.createError(
                MoonwellErrorCode.RPC_ERROR,
                'Network connection error',
                error,
                ['Check your internet connection', 'Try again in a few moments']
            );
        }

        return this.createError(
            MoonwellErrorCode.TRANSACTION_FAILED,
            'Transaction failed',
            error
        );
    }
}