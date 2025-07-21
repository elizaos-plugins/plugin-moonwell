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
import { BigNumber } from "bignumber.js";

export class PositionAction implements Action {
    name = "MOONWELL_POSITION";
    description = "Check user's Moonwell lending position and health factor";
    
    similes = [
        "my moonwell position",
        "moonwell balance",
        "moonwell health",
        "lending position",
        "borrowing status",
        "health factor",
        "my supplies",
        "my borrows"
    ];

    examples: ActionExample[] = [
        {
            user: "{{user1}}",
            content: { text: "What's my Moonwell position?" },
            action: this.name
        },
        {
            user: "{{user1}}",
            content: { text: "Check my health factor on Moonwell" },
            action: this.name
        },
        {
            user: "{{user1}}",
            content: { text: "Show me my Moonwell lending and borrowing balances" },
            action: this.name
        }
    ];

    async validate(runtime: IAgentRuntime, message: Memory, state?: State): Promise<boolean> {
        const text = message.content?.text?.toLowerCase() || "";
        
        // Check for position-related keywords
        const positionKeywords = ['position', 'balance', 'health', 'status', 'my', 'supplies', 'borrows', 'debt'];
        const moonwellKeywords = ['moonwell'];
        
        const hasPositionKeyword = positionKeywords.some(keyword => text.includes(keyword));
        const hasMoonwellKeyword = moonwellKeywords.some(keyword => text.includes(keyword));
        
        return hasPositionKeyword && (hasMoonwellKeyword || text.includes('lending'));
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

            // Fetch user position
            const position = await moonwellService.getUserPosition();
            
            if (!position) {
                await callback({
                    text: "Unable to fetch your Moonwell position. Please ensure your wallet is connected.",
                    error: true
                });
                return;
            }

            // Check if user has any position
            const hasPosition = position.totalSupplied.isGreaterThan(0) || position.totalBorrowed.isGreaterThan(0);
            
            if (!hasPosition) {
                await callback({
                    text: "You don't have any active positions on Moonwell. Start by supplying assets to earn yield!",
                    action: this.name
                } as Content);
                return;
            }

            // Format response
            let response = "<� **Your Moonwell Position**\n\n";

            // Health Factor with visual indicator
            const healthEmoji = this.getHealthEmoji(position.healthFactor);
            response += `${healthEmoji} **Health Factor:** ${position.healthFactor.toFixed(2)}\n`;
            response += this.getHealthFactorMessage(position.healthFactor) + "\n\n";

            // Summary
            response += "**=� Summary:**\n";
            response += `" Total Supplied: $${this.formatNumber(position.totalSupplied)}\n`;
            response += `" Total Borrowed: $${this.formatNumber(position.totalBorrowed)}\n`;
            response += `" Available to Borrow: $${this.formatNumber(position.availableToBorrow)}\n\n`;

            // Supplied assets
            if (position.supplies.length > 0) {
                response += "**=� Supplied Assets:**\n";
                for (const supply of position.supplies) {
                    const collateralIcon = supply.isCollateral ? "" : "L";
                    response += `" ${supply.symbol}: ${this.formatTokenAmount(supply.balance)} ($${this.formatNumber(supply.balanceInUSD)})\n`;
                    response += `  - APY: ${supply.apy.toFixed(2)}% | Collateral: ${collateralIcon}\n`;
                }
                response += "\n";
            }

            // Borrowed assets
            if (position.borrows.length > 0) {
                response += "**=� Borrowed Assets:**\n";
                for (const borrow of position.borrows) {
                    response += `" ${borrow.symbol}: ${this.formatTokenAmount(borrow.balance)} ($${this.formatNumber(borrow.balanceInUSD)})\n`;
                    response += `  - APY: ${borrow.apy.toFixed(2)}%\n`;
                }
                response += "\n";
            }

            // Earnings calculation
            const dailyEarnings = this.calculateDailyEarnings(position);
            if (dailyEarnings.net !== 0) {
                response += "**=� Estimated Daily Earnings:**\n";
                response += `" Supply Interest: +$${dailyEarnings.supply.toFixed(2)}\n`;
                response += `" Borrow Interest: -$${dailyEarnings.borrow.toFixed(2)}\n`;
                response += `" Net: ${dailyEarnings.net >= 0 ? '+' : ''}$${dailyEarnings.net.toFixed(2)}\n\n`;
            }

            // Recommendations
            response += "**=� Recommendations:**\n";
            if (position.healthFactor < 1.5) {
                response += "� Your health factor is low. Consider repaying some debt or supplying more collateral.\n";
            }
            if (position.availableToBorrow.isGreaterThan(1000)) {
                response += "=� You have borrowing capacity available. Consider leveraging for higher yields.\n";
            }
            if (position.supplies.some(s => !s.isCollateral && s.balanceInUSD.isGreaterThan(100))) {
                response += "=� Some of your supplied assets aren't enabled as collateral. Enable them to increase borrowing power.\n";
            }

            // Fetch and add rewards info if available
            const rewards = await moonwellService.getRewards();
            if (rewards && rewards.length > 0) {
                response += "\n**<� Pending Rewards:**\n";
                for (const reward of rewards) {
                    response += `" ${reward.rewardToken}: ${this.formatTokenAmount(new BigNumber(reward.amount))}\n`;
                }
            }

            await callback({
                text: response,
                action: this.name,
                data: { position, rewards }
            } as Content);

        } catch (error) {
            console.error("[PositionAction] Error:", error);
            await callback({
                text: "Failed to fetch your Moonwell position. Please try again later.",
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

    private formatTokenAmount(value: BigNumber): string {
        const num = value.toNumber();
        if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
        if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
        if (num < 0.01) return `${num.toExponential(2)}`;
        return num.toFixed(4);
    }

    private getHealthEmoji(healthFactor: number): string {
        if (healthFactor >= 2) return "=�";
        if (healthFactor >= 1.5) return "=�";
        if (healthFactor >= 1.2) return "=�";
        if (healthFactor >= 1.1) return "=�";
        return "=4";
    }

    private getHealthFactorMessage(healthFactor: number): string {
        if (healthFactor >= 2) return "Excellent health - Very safe position";
        if (healthFactor >= 1.5) return "Good health - Safe position";
        if (healthFactor >= 1.2) return "Fair health - Monitor closely";
        if (healthFactor >= 1.1) return "Low health - Risk of liquidation";
        return "Critical - High liquidation risk!";
    }

    private calculateDailyEarnings(position: any): { supply: number, borrow: number, net: number } {
        let supplyEarnings = 0;
        let borrowCosts = 0;

        // Calculate supply earnings
        for (const supply of position.supplies) {
            const dailyRate = supply.apy / 365 / 100;
            supplyEarnings += supply.balanceInUSD.toNumber() * dailyRate;
        }

        // Calculate borrow costs
        for (const borrow of position.borrows) {
            const dailyRate = borrow.apy / 365 / 100;
            borrowCosts += borrow.balanceInUSD.toNumber() * dailyRate;
        }

        return {
            supply: supplyEarnings,
            borrow: borrowCosts,
            net: supplyEarnings - borrowCosts
        };
    }
}