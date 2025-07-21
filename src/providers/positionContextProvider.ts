import { Provider, IAgentRuntime, Memory, State, UUID } from "@elizaos/core";
import { MoonwellService } from "../services/moonwellService";

export class PositionContextProvider implements Provider {
    async get(runtime: IAgentRuntime, message: Memory, state?: State): Promise<string> {
        try {
            const moonwellService = runtime.getService('moonwell') as MoonwellService;
            
            if (!moonwellService) {
                return "";
            }

            const position = moonwellService.getCachedPosition();
            
            if (!position) {
                return "";
            }

            // Build context string
            let context = "Current Moonwell position:\n";
            
            // Health factor context
            const healthStatus = position.healthFactor >= 1.5 ? "healthy" : "at risk";
            context += `- Health Factor: ${position.healthFactor.toFixed(2)} (${healthStatus})\n`;
            
            // Supply context
            if (position.supplies.length > 0) {
                context += `- Supplied assets: ${position.supplies.map(s => 
                    `${s.symbol} ($${s.balanceInUSD.toFixed(0)})`
                ).join(", ")}\n`;
                context += `- Total supplied: $${position.totalSupplied.toFixed(0)}\n`;
            }
            
            // Borrow context
            if (position.borrows.length > 0) {
                context += `- Borrowed assets: ${position.borrows.map(b => 
                    `${b.symbol} ($${b.balanceInUSD.toFixed(0)})`
                ).join(", ")}\n`;
                context += `- Total borrowed: $${position.totalBorrowed.toFixed(0)}\n`;
            }
            
            // Borrowing capacity
            context += `- Available to borrow: $${position.availableToBorrow.toFixed(0)}\n`;
            
            // Risk warnings
            if (position.healthFactor < 1.5) {
                context += "- WARNING: Low health factor, liquidation risk\n";
            }
            
            return context;
        } catch (error) {
            console.error("[PositionContextProvider] Error:", error);
            return "";
        }
    }
}