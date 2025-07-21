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

export class GovernanceAction implements Action {
    name = "MOONWELL_GOVERNANCE";
    description = "Check Moonwell governance proposals and voting power";
    
    similes = [
        "moonwell governance",
        "moonwell proposals",
        "moonwell voting",
        "voting power",
        "active proposals",
        "moonwell votes"
    ];

    examples: ActionExample[] = [
        {
            user: "{{user1}}",
            content: { text: "What are the active Moonwell proposals?" },
            action: this.name
        },
        {
            user: "{{user1}}",
            content: { text: "Check my Moonwell voting power" },
            action: this.name
        },
        {
            user: "{{user1}}",
            content: { text: "Show me Moonwell governance activity" },
            action: this.name
        }
    ];

    async validate(runtime: IAgentRuntime, message: Memory, state?: State): Promise<boolean> {
        const text = message.content?.text?.toLowerCase() || "";
        
        // Check for governance-related keywords
        const govKeywords = ['governance', 'proposal', 'voting', 'vote', 'power'];
        const moonwellKeywords = ['moonwell'];
        
        const hasGovKeyword = govKeywords.some(keyword => text.includes(keyword));
        const hasMoonwellKeyword = moonwellKeywords.some(keyword => text.includes(keyword));
        
        return hasGovKeyword && hasMoonwellKeyword;
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

            // Fetch governance info
            const govInfo = await moonwellService.getGovernanceInfo();
            
            if (!govInfo) {
                await callback({
                    text: "Unable to fetch Moonwell governance information at this time.",
                    error: true
                });
                return;
            }

            // Format response
            let response = "=� **Moonwell Governance Overview**\n\n";

            // User voting power
            if (govInfo.userVotingPower) {
                response += `**Your Voting Power:** ${this.formatVotingPower(govInfo.userVotingPower)}\n\n`;
            }

            // Active proposals
            if (govInfo.activeProposals && govInfo.activeProposals.length > 0) {
                response += "**=� Active Proposals:**\n\n";
                
                for (const proposal of govInfo.activeProposals.slice(0, 5)) { // Show max 5 proposals
                    response += `**${proposal.title}**\n`;
                    response += `" ID: ${proposal.id}\n`;
                    response += `" Status: ${this.formatStatus(proposal.state)}\n`;
                    
                    if (proposal.forVotes || proposal.againstVotes) {
                        const totalVotes = (proposal.forVotes || 0) + (proposal.againstVotes || 0);
                        const forPercentage = totalVotes > 0 ? (proposal.forVotes / totalVotes * 100).toFixed(1) : 0;
                        response += `" Votes: For ${forPercentage}% | Against ${(100 - parseFloat(forPercentage)).toFixed(1)}%\n`;
                    }
                    
                    if (proposal.endTime) {
                        response += `" Ends: ${this.formatDate(proposal.endTime)}\n`;
                    }
                    
                    response += `" ${proposal.description?.substring(0, 100)}...\n\n`;
                }
            } else {
                response += "**No active proposals at this time.**\n\n";
            }

            // Governance insights
            response += "**=� Governance Tips:**\n";
            
            if (govInfo.userVotingPower && govInfo.userVotingPower > 0) {
                response += "" You have voting power! Make sure to participate in active proposals.\n";
            } else {
                response += "" Stake WELL tokens to gain voting power and participate in governance.\n";
            }
            
            response += "" Check the Moonwell forum for detailed proposal discussions.\n";
            response += "" Voting typically lasts 3-7 days, so act promptly on new proposals.\n";

            await callback({
                text: response,
                action: this.name,
                data: { governance: govInfo }
            } as Content);

        } catch (error) {
            console.error("[GovernanceAction] Error:", error);
            await callback({
                text: "Failed to fetch Moonwell governance information. Please try again later.",
                error: true
            });
        }
    }

    private formatVotingPower(power: any): string {
        if (typeof power === 'number') {
            if (power >= 1e6) return `${(power / 1e6).toFixed(2)}M WELL`;
            if (power >= 1e3) return `${(power / 1e3).toFixed(2)}K WELL`;
            return `${power.toFixed(2)} WELL`;
        }
        return power.toString();
    }

    private formatStatus(status: string): string {
        const statusEmojis: Record<string, string> = {
            'active': '=� Active',
            'pending': '=� Pending',
            'succeeded': ' Succeeded',
            'defeated': 'L Defeated',
            'executed': ' Executed',
            'cancelled': '=� Cancelled',
            'queued': '� Queued'
        };
        
        return statusEmojis[status.toLowerCase()] || status;
    }

    private formatDate(timestamp: number | string): string {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = date.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
            return `in ${diffHours} hours`;
        } else if (diffDays > 0) {
            return `in ${diffDays} days`;
        } else {
            return `${Math.abs(diffDays)} days ago`;
        }
    }
}