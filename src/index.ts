import {
    Plugin,
    IAgentRuntime,
    logger,
} from "@elizaos/core";
import { z } from "zod";

// Import services
import { MoonwellService } from "./services/moonwellService";
import { WalletService } from "./services/walletService";

// Import actions
import {
    supplyAction,
    borrowAction,
    repayAction,
    withdrawAction,
    MarketDataAction,
    PositionAction,
    GovernanceAction,
} from "./actions";

// Import providers
import {
    PositionContextProvider,
    MarketDataProvider,
} from "./providers";

// Import evaluators
import {
    positionHealthEvaluator,
    interestRateEvaluator,
} from "./evaluators";

// Configuration schema
const configSchema = z.object({
    MOONWELL_API_KEY: z
        .string()
        .optional()
        .transform((val) => {
            if (!val) {
                logger.info("Moonwell API key not provided - using public endpoints");
            }
            return val;
        }),
    BASE_RPC_URL: z
        .string()
        .min(1, "Base RPC URL is required")
        .default("https://mainnet.base.org"),
    WALLET_PRIVATE_KEY: z
        .string()
        .optional()
        .transform((val) => {
            if (!val) {
                logger.warn("Wallet private key not provided - read-only mode");
            }
            return val;
        }),
    HEALTH_FACTOR_ALERT: z
        .string()
        .optional()
        .transform((val) => val ? parseFloat(val) : 1.5),
    MOONWELL_NETWORK: z
        .enum(["base", "base-sepolia"])
        .optional()
        .default("base"),
});

export const moonwellPlugin: Plugin = {
    name: "plugin-moonwell",
    description: "Moonwell Protocol DeFi plugin for ElizaOS - enables lending, borrowing, and yield farming on Base L2",
    
    config: {
        MOONWELL_API_KEY: process.env.MOONWELL_API_KEY,
        BASE_RPC_URL: process.env.BASE_RPC_URL,
        WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY,
        HEALTH_FACTOR_ALERT: process.env.HEALTH_FACTOR_ALERT,
        MOONWELL_NETWORK: process.env.MOONWELL_NETWORK,
    },
    
    async init(config: Record<string, string>) {
        logger.info("Initializing Moonwell plugin...");
        
        try {
            const validatedConfig = await configSchema.parseAsync(config);
            
            // Set environment variables
            for (const [key, value] of Object.entries(validatedConfig)) {
                if (value !== undefined && value !== null) {
                    process.env[key] = String(value);
                }
            }
            
            logger.info("Moonwell plugin configuration validated successfully");
        } catch (error) {
            if (error instanceof z.ZodError) {
                throw new Error(
                    `Invalid Moonwell plugin configuration: ${error.errors.map((e) => e.message).join(", ")}`
                );
            }
            throw error;
        }
    },
    
    services: [MoonwellService, WalletService],
    
    actions: [
        supplyAction,
        borrowAction,
        repayAction,
        withdrawAction,
        new MarketDataAction(),
        new PositionAction(),
        new GovernanceAction(),
    ],
    
    providers: [
        new PositionContextProvider(),
        new MarketDataProvider(),
    ],
    
    evaluators: [
        positionHealthEvaluator,
        interestRateEvaluator,
    ],
};

// Export individual components for direct access
export {
    MoonwellService,
    WalletService,
    supplyAction,
    borrowAction,
    repayAction,
    withdrawAction,
    MarketDataAction,
    PositionAction,
    GovernanceAction,
    PositionContextProvider,
    MarketDataProvider,
    positionHealthEvaluator,
    interestRateEvaluator,
};

// Export types
export * from "./types";

export default moonwellPlugin;