import {
    Provider,
    ProviderResult,
    IAgentRuntime,
    Memory,
    State,
    logger,
} from "@elizaos/core";
import { MoonwellService } from "../services/moonwell-service";
import { formatUSD, formatAPY, isHealthy } from "../utils/validation";

export const positionContextProvider: Provider = {
    name: "MOONWELL_POSITION_CONTEXT",
    description: "Provides current Moonwell position context for agent decision-making",
    
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
            
            // Try to get cached position first for performance
            let position = moonwellService.getCachedPosition();
            
            // If no cache or asking about position specifically, fetch fresh data
            const text = (message.content.text || "").toLowerCase();
            const isPositionQuery = text.includes("position") || 
                                  text.includes("health") || 
                                  text.includes("collateral") ||
                                  text.includes("borrowed") ||
                                  text.includes("supplied");
            
            if (!position || isPositionQuery) {
                try {
                    position = await moonwellService.getUserPosition();
                } catch (error) {
                    logger.debug("Could not fetch Moonwell position:", error);
                    return { text: "" };
                }
            }
            
            // If no position or user not connected, return empty
            if (!position || (position.totalSupplied.isZero() && position.totalBorrowed.isZero())) {
                return { text: "" };
            }
            
            // Build context string
            let context = "\n\n**Current Moonwell Position:**\n";
            
            // Overall position summary
            context += `- Total Supplied: ${formatUSD(position.totalSupplied)}\n`;
            context += `- Total Borrowed: ${formatUSD(position.totalBorrowed)}\n`;
            context += `- Health Factor: ${position.healthFactor.toFixed(2)} ${getHealthFactorEmoji(position.healthFactor)}\n`;
            context += `- Available to Borrow: ${formatUSD(position.availableToBorrow)}\n`;
            
            // Supplied assets details
            if (position.supplies.length > 0) {
                context += "\n**Supplied Assets:**\n";
                position.supplies.forEach(supply => {
                    context += `- ${supply.symbol}: ${formatUSD(supply.balanceInUSD)} (APY: ${formatAPY(supply.apy)})`;
                    if (supply.isCollateral) {
                        context += " [Collateral]";
                    }
                    context += "\n";
                });
            }
            
            // Borrowed assets details
            if (position.borrows.length > 0) {
                context += "\n**Borrowed Assets:**\n";
                position.borrows.forEach(borrow => {
                    context += `- ${borrow.symbol}: ${formatUSD(borrow.balanceInUSD)} (APY: ${formatAPY(borrow.apy)})\n`;
                });
            }
            
            // Risk assessment
            const riskLevel = getRiskLevel(position.healthFactor);
            if (riskLevel !== "safe") {
                context += `\n**Risk Alert:** Position is ${riskLevel}. `;
                if (position.healthFactor < 1.5) {
                    context += "Consider repaying debt or adding collateral.";
                }
            }
            
            return { text: context };
        } catch (error) {
            logger.error("Error in position context provider:", error);
            return "";
        }
    },
};

function getHealthFactorEmoji(healthFactor: number): string {
    if (healthFactor >= 2.0) return "✅";
    if (healthFactor >= 1.5) return "⚠️";
    if (healthFactor >= 1.2) return "⚠️⚠️";
    return "🚨";
}

function getRiskLevel(healthFactor: number): string {
    if (healthFactor >= 2.0) return "safe";
    if (healthFactor >= 1.5) return "moderate risk";
    if (healthFactor >= 1.2) return "high risk";
    return "critical - liquidation risk";
}