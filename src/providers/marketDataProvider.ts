import { Provider, IAgentRuntime, Memory, State, UUID } from "@elizaos/core";
import { MoonwellService } from "../services/moonwellService";

export class MarketDataProvider implements Provider {
    async get(runtime: IAgentRuntime, message: Memory, state?: State): Promise<string> {
        try {
            const moonwellService = runtime.getService('moonwell') as MoonwellService;
            
            if (!moonwellService) {
                return "";
            }

            const markets = await moonwellService.getMarketData();
            
            if (!markets || markets.length === 0) {
                return "";
            }

            // Build context string with market highlights
            let context = "Moonwell market conditions:\n";
            
            // Find best rates
            const bestSupplyMarket = markets.reduce((best, market) => 
                market.supplyAPY > best.supplyAPY ? market : best
            );
            const bestBorrowMarket = markets.reduce((best, market) => 
                market.borrowAPY < best.borrowAPY ? market : best
            );
            
            context += `- Best supply APY: ${bestSupplyMarket.symbol} at ${bestSupplyMarket.supplyAPY.toFixed(2)}%\n`;
            context += `- Best borrow APY: ${bestBorrowMarket.symbol} at ${bestBorrowMarket.borrowAPY.toFixed(2)}%\n`;
            
            // High utilization markets (potential opportunities)
            const highUtilMarkets = markets.filter(m => m.utilizationRate > 0.8);
            if (highUtilMarkets.length > 0) {
                context += `- High demand markets: ${highUtilMarkets.map(m => m.symbol).join(", ")}\n`;
            }
            
            // Market summary
            const avgSupplyAPY = markets.reduce((sum, m) => sum + m.supplyAPY, 0) / markets.length;
            const avgBorrowAPY = markets.reduce((sum, m) => sum + m.borrowAPY, 0) / markets.length;
            
            context += `- Average supply APY: ${avgSupplyAPY.toFixed(2)}%\n`;
            context += `- Average borrow APY: ${avgBorrowAPY.toFixed(2)}%\n`;
            
            // Total market size
            const totalSupplied = markets.reduce((sum, m) => sum.plus(m.totalSupply), markets[0].totalSupply.minus(markets[0].totalSupply));
            const totalBorrowed = markets.reduce((sum, m) => sum.plus(m.totalBorrow), markets[0].totalBorrow.minus(markets[0].totalBorrow));
            
            context += `- Total market supply: $${(totalSupplied.toNumber() / 1e6).toFixed(1)}M\n`;
            context += `- Total market borrows: $${(totalBorrowed.toNumber() / 1e6).toFixed(1)}M\n`;
            
            return context;
        } catch (error) {
            console.error("[MarketDataProvider] Error:", error);
            return "";
        }
    }
}