import { 
    Action, 
    IAgentRuntime, 
    Memory, 
    State, 
    HandlerCallback,
    ActionExample,
    Content
} from "@elizaos/core";
import { MoonwellService } from "../services/moonwellService";
import { MarketData } from "../types";
import { BigNumber } from "bignumber.js";

export class MarketDataAction implements Action {
    name = "MOONWELL_MARKET_DATA";
    description = "Get market data and rates from Moonwell protocol";
    
    similes = [
        "moonwell markets",
        "moonwell rates",
        "lending rates",
        "borrow rates",
        "market info",
        "moonwell apy",
        "supply rates"
    ];

    examples: ActionExample[] = [
        {
            user: "{{user1}}",
            content: { text: "What are the current Moonwell lending rates?" },
            action: this.name
        },
        {
            user: "{{user1}}",
            content: { text: "Show me USDC supply and borrow rates on Moonwell" },
            action: this.name
        },
        {
            user: "{{user1}}",
            content: { text: "What's the best APY on Moonwell right now?" },
            action: this.name
        }
    ];

    async validate(runtime: IAgentRuntime, message: Memory, state?: State): Promise<boolean> {
        const text = message.content?.text?.toLowerCase() || "";
        
        // Check for market-related keywords
        const marketKeywords = ['market', 'rate', 'apy', 'apr', 'lending', 'borrow', 'supply'];
        const moonwellKeywords = ['moonwell'];
        
        const hasMarketKeyword = marketKeywords.some(keyword => text.includes(keyword));
        const hasMoonwellKeyword = moonwellKeywords.some(keyword => text.includes(keyword));
        
        return hasMarketKeyword || hasMoonwellKeyword;
    }

    async handler(
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback
    ): Promise<void> {
        try {
            const moonwellService = runtime.getService('moonwell') as MoonwellService;
            
            if (!moonwellService) {
                await callback({
                    text: "Moonwell service is not available. Please check the configuration.",
                    error: true
                });
                return;
            }

            const text = message.content?.text?.toLowerCase() || "";
            
            // Extract asset if specified
            let asset: string | undefined;
            const commonAssets = ['usdc', 'dai', 'eth', 'weth', 'cbeth', 'usdbc'];
            for (const a of commonAssets) {
                if (text.includes(a)) {
                    asset = a.toUpperCase();
                    break;
                }
            }

            // Fetch market data
            const markets = await moonwellService.getMarketData(asset);
            
            if (!markets || markets.length === 0) {
                await callback({
                    text: asset 
                        ? `No market data found for ${asset} on Moonwell.`
                        : "Unable to fetch Moonwell market data at this time.",
                    error: true
                });
                return;
            }

            // Format response
            let response = asset 
                ? `=� **Moonwell Market Data for ${asset}**\n\n`
                : "=� **Moonwell Market Overview**\n\n";

            // Sort markets by total supply for better presentation
            const sortedMarkets = markets.sort((a, b) => 
                b.totalSupply.comparedTo(a.totalSupply)
            );

            // Find best rates
            const bestSupplyMarket = sortedMarkets.reduce((best, market) => 
                market.supplyAPY > best.supplyAPY ? market : best
            );
            const bestBorrowMarket = sortedMarkets.reduce((best, market) => 
                market.borrowAPY < best.borrowAPY ? market : best
            );

            if (!asset) {
                response += `<� **Best Rates:**\n`;
                response += `" Highest Supply APY: ${bestSupplyMarket.symbol} at ${bestSupplyMarket.supplyAPY.toFixed(2)}%\n`;
                response += `" Lowest Borrow APY: ${bestBorrowMarket.symbol} at ${bestBorrowMarket.borrowAPY.toFixed(2)}%\n\n`;
            }

            response += "**Market Details:**\n";
            
            for (const market of sortedMarkets.slice(0, 5)) { // Show top 5 markets
                response += `\n**${market.symbol}**\n`;
                response += `" Supply APY: ${market.supplyAPY.toFixed(2)}%\n`;
                response += `" Borrow APY: ${market.borrowAPY.toFixed(2)}%\n`;
                response += `" Total Supply: $${this.formatNumber(market.totalSupply)}\n`;
                response += `" Total Borrowed: $${this.formatNumber(market.totalBorrow)}\n`;
                response += `" Utilization: ${(market.utilizationRate * 100).toFixed(1)}%\n`;
                response += `" Available Liquidity: $${this.formatNumber(market.liquidityAvailable)}\n`;
            }

            // Add market insights
            response += "\n=� **Market Insights:**\n";
            
            // High utilization markets
            const highUtilizationMarkets = sortedMarkets.filter(m => m.utilizationRate > 0.8);
            if (highUtilizationMarkets.length > 0) {
                response += `" High demand: ${highUtilizationMarkets.map(m => m.symbol).join(', ')} (>80% utilized)\n`;
            }

            // Low utilization markets with good supply rates
            const efficientMarkets = sortedMarkets.filter(m => 
                m.utilizationRate < 0.5 && m.supplyAPY > 3
            );
            if (efficientMarkets.length > 0) {
                response += `" Efficient markets: ${efficientMarkets.map(m => m.symbol).join(', ')} (good rates, low utilization)\n`;
            }

            await callback({
                text: response,
                action: this.name,
                data: { markets: sortedMarkets }
            } as Content);

        } catch (error) {
            console.error("[MarketDataAction] Error:", error);
            await callback({
                text: "Failed to fetch Moonwell market data. Please try again later.",
                error: true
            });
        }
    }

    private formatNumber(value: BigNumber): string {
        const num = value.toNumber();
        if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
        if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
        return num.toFixed(2);
    }
}