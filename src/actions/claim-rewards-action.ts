import {
  Action,
  ActionExample,
  Content,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  logger,
} from "@elizaos/core";
import { MoonwellService } from "../services/moonwell-service";
import { formatUSD } from "../utils/validation";

export const claimRewardsAction: Action = {
  name: "MOONWELL_CLAIM_REWARDS",
  description:
    "Claim all accumulated rewards from Moonwell Protocol lending and borrowing activities",
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    logger.info("Validating Moonwell claim rewards action");
    const text = (message.content.text || "").toLowerCase();
    
    // Check if the message contains claim-related keywords
    const claimKeywords = [
      "claim",
      "collect",
      "harvest",
      "redeem",
      "withdraw reward",
      "get reward",
    ];
    
    const hasClaimIntent = claimKeywords.some((keyword) =>
      text.includes(keyword),
    );
    
    const hasRewardContext = text.includes("reward") || text.includes("earnings");
    
    return hasClaimIntent && hasRewardContext;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options?: { [key: string]: unknown },
    callback?: HandlerCallback,
  ) => {
    logger.info("Starting Moonwell claim rewards action");

    try {
      const moonwellService = runtime.getService("moonwell") as MoonwellService;

      if (!moonwellService) {
        throw new Error("Moonwell service is not available");
      }

      // Show current rewards before claiming
      if (callback) {
        callback({
          text: "Checking your unclaimed rewards...",
          action: "MOONWELL_CLAIM_REWARDS",
        });
      }

      const rewardsBefore = await moonwellService.getUserRewards();
      
      if (rewardsBefore.rewards.length === 0) {
        const message = "You don't have any rewards to claim at the moment.";
        if (callback) {
          callback({
            text: message,
            action: "MOONWELL_CLAIM_REWARDS",
          });
        }
        return {
          text: message,
          success: true,
          data: { rewards: [] },
        };
      }

      // Build rewards summary
      let rewardsSummary = "**Unclaimed Rewards:**\n";
      rewardsBefore.rewards.forEach((reward) => {
        rewardsSummary += `- ${reward.amount.toFixed(4)} ${reward.symbol}`;
        if (reward.valueInUSD.gt(0)) {
          rewardsSummary += ` (${formatUSD(reward.valueInUSD)})`;
        }
        rewardsSummary += "\n";
      });

      if (callback) {
        callback({
          text: rewardsSummary + "\nClaiming all rewards...",
          action: "MOONWELL_CLAIM_REWARDS",
        });
      }

      // Claim all rewards
      const result = await moonwellService.claimAllRewards();

      // Build success message
      let successMessage = ` **Rewards Claimed Successfully!**\n\n`;
      successMessage += `Transaction: ${result.transactionHash}\n\n`;
      successMessage += "**Claimed Rewards:**\n";
      
      result.rewardsClaimed.forEach((reward) => {
        const rewardInfo = rewardsBefore.rewards.find(
          (r) => r.token.toLowerCase() === reward.token.toLowerCase(),
        );
        successMessage += `- ${reward.amount.toFixed(4)} ${
          rewardInfo?.symbol || "UNKNOWN"
        }\n`;
      });

      successMessage += "\nYour rewards have been sent to your wallet!";

      if (callback) {
        callback({
          text: successMessage,
          action: "MOONWELL_CLAIM_REWARDS",
        });
      }

      return {
        text: successMessage,
        success: true,
        data: result,
      };
    } catch (error) {
      logger.error("Error in claim rewards action:", error);
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : "Failed to claim rewards";
          
      if (callback) {
        callback({
          text: ` Error: ${errorMessage}`,
          action: "MOONWELL_CLAIM_REWARDS",
        });
      }
      
      return {
        text: ` Error: ${errorMessage}`,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: {
          text: "Claim my Moonwell rewards",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll help you claim your accumulated rewards from Moonwell Protocol. Let me check what rewards you have available...",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: {
          text: "Collect all my WELL token rewards",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll claim all your WELL token rewards from your Moonwell positions. Checking your unclaimed rewards now...",
        },
      },
    ],
  ],

  similes: [
    "claim rewards",
    "collect rewards",
    "harvest rewards",
    "redeem rewards",
    "withdraw rewards",
    "get my rewards",
    "claim WELL tokens",
    "collect my earnings",
    "claim moonwell rewards",
    "harvest WELL",
  ],
};