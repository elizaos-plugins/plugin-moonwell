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
import { MarketData } from "../types";
import { BigNumber } from "bignumber.js";
import { formatErrorResponse } from "../utils/error-handler";

export const marketDataAction: Action = {
  name: "MOONWELL_MARKET_DATA",
  description: "Get market data and rates from Moonwell protocol",

  similes: [
    "MOONWELL_MARKETS",
    "MARKET_DATA",
    "RATES",
    "APY",
    "LENDING_RATES",
    "BORROW_RATES",
  ],

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "What are the current Moonwell lending rates?" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll check the current Moonwell lending rates for you.",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Show me USDC supply and borrow rates on Moonwell" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Let me get the current USDC rates on Moonwell for you.",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "What's the best APY on Moonwell right now?" },
      },
      {
        name: "{{agent}}",
        content: { text: "I'll find the best APY opportunities on Moonwell." },
      },
    ],
  ],

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content?.text?.toLowerCase() || "";

    // Check for market-related keywords
    const marketKeywords = [
      "market",
      "rate",
      "apy",
      "apr",
      "lending",
      "borrow",
      "supply",
    ];
    const moonwellKeywords = ["moonwell"];

    const hasMarketKeyword = marketKeywords.some((keyword) =>
      text.includes(keyword),
    );
    const hasMoonwellKeyword = moonwellKeywords.some((keyword) =>
      text.includes(keyword),
    );

    return hasMarketKeyword || hasMoonwellKeyword;
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
          actions: ["MOONWELL_MARKET_DATA"],
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

      // Extract asset if specified
      let asset: string | undefined;
      const commonAssets = ["usdc", "dai", "eth", "weth", "cbeth", "usdbc"];
      for (const a of commonAssets) {
        if (text.includes(a)) {
          asset = a.toUpperCase();
          break;
        }
      }

      // Fetch market data
      const markets = await moonwellService.getMarketData(asset);

      if (!markets || markets.length === 0) {
        const responseContent: Content = {
          text: asset
            ? `No market data found for ${asset} on Moonwell.`
            : "Unable to fetch Moonwell market data at this time.",
          actions: ["MOONWELL_MARKET_DATA"],
          source: message.content.source,
        };

        if (callback) {
          await callback(responseContent);
        }

        return {
          text: responseContent.text,
          success: false,
          data: { error: "NO_DATA_FOUND" },
        };
      }

      // Format response
      let response = asset
        ? `=� **Moonwell Market Data for ${asset}**\n\n`
        : "=� **Moonwell Market Overview**\n\n";

      // Sort markets by total supply for better presentation
      const sortedMarkets = markets.sort((a, b) => {
        const comparison = b.totalSupply.comparedTo(a.totalSupply);
        return comparison || 0;
      });

      // Find best rates
      const bestSupplyMarket = sortedMarkets.reduce((best, market) =>
        market.supplyAPY > best.supplyAPY ? market : best,
      );
      const bestBorrowMarket = sortedMarkets.reduce((best, market) =>
        market.borrowAPY < best.borrowAPY ? market : best,
      );

      if (!asset) {
        response += `<� **Best Rates:**\n`;
        response += `" Highest Supply APY: ${bestSupplyMarket.symbol} at ${bestSupplyMarket.supplyAPY.toFixed(2)}%\n`;
        response += `" Lowest Borrow APY: ${bestBorrowMarket.symbol} at ${bestBorrowMarket.borrowAPY.toFixed(2)}%\n\n`;
      }

      response += "**Market Details:**\n";

      for (const market of sortedMarkets.slice(0, 5)) {
        // Show top 5 markets
        response += `\n**${market.symbol}**\n`;
        response += `" Supply APY: ${market.supplyAPY.toFixed(2)}%\n`;
        response += `" Borrow APY: ${market.borrowAPY.toFixed(2)}%\n`;
        response += `" Total Supply: $${formatNumber(market.totalSupply)}\n`;
        response += `" Total Borrowed: $${formatNumber(market.totalBorrow)}\n`;
        response += `" Utilization: ${(market.utilizationRate * 100).toFixed(1)}%\n`;
        response += `" Available Liquidity: $${formatNumber(market.liquidityAvailable)}\n`;
      }

      // Add market insights
      response += "\n=� **Market Insights:**\n";

      // High utilization markets
      const highUtilizationMarkets = sortedMarkets.filter(
        (m) => m.utilizationRate > 0.8,
      );
      if (highUtilizationMarkets.length > 0) {
        response += `" High demand: ${highUtilizationMarkets.map((m) => m.symbol).join(", ")} (>80% utilized)\n`;
      }

      // Low utilization markets with good supply rates
      const efficientMarkets = sortedMarkets.filter(
        (m) => m.utilizationRate < 0.5 && m.supplyAPY > 3,
      );
      if (efficientMarkets.length > 0) {
        response += `" Efficient markets: ${efficientMarkets.map((m) => m.symbol).join(", ")} (good rates, low utilization)\n`;
      }

      const responseContent: Content = {
        text: response,
        actions: ["MOONWELL_MARKET_DATA"],
        source: message.content.source,
      };

      if (callback) {
        await callback(responseContent);
      }

      return {
        text: response,
        success: true,
        data: { markets: sortedMarkets },
      };
    } catch (error: any) {
      console.error("[MarketDataAction] Error:", error);

      const errorMessage = formatErrorResponse(error);
      const errorContent: Content = {
        text: errorMessage,
        actions: ["MOONWELL_MARKET_DATA"],
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
