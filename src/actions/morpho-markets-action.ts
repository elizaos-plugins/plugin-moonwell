import {
  Action,
  ActionResult,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  ActionExample,
  Content,
} from "@elizaos/core";
import { MoonwellService } from "../services/moonwell-service";
import { MorphoMarket, MorphoUserPosition } from "../types";
import type { MorphoMarketUserPosition as SDKMorphoMarketUserPosition } from "@moonwell-fi/moonwell-sdk";
import { BigNumber } from "bignumber.js";
import { formatErrorResponse } from "../utils/error-handler";

export const morphoMarketsAction: Action = {
  name: "MOONWELL_MORPHO_MARKETS",
  description: "Get Morpho markets data and rates from Moonwell protocol",

  similes: [
    "MORPHO_MARKETS",
    "MORPHO_RATES",
    "MORPHO_POSITIONS",
    "MORPHO_LENDING",
    "MORPHO_BORROWING",
  ],

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Show me Morpho markets on Moonwell" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll check the available Morpho markets on Moonwell for you.",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "What are the Morpho lending rates?" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Let me get the current Morpho market rates for you.",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Check my Morpho positions on Moonwell" },
      },
      {
        name: "{{agent}}",
        content: { 
          text: "I'll check your Morpho positions across all markets." 
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Show morpho borrowing rates" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll get the current Morpho borrowing rates across all markets.",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "What's my morpho position?" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Let me check your current Morpho positions and balances.",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "moonwell morpho markets overview" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll provide an overview of all Morpho markets available on Moonwell.",
        },
      },
    ],
  ],

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content?.text?.toLowerCase() || "";

    // Check for Morpho-related keywords
    const morphoKeywords = ["morpho", "morph"];
    const marketKeywords = [
      "market",
      "position",
      "rate",
      "apy",
      "lending",
      "borrowing",
    ];

    const hasMorphoKeyword = morphoKeywords.some((keyword) =>
      text.includes(keyword),
    );
    const hasMarketKeyword = marketKeywords.some((keyword) =>
      text.includes(keyword),
    );

    return hasMorphoKeyword || (hasMarketKeyword && text.includes("moonwell"));
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback,
    _responses?: Memory[],
  ) => {
    try {
      const moonwellService = runtime.getService(
        "moonwell",
      ) as unknown as MoonwellService;

      if (!moonwellService) {
        const responseContent: Content = {
          text: "Moonwell service is not available. Please check the configuration.",
          actions: ["MOONWELL_MORPHO_MARKETS"],
          source: message.content.source,
        };

        if (callback) {
          await callback(responseContent);
        }

        return {
          text: responseContent.text,
          success: false,
          data: { error: "SERVICE_NOT_AVAILABLE" },
        };
      }

      const text = message.content?.text?.toLowerCase() || "";
      const isPositionCheck = text.includes("position") || text.includes("my");

      // Fetch Morpho markets
      const markets = await moonwellService.getMorphoMarkets();

      if (!markets || markets.length === 0) {
        const responseContent: Content = {
          text: "No Morpho markets found on Moonwell at this time.",
          actions: ["MOONWELL_MORPHO_MARKETS"],
          source: message.content.source,
        };

        if (callback) {
          await callback(responseContent);
        }

        return {
          text: responseContent.text,
          success: false,
          data: { error: "NO_MARKETS_FOUND" },
        };
      }

      let response = " **Morpho Markets on Moonwell**\n\n";

      // If checking positions, get user positions
      let userPositions: Map<string, SDKMorphoMarketUserPosition> = new Map();
      if (isPositionCheck) {
        try {
          for (const market of markets) {
            const position = await moonwellService.getMorphoUserPosition(market.marketId);
            if (position && (!new BigNumber(position.supplied.value.toString()).isZero() || !new BigNumber(position.borrowed.value.toString()).isZero())) {
              userPositions.set(market.marketId, position);
            }
          }
        } catch (error) {
          // Continue without positions if wallet not connected
          console.warn("Could not fetch user positions:", error);
        }
      }

      // Display user summary if positions exist
      if (userPositions.size > 0) {
        response += " **Your Morpho Positions:**\n";
        let totalSupplyUSD = new BigNumber(0);
        let totalBorrowUSD = new BigNumber(0);

        for (const [marketId, position] of userPositions) {
          const market = markets.find(m => m.marketId === marketId);
          if (!market) continue;

          const supplyUSD = new BigNumber(position.supplied.value.toString()).multipliedBy(market.loanTokenPrice || 1);
          const borrowUSD = new BigNumber(position.borrowed.value.toString()).multipliedBy(market.loanTokenPrice || 1);

          totalSupplyUSD = totalSupplyUSD.plus(supplyUSD);
          totalBorrowUSD = totalBorrowUSD.plus(borrowUSD);

          response += `\n**${market.loanToken.symbol}/${market.collateralToken.symbol}**\n`;
          if (!new BigNumber(position.supplied.value.toString()).isZero()) {
            response += `• Supplied: ${formatAmount(new BigNumber(position.supplied.value.toString()), market.loanToken.decimals)} ${market.loanToken.symbol} ($${formatNumber(supplyUSD)})\n`;
          }
          if (!new BigNumber(position.borrowed.value.toString()).isZero()) {
            response += `• Borrowed: ${formatAmount(new BigNumber(position.borrowed.value.toString()), market.loanToken.decimals)} ${market.loanToken.symbol} ($${formatNumber(borrowUSD)})\n`;
          }
          // Health factor calculation would need additional data
        }

        response += `\n **Total Position:**\n`;
        response += `• Total Supplied: $${formatNumber(totalSupplyUSD)}\n`;
        response += `• Total Borrowed: $${formatNumber(totalBorrowUSD)}\n`;
        response += `• Net Value: $${formatNumber(totalSupplyUSD.minus(totalBorrowUSD))}\n\n`;
      }

      // Display market overview
      response += " **Market Overview:**\n";

      // Sort markets by total supply
      const sortedMarkets = markets.sort((a, b) => {
        const aTotal = new BigNumber(a.totalSupply.value.toString()).multipliedBy(a.loanTokenPrice || 1);
        const bTotal = new BigNumber(b.totalSupply.value.toString()).multipliedBy(b.loanTokenPrice || 1);
        const comparison = bTotal.comparedTo(aTotal);
        return comparison === null ? 0 : comparison;
      });

      for (const market of sortedMarkets) {
        const totalSupplyUSD = new BigNumber(market.totalSupply.value.toString()).multipliedBy(market.loanTokenPrice || 1);
        const totalBorrowUSD = new BigNumber(market.totalBorrows.value.toString()).multipliedBy(market.loanTokenPrice || 1);
        const availableLiquidity = new BigNumber(market.totalSupply.value.toString()).minus(new BigNumber(market.totalBorrows.value.toString()));

        response += `\n**${market.loanToken.symbol}/${market.collateralToken.symbol}**\n`;
        response += `• Supply APY: ${market.baseSupplyApy.toFixed(2)}%\n`;
        response += `• Borrow APY: ${market.baseBorrowApy.toFixed(2)}%\n`;
        response += `• Total Supply: $${formatNumber(totalSupplyUSD)}\n`;
        response += `• Total Borrowed: $${formatNumber(totalBorrowUSD)}\n`;
        const utilization = new BigNumber(market.totalBorrows.value.toString()).dividedBy(new BigNumber(market.totalSupply.value.toString())).toNumber();
        response += `• Utilization: ${(utilization * 100).toFixed(1)}%\n`;
        response += `• Available: ${formatAmount(availableLiquidity, market.loanToken.decimals)} ${market.loanToken.symbol}\n`;
        const lltv = new BigNumber(market.marketParams.lltv.toString()).dividedBy(new BigNumber(10).pow(18));
        response += `• Max LTV: ${lltv.multipliedBy(100).toFixed(0)}%\n`;

        // Add user position indicator if they have one
        if (userPositions.has(market.marketId)) {
          response += `•  You have a position in this market\n`;
        }
      }

      // Add rewards info if available
      try {
        const rewards = await moonwellService.getMorphoUserRewards();
        if (rewards.rewards.length > 0) {
          response += "\n **Pending Rewards:**\n";
          for (const reward of rewards.rewards) {
            response += `• ${formatAmount(reward.amount, 18)} ${reward.symbol} ($${formatNumber(reward.valueInUSD)})\n`;
          }
          response += `• Total Value: $${formatNumber(rewards.totalValueInUSD)}\n`;
        }
      } catch (error) {
        // Ignore rewards errors
      }

      const responseContent: Content = {
        text: response,
        actions: ["MOONWELL_MORPHO_MARKETS"],
        source: message.content.source,
      };

      if (callback) {
        await callback(responseContent);
      }

      return {
        text: response,
        success: true,
        data: { 
          markets: sortedMarkets,
          userPositions: Array.from(userPositions.values()),
        },
      };
    } catch (error: any) {
      console.error("[MorphoMarketsAction] Error:", error);

      const errorMessage = formatErrorResponse(error);
      const errorContent: Content = {
        text: errorMessage,
        actions: ["MOONWELL_MORPHO_MARKETS"],
        source: message.content.source,
      };

      if (callback) {
        await callback(errorContent);
      }

      return {
        text: errorMessage,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },
};

function formatNumber(value: BigNumber): string {
  const num = value.toNumber();
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(2);
}

function formatAmount(value: BigNumber, decimals: number): string {
  const divisor = new BigNumber(10).pow(decimals);
  const amount = value.dividedBy(divisor);
  
  if (amount.gte(1e6)) {
    return `${amount.dividedBy(1e6).toFixed(2)}M`;
  } else if (amount.gte(1e3)) {
    return `${amount.dividedBy(1e3).toFixed(2)}K`;
  } else if (amount.gte(1)) {
    return amount.toFixed(2);
  } else if (amount.gte(0.01)) {
    return amount.toFixed(4);
  } else {
    return amount.toFixed(6);
  }
}