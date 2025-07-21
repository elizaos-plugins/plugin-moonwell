import {
    Provider,
    ProviderResult,
    IAgentRuntime,
    Memory,
    State,
    logger,
} from "@elizaos/core";
import { MoonwellService } from "../services/moonwell-service";
import { formatAPY, formatUSD, SUPPORTED_ASSETS } from "../utils/validation";
import { BigNumber } from "bignumber.js";

export const marketDataProvider: Provider = {
    name: "MOONWELL_MARKET_DATA",
    description: "Provides current Moonwell market conditions and rates for lending/borrowing decisions",
    
    get: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State
    ): Promise<ProviderResult> => {
        try {
            const moonwellService = runtime.getService("moonwell") as MoonwellService;
            
            if (!moonwellService) {
                return { text: "" };
            }
            
            const text = (message.content.text || "").toLowerCase();
            
            // Check if this is a market-related query
            const marketKeywords = ["rate", "apy", "market", "supply", "borrow", "lend", "yield"];
            const isMarketQuery = marketKeywords.some(keyword => text.includes(keyword));
            
            if (!isMarketQuery) {
                return { text: "" };
            }
            
            // Check if asking about a specific asset
            let specificAsset: string | undefined;
            Object.keys(SUPPORTED_ASSETS).forEach(asset => {
                if (text.includes(asset.toLowerCase())) {
                    specificAsset = asset;
                }
            });
            
            // Get market data
            let marketData;
            try {
                marketData = await moonwellService.getMarketData(specificAsset);
            } catch (error) {
                logger.debug("Could not fetch Moonwell market data:", error);
                return { text: "" };
            }
            
            if (!marketData || marketData.length === 0) {
                return { text: "" };
            }
            
            // Build context string
            let context = "\n\n**Moonwell Market Rates:**\n";
            
            // Sort by total liquidity for relevance
            marketData.sort((a, b) => 
                b.totalSupply.plus(b.totalBorrow).comparedTo(a.totalSupply.plus(a.totalBorrow))
            );
            
            marketData.forEach(market => {
                context += `\n**${market.symbol}:**\n`;
                context += `- Supply APY: ${formatAPY(market.supplyAPY)} ${getRateIndicator(market.supplyAPY, 'supply')}\n`;
                context += `- Borrow APY: ${formatAPY(market.borrowAPY)} ${getRateIndicator(market.borrowAPY, 'borrow')}\n`;
                context += `- Utilization: ${(market.utilizationRate * 100).toFixed(1)}%\n`;
                context += `- Available Liquidity: ${formatUSD(market.liquidityAvailable)}\n`;
                
                // Add market insights
                const insights = getMarketInsights(market);
                if (insights.length > 0) {
                    context += `- Insights: ${insights.join("; ")}\n`;
                }
            });
            
            // Add best opportunities if showing all markets
            if (!specificAsset && marketData.length > 1) {
                context += "\n**Best Opportunities:**\n";
                
                // Best supply rate
                const bestSupply = marketData.reduce((best, current) => 
                    current.supplyAPY > best.supplyAPY ? current : best
                );
                context += `- Highest Supply APY: ${bestSupply.symbol} at ${formatAPY(bestSupply.supplyAPY)}\n`;
                
                // Best borrow rate
                const bestBorrow = marketData.reduce((best, current) => 
                    current.borrowAPY < best.borrowAPY ? current : best
                );
                context += `- Lowest Borrow APY: ${bestBorrow.symbol} at ${formatAPY(bestBorrow.borrowAPY)}\n`;
            }
            
            return { text: context };
        } catch (error) {
            logger.error("Error in market data provider:", error);
            return "";
        }
    },
};

function getRateIndicator(rate: number, type: 'supply' | 'borrow'): string {
    // These thresholds can be adjusted based on market conditions
    if (type === 'supply') {
        if (rate > 0.05) return "🔥"; // Excellent
        if (rate > 0.03) return "✨"; // Good
        if (rate > 0.01) return "👍"; // Decent
        return "";
    } else {
        if (rate < 0.03) return "🎯"; // Excellent
        if (rate < 0.05) return "✨"; // Good
        if (rate < 0.08) return "👍"; // Decent
        return "";
    }
}

function getMarketInsights(market: any): string[] {
    const insights: string[] = [];
    
    // Utilization insights
    if (market.utilizationRate > 0.9) {
        insights.push("High demand - rates may increase");
    } else if (market.utilizationRate > 0.7) {
        insights.push("Good liquidity with healthy demand");
    } else if (market.utilizationRate < 0.3) {
        insights.push("Low utilization - competitive rates");
    }
    
    // Spread insights
    const spread = market.borrowAPY - market.supplyAPY;
    if (spread < 0.02) {
        insights.push("Tight spread - efficient market");
    } else if (spread > 0.05) {
        insights.push("Wide spread - consider arbitrage");
    }
    
    // Liquidity insights
    const liquidityInMillions = market.liquidityAvailable.dividedBy(1000000);
    if (liquidityInMillions.lt(0.1)) {
        insights.push("Low liquidity - large transactions may impact rates");
    } else if (liquidityInMillions.gt(10)) {
        insights.push("Deep liquidity available");
    }
    
    return insights;
}