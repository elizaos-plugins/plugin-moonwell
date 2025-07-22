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
import { BigNumber } from "bignumber.js";
import { formatErrorResponse } from "../utils/error-handler";

export const marketSnapshotsAction: Action = {
  name: "MOONWELL_MARKET_SNAPSHOTS",
  description: "View historical market data and trends for Moonwell assets",

  similes: [
    "MOONWELL_MARKET_SNAPSHOTS",
    "MARKET_HISTORY",
    "MARKET_TRENDS",
    "PRICE_HISTORY",
    "APY_TRENDS",
    "HISTORICAL_DATA",
  ],

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Show me USDC market trends on Moonwell" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll show you the historical market data and trends for USDC on Moonwell.",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "What are the APY trends for WETH?" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Let me fetch the APY trends and market data for WETH.",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Show market snapshots for the last 30 days" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll get the market snapshots for all assets over the last 30 days.",
        },
      },
    ],
  ],

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content?.text?.toLowerCase() || "";

    // Check for snapshot/history related keywords
    const snapshotKeywords = [
      "snapshot",
      "history",
      "historical",
      "trend",
      "trends",
      "past",
      "chart",
      "data",
      "analytics",
      "performance",
      "tracking",
    ];
    
    const marketKeywords = [
      "market",
      "apy",
      "rate",
      "price",
      "liquidity",
      "utilization",
      "volume",
    ];
    
    const moonwellKeywords = ["moonwell"];
    
    // Extract potential asset symbols
    const assetKeywords = ["usdc", "weth", "cbeth", "dai", "usdbc", "wsteth", "reth"];

    const hasSnapshotKeyword = snapshotKeywords.some((keyword) =>
      text.includes(keyword),
    );
    const hasMarketKeyword = marketKeywords.some((keyword) =>
      text.includes(keyword),
    );
    const hasMoonwellKeyword = moonwellKeywords.some((keyword) =>
      text.includes(keyword),
    );
    const hasAssetKeyword = assetKeywords.some((keyword) =>
      text.includes(keyword),
    );

    return (
      (hasSnapshotKeyword || hasMarketKeyword) && 
      (hasMoonwellKeyword || hasAssetKeyword || text.includes("lending"))
    );
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
          actions: ["MOONWELL_MARKET_SNAPSHOTS"],
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
      
      // Extract asset from message
      let asset: string | undefined;
      const assetMatches = text.match(/\b(usdc|weth|cbeth|dai|usdbc|wsteth|reth)\b/i);
      if (assetMatches) {
        asset = assetMatches[1].toUpperCase();
      }
      
      // Extract timeframe
      let timeframe: "7d" | "30d" | "90d" = "30d";
      if (text.includes("7 day") || text.includes("week")) {
        timeframe = "7d";
      } else if (text.includes("90 day") || text.includes("3 month")) {
        timeframe = "90d";
      }

      let response = "";

      if (asset) {
        // Get detailed summary for specific asset
        const summary = await moonwellService.getMarketSnapshotSummary(asset, timeframe);
        response = buildAssetSummaryResponse(summary);
      } else {
        // Get snapshots for all assets
        const snapshots = await moonwellService.getMarketSnapshots({
          timeframe,
          includeVolume: true,
          includeUserMetrics: true
        });
        response = buildGeneralSnapshotsResponse(snapshots, timeframe);
      }

      const responseContent: Content = {
        text: response,
        actions: ["MOONWELL_MARKET_SNAPSHOTS"],
        source: message.content.source,
      };

      if (callback) {
        await callback(responseContent);
      }

      return {
        text: response,
        success: true,
        data: asset ? { asset, timeframe } : { timeframe }
      };
    } catch (error: any) {
      console.error("[MarketSnapshotsAction] Error:", error);

      const errorMessage = formatErrorResponse(error);
      const errorContent: Content = {
        text: errorMessage,
        actions: ["MOONWELL_MARKET_SNAPSHOTS"],
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

function buildAssetSummaryResponse(summary: any): string {
  let response = ` **${summary.symbol} Market Analysis (${summary.snapshots.length} days)**\n\n`;
  
  // Price Information
  response += "** Price Information:**\n";
  response += ` **Current Price:** $${summary.currentPrice.toFixed(4)}\n`;
  response += ` **24h Change:** ${summary.priceChange24h >= 0 ? "+" : ""}${summary.priceChange24h.toFixed(2)}%\n`;
  response += ` **7d Change:** ${summary.priceChange7d >= 0 ? "+" : ""}${summary.priceChange7d.toFixed(2)}%\n\n`;
  
  // APY Trends
  response += "** APY Trends:**\n";
  response += `🟢 **Supply APY:** ${summary.apyTrend.supply.current.toFixed(2)}% (7d avg: ${summary.apyTrend.supply.avg7d.toFixed(2)}%)\n`;
  response += ` **Borrow APY:** ${summary.apyTrend.borrow.current.toFixed(2)}% (7d avg: ${summary.apyTrend.borrow.avg7d.toFixed(2)}%)\n\n`;
  
  // Market Metrics
  response += "** Market Metrics:**\n";
  response += ` **Utilization:** ${(summary.utilizationTrend.current * 100).toFixed(1)}% (avg: ${(summary.utilizationTrend.avg7d * 100).toFixed(1)}%)\n`;
  response += ` **Liquidity:** $${formatNumber(summary.liquidityTrend.current)}\n`;
  response += ` **Volume (24h):** $${formatNumber(summary.volumeTrend.total24h)}\n\n`;
  
  // Performance Analysis
  const supplyTrendEmoji = summary.apyTrend.supply.current > summary.apyTrend.supply.avg7d ? "" : "";
  const borrowTrendEmoji = summary.apyTrend.borrow.current > summary.apyTrend.borrow.avg7d ? "" : "";
  
  response += "** Trend Analysis:**\n";
  response += `${supplyTrendEmoji} Supply rates are ${summary.apyTrend.supply.current > summary.apyTrend.supply.avg7d ? "above" : "below"} recent average\n`;
  response += `${borrowTrendEmoji} Borrow rates are ${summary.apyTrend.borrow.current > summary.apyTrend.borrow.avg7d ? "above" : "below"} recent average\n`;
  
  if (summary.utilizationTrend.current > 0.8) {
    response += " High utilization - limited liquidity available\n";
  } else if (summary.utilizationTrend.current < 0.3) {
    response += " Low utilization - plenty of liquidity available\n";
  }
  
  return response;
}

function buildGeneralSnapshotsResponse(snapshots: any[], timeframe: string): string {
  let response = ` **Market Snapshots Overview (${timeframe})**\n\n`;
  
  // Group snapshots by asset
  const assetGroups: { [key: string]: any[] } = {};
  snapshots.forEach(snapshot => {
    if (!assetGroups[snapshot.asset]) {
      assetGroups[snapshot.asset] = [];
    }
    assetGroups[snapshot.asset].push(snapshot);
  });
  
  response += "** Current Market Rates:**\n";
  
  Object.entries(assetGroups).forEach(([asset, assetSnapshots]) => {
    const latest = assetSnapshots[assetSnapshots.length - 1];
    const oldest = assetSnapshots[0];
    
    const supplyChange = ((latest.supplyAPY - oldest.supplyAPY) / oldest.supplyAPY * 100);
    const borrowChange = ((latest.borrowAPY - oldest.borrowAPY) / oldest.borrowAPY * 100);
    
    response += `\n**${asset}:**\n`;
    response += `   Price: $${latest.priceInUSD.toFixed(4)}\n`;
    response += `  🟢 Supply: ${latest.supplyAPY.toFixed(2)}% (${supplyChange >= 0 ? "+" : ""}${supplyChange.toFixed(1)}%)\n`;
    response += `   Borrow: ${latest.borrowAPY.toFixed(2)}% (${borrowChange >= 0 ? "+" : ""}${borrowChange.toFixed(1)}%)\n`;
    response += `   Utilization: ${(latest.utilizationRate * 100).toFixed(1)}%\n`;
  });
  
  response += "\n** Market Insights:**\n";
  
  // Find best supply and borrow rates
  const latestSnapshots = Object.values(assetGroups).map(group => group[group.length - 1]);
  const bestSupply = latestSnapshots.reduce((best, current) => 
    current.supplyAPY > best.supplyAPY ? current : best
  );
  const bestBorrow = latestSnapshots.reduce((best, current) => 
    current.borrowAPY < best.borrowAPY ? current : best
  );
  
  response += ` **Best Supply Rate:** ${bestSupply.asset} at ${bestSupply.supplyAPY.toFixed(2)}%\n`;
  response += ` **Lowest Borrow Rate:** ${bestBorrow.asset} at ${bestBorrow.borrowAPY.toFixed(2)}%\n`;
  
  // Calculate average utilization
  const avgUtilization = latestSnapshots.reduce((sum, s) => sum + s.utilizationRate, 0) / latestSnapshots.length;
  response += ` **Average Utilization:** ${(avgUtilization * 100).toFixed(1)}%\n`;
  
  return response;
}

function formatNumber(value: BigNumber): string {
  const num = value.toNumber();
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(2);
}