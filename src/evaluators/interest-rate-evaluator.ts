import {
    Evaluator,
    IAgentRuntime,
    Memory,
    State,
    logger,
} from "@elizaos/core";
import { MoonwellService } from "../services/moonwell-service";

export const interestRateEvaluator: Evaluator = {
    name: "MOONWELL_INTEREST_RATE_EVALUATOR",
    similes: [],
    description: "Evaluates interest rate decisions after lending/borrowing to improve future recommendations",
    
    validate: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State | undefined
    ): Promise<boolean> => {
        // Only evaluate after supply or borrow actions
        const relevantActions = ["MOONWELL_SUPPLY", "MOONWELL_BORROW"];
        
        return message.content.actions?.some(action => 
            relevantActions.includes(action)
        ) || false;
    },
    
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State | undefined
    ): Promise<{ success: boolean; state?: State }> => {
        try {
            logger.info("Evaluating interest rate decision");
            
            const moonwellService = runtime.getService("moonwell") as MoonwellService;
            if (!moonwellService) {
                logger.warn("Moonwell service not available for evaluation");
                return { success: false };
            }
            
            // Get current market data
            const marketData = await moonwellService.getMarketData();
            const actionData = (message.content.data || {}) as any;
            const asset = actionData.asset;
            const action = message.content.actions?.[0];
            
            if (!asset || !action) {
                return { success: false };
            }
            
            // Find market data for the asset
            const assetMarket = marketData.find(m => m.asset === asset);
            if (!assetMarket) {
                return { success: false };
            }
            
            // Get historical rates from state
            const historicalRates = state?.values?.rateHistory || {};
            const assetHistory = historicalRates[asset] || { supply: [], borrow: [] };
            
            // Record current rates
            const currentRateData = {
                timestamp: Date.now(),
                supplyAPY: assetMarket.supplyAPY,
                borrowAPY: assetMarket.borrowAPY,
                utilizationRate: assetMarket.utilizationRate,
                action: action,
                executedRate: action === "MOONWELL_SUPPLY" ? actionData.apy : actionData.interestRate,
            };
            
            // Update history
            if (action === "MOONWELL_SUPPLY") {
                assetHistory.supply.push(currentRateData);
            } else if (action === "MOONWELL_BORROW") {
                assetHistory.borrow.push(currentRateData);
            }
            
            // Keep only last 20 entries per type
            assetHistory.supply = assetHistory.supply.slice(-20);
            assetHistory.borrow = assetHistory.borrow.slice(-20);
            
            // Calculate insights
            const insights = generateRateInsights(
                assetMarket,
                assetHistory,
                action,
                currentRateData.executedRate || 0
            );
            
            // Calculate market timing score
            const timingScore = calculateTimingScore(
                assetHistory,
                currentRateData,
                action
            );
            
            // Update state
            const updatedState: State = {
                values: {
                    ...(state?.values || {}),
                    rateHistory: {
                        ...historicalRates,
                        [asset]: assetHistory,
                    },
                    marketInsights: {
                        ...(state?.marketInsights || {}),
                        [asset]: insights,
                    },
                    timingScores: {
                        ...(state?.timingScores || {}),
                        [`${asset}_${action}`]: timingScore,
                    },
                    lastEvaluation: Date.now(),
                },
                data: state?.data || {},
                text: state?.text,
            };
            
            logger.info(`Interest rate evaluation complete:
                Asset: ${asset}
                Action: ${action}
                Current Rate: ${(currentRateData.executedRate || 0).toFixed(2)}%
                Timing Score: ${timingScore.toFixed(2)}/10`);
            
            return {
                success: true,
                state: updatedState,
            };
        } catch (error) {
            logger.error("Error evaluating interest rates:", error);
            return { success: false };
        }
    },
    
    examples: [],
};

function generateRateInsights(
    market: any,
    history: any,
    action: string,
    executedRate: number
): string[] {
    const insights: string[] = [];
    
    // Calculate average rates from history
    const relevantHistory = action === "MOONWELL_SUPPLY" ? history.supply : history.borrow;
    
    if (relevantHistory.length > 5) {
        const avgRate = relevantHistory
            .slice(-10)
            .reduce((sum: number, entry: any) => {
                return sum + (action === "MOONWELL_SUPPLY" ? entry.supplyAPY : entry.borrowAPY);
            }, 0) / Math.min(relevantHistory.length, 10);
        
        const currentRate = action === "MOONWELL_SUPPLY" ? market.supplyAPY : market.borrowAPY;
        
        // Rate comparison insights
        if (currentRate > avgRate * 1.2) {
            insights.push(`${action === "MOONWELL_SUPPLY" ? "Supply" : "Borrow"} rates are significantly higher than recent average (${(avgRate * 100).toFixed(2)}%).`);
        } else if (currentRate < avgRate * 0.8) {
            insights.push(`${action === "MOONWELL_SUPPLY" ? "Supply" : "Borrow"} rates are lower than recent average. ${action === "MOONWELL_BORROW" ? "Good time to borrow!" : "Consider waiting for better rates."}`);
        }
    }
    
    // Utilization insights
    if (market.utilizationRate > 0.9) {
        insights.push("High utilization rate indicates strong demand. Rates may increase.");
    } else if (market.utilizationRate < 0.3) {
        insights.push("Low utilization suggests excess liquidity. Rates may decrease.");
    }
    
    // Spread insights
    const spread = market.borrowAPY - market.supplyAPY;
    if (spread > 0.05) {
        insights.push(`Wide interest spread (${(spread * 100).toFixed(2)}%) indicates market inefficiency or high risk premium.`);
    }
    
    return insights;
}

function calculateTimingScore(
    history: any,
    currentRate: any,
    action: string
): number {
    const relevantHistory = action === "MOONWELL_SUPPLY" ? history.supply : history.borrow;
    
    if (relevantHistory.length < 3) {
        return 5; // Neutral score for insufficient data
    }
    
    // Get rates from last 10 entries
    const recentRates = relevantHistory
        .slice(-10)
        .map((entry: any) => action === "MOONWELL_SUPPLY" ? entry.supplyAPY : entry.borrowAPY);
    
    const currentActualRate = action === "MOONWELL_SUPPLY" ? currentRate.supplyAPY : currentRate.borrowAPY;
    
    // Calculate percentile of current rate
    const betterRates = recentRates.filter((rate: number) => 
        action === "MOONWELL_SUPPLY" ? rate < currentActualRate : rate > currentActualRate
    ).length;
    
    const percentile = betterRates / recentRates.length;
    
    // Convert to 1-10 score
    if (action === "MOONWELL_SUPPLY") {
        // Higher rates are better for supply
        return Math.round(percentile * 10);
    } else {
        // Lower rates are better for borrowing
        return Math.round((1 - percentile) * 10);
    }
}