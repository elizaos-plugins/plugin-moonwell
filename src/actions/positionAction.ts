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

export const positionAction: Action = {
  name: "MOONWELL_POSITION",
  description: "Check user's Moonwell lending position and health factor",

  similes: [
    "MOONWELL_POSITION",
    "POSITION",
    "BALANCE",
    "HEALTH",
    "SUPPLIES",
    "BORROWS",
  ],

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "What's my Moonwell position?" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll check your current Moonwell position for you.",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Check my health factor on Moonwell" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Let me check your health factor on Moonwell.",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Show me my Moonwell balances" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll show you your Moonwell balances and position details.",
        },
      },
    ],
  ],

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content?.text?.toLowerCase() || "";

    // Check for position-related keywords
    const positionKeywords = [
      "position",
      "balance",
      "health",
      "status",
      "my",
      "supplies",
      "borrows",
      "debt",
    ];
    const moonwellKeywords = ["moonwell"];

    const hasPositionKeyword = positionKeywords.some((keyword) =>
      text.includes(keyword),
    );
    const hasMoonwellKeyword = moonwellKeywords.some((keyword) =>
      text.includes(keyword),
    );

    return (
      hasPositionKeyword && (hasMoonwellKeyword || text.includes("lending"))
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
          actions: ["MOONWELL_POSITION"],
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

      // Fetch user position
      const position = await moonwellService.getUserPosition();

      if (!position) {
        const responseContent: Content = {
          text: "Unable to fetch your Moonwell position. Please ensure your wallet is connected.",
          actions: ["MOONWELL_POSITION"],
          source: message.content.source,
        };

        if (callback) {
          await callback(responseContent);
        }

        return {
          text: responseContent.text,
          success: false,
          data: { error: "POSITION_NOT_FOUND" },
        };
      }

      // Check if user has any position
      const hasPosition =
        position.totalSupplied.isGreaterThan(0) ||
        position.totalBorrowed.isGreaterThan(0);

      if (!hasPosition) {
        const responseContent: Content = {
          text: "You don't have any active positions on Moonwell. Start by supplying assets to earn yield!",
          actions: ["MOONWELL_POSITION"],
          source: message.content.source,
        };

        if (callback) {
          await callback(responseContent);
        }

        return {
          text: responseContent.text,
          success: true,
          data: { hasPosition: false },
        };
      }

      // Format response
      let response = "<� **Your Moonwell Position**\n\n";

      // Health Factor with visual indicator
      const healthEmoji = getHealthEmoji(position.healthFactor);
      response += `${healthEmoji} **Health Factor:** ${position.healthFactor.toFixed(2)}\n`;
      response += getHealthFactorMessage(position.healthFactor) + "\n\n";

      // Summary
      response += "**=� Summary:**\n";
      response += `" Total Supplied: $${formatNumber(position.totalSupplied)}\n`;
      response += `" Total Borrowed: $${formatNumber(position.totalBorrowed)}\n`;
      response += `" Available to Borrow: $${formatNumber(position.availableToBorrow)}\n\n`;

      // Supplied assets
      if (position.supplies.length > 0) {
        response += "**=� Supplied Assets:**\n";
        for (const supply of position.supplies) {
          const collateralIcon = supply.isCollateral ? "" : "L";
          response += `" ${supply.symbol}: ${formatTokenAmount(supply.balance)} ($${formatNumber(supply.balanceInUSD)})\n`;
          response += `  - APY: ${supply.apy.toFixed(2)}% | Collateral: ${collateralIcon}\n`;
        }
        response += "\n";
      }

      // Borrowed assets
      if (position.borrows.length > 0) {
        response += "**=� Borrowed Assets:**\n";
        for (const borrow of position.borrows) {
          response += `" ${borrow.symbol}: ${formatTokenAmount(borrow.balance)} ($${formatNumber(borrow.balanceInUSD)})\n`;
          response += `  - APY: ${borrow.apy.toFixed(2)}%\n`;
        }
        response += "\n";
      }

      // Earnings calculation
      const dailyEarnings = calculateDailyEarnings(position);
      if (dailyEarnings.net !== 0) {
        response += "**=� Estimated Daily Earnings:**\n";
        response += `" Supply Interest: +$${dailyEarnings.supply.toFixed(2)}\n`;
        response += `" Borrow Interest: -$${dailyEarnings.borrow.toFixed(2)}\n`;
        response += `" Net: ${dailyEarnings.net >= 0 ? "+" : ""}$${dailyEarnings.net.toFixed(2)}\n\n`;
      }

      // Recommendations
      response += "**=� Recommendations:**\n";
      if (position.healthFactor < 1.5) {
        response +=
          "� Your health factor is low. Consider repaying some debt or supplying more collateral.\n";
      }
      if (position.availableToBorrow.isGreaterThan(1000)) {
        response +=
          "=� You have borrowing capacity available. Consider leveraging for higher yields.\n";
      }
      if (
        position.supplies.some(
          (s) => !s.isCollateral && s.balanceInUSD.isGreaterThan(100),
        )
      ) {
        response +=
          "=� Some of your supplied assets aren't enabled as collateral. Enable them to increase borrowing power.\n";
      }

      // Note: Rewards functionality not implemented in service yet

      const responseContent: Content = {
        text: response,
        actions: ["MOONWELL_POSITION"],
        source: message.content.source,
      };

      if (callback) {
        await callback(responseContent);
      }

      return {
        text: response,
        success: true,
        data: { position },
      };
    } catch (error: any) {
      console.error("[PositionAction] Error:", error);

      const errorMessage = formatErrorResponse(error);
      const errorContent: Content = {
        text: errorMessage,
        actions: ["MOONWELL_POSITION"],
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

function formatTokenAmount(value: BigNumber): string {
  const num = value.toNumber();
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  if (num < 0.01) return `${num.toExponential(2)}`;
  return num.toFixed(4);
}

function getHealthEmoji(healthFactor: number): string {
  if (healthFactor >= 2) return "=�";
  if (healthFactor >= 1.5) return "=�";
  if (healthFactor >= 1.2) return "=�";
  if (healthFactor >= 1.1) return "=�";
  return "=4";
}

function getHealthFactorMessage(healthFactor: number): string {
  if (healthFactor >= 2) return "Excellent health - Very safe position";
  if (healthFactor >= 1.5) return "Good health - Safe position";
  if (healthFactor >= 1.2) return "Fair health - Monitor closely";
  if (healthFactor >= 1.1) return "Low health - Risk of liquidation";
  return "Critical - High liquidation risk!";
}

function calculateDailyEarnings(position: any): {
  supply: number;
  borrow: number;
  net: number;
} {
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
    net: supplyEarnings - borrowCosts,
  };
}

// Comprehensive response builder
function buildComprehensiveResponse(data: any): string {
  const { portfolioSummary, balanceBreakdown, corePosition, morphoPositions, morphoVaultPortfolio } = data;
  
  let response = " **Your Comprehensive Moonwell Portfolio**\n\n";
  
  // Portfolio Overview
  response += "** Portfolio Overview:**\n";
  response += ` **Total Net Worth:** $${formatNumber(portfolioSummary.totalNetWorth)}\n`;
  response += ` **Total Supplied:** $${formatNumber(portfolioSummary.totalSupplied)}\n`;
  response += ` **Total Borrowed:** $${formatNumber(portfolioSummary.totalBorrowed)}\n`;
  response += ` **Net Position:** $${formatNumber(portfolioSummary.totalSupplied.minus(portfolioSummary.totalBorrowed))}\n`;
  const healthEmoji = getHealthEmoji(portfolioSummary.overallHealthFactor);
  response += `${healthEmoji} **Overall Health Factor:** ${portfolioSummary.overallHealthFactor.toFixed(2)}\n\n`;
  
  // Market Distribution
  response += "** Market Distribution:**\n";
  const totalValue = portfolioSummary.marketDistribution.core
    .plus(portfolioSummary.marketDistribution.morpho)
    .plus(portfolioSummary.marketDistribution.vaults);
  
  if (!portfolioSummary.marketDistribution.core.isZero()) {
    const corePercent = portfolioSummary.marketDistribution.core.dividedBy(totalValue).multipliedBy(100).toFixed(1);
    response += ` **Core Markets:** $${formatNumber(portfolioSummary.marketDistribution.core)} (${corePercent}%)\n`;
  }
  
  if (!portfolioSummary.marketDistribution.morpho.isZero()) {
    const morphoPercent = portfolioSummary.marketDistribution.morpho.dividedBy(totalValue).multipliedBy(100).toFixed(1);
    response += ` **Morpho Markets:** $${formatNumber(portfolioSummary.marketDistribution.morpho)} (${morphoPercent}%)\n`;
  }
  
  if (!portfolioSummary.marketDistribution.vaults.isZero()) {
    const vaultPercent = portfolioSummary.marketDistribution.vaults.dividedBy(totalValue).multipliedBy(100).toFixed(1);
    response += ` **Vault Positions:** $${formatNumber(portfolioSummary.marketDistribution.vaults)} (${vaultPercent}%)\n`;
  }
  response += "\n";
  
  // Yield Information
  if (portfolioSummary.weightedAverageSupplyAPY > 0 || portfolioSummary.weightedAverageBorrowAPY > 0) {
    response += "** Yield Summary:**\n";
    if (portfolioSummary.weightedAverageSupplyAPY > 0) {
      response += ` **Average Supply APY:** ${portfolioSummary.weightedAverageSupplyAPY.toFixed(2)}%\n`;
    }
    if (portfolioSummary.weightedAverageBorrowAPY > 0) {
      response += ` **Average Borrow APY:** ${portfolioSummary.weightedAverageBorrowAPY.toFixed(2)}%\n`;
    }
    response += "\n";
  }
  
  // Top Positions
  const allPositions = [
    ...balanceBreakdown.corePositions.filter((p: any) => p.balanceInUSD.gt(0)),
    ...balanceBreakdown.morphoPositions.filter((p: any) => p.balanceInUSD.gt(0)),
    ...balanceBreakdown.vaultPositions.filter((p: any) => p.balanceInUSD.gt(0))
  ]
    .sort((a: any, b: any) => b.balanceInUSD.minus(a.balanceInUSD).toNumber())
    .slice(0, 5);
  
  if (allPositions.length > 0) {
    response += "** Top Positions:**\n";
    allPositions.forEach((pos: any, index: number) => {
      const sourceEmoji = pos.source === "core" ? "" : pos.source === "morpho" ? "" : "";
      response += `${index + 1}. ${sourceEmoji} ${pos.symbol}: $${formatNumber(pos.balanceInUSD)}`;
      if (pos.apy && pos.apy > 0) {
        response += ` (${pos.apy.toFixed(2)}%)`;
      }
      if (pos.isCollateral) {
        response += " ✓";
      }
      response += "\n";
    });
    response += "\n";
  }
  
  // Vault Performance
  if (morphoVaultPortfolio && morphoVaultPortfolio.positions.length > 0) {
    const totalGain = morphoVaultPortfolio.totalUnrealizedGainInUSD;
    if (!totalGain.isZero()) {
      const gainPercent = morphoVaultPortfolio.totalUnrealizedGainPercent;
      const performanceEmoji = gainPercent >= 0 ? "" : "";
      response += "** Vault Performance:**\n";
      response += `${performanceEmoji} **Unrealized P&L:** $${formatNumber(totalGain)} (${gainPercent > 0 ? '+' : ''}${gainPercent.toFixed(2)}%)\n\n`;
    }
  }
  
  // Risk Assessment
  const riskLevel = getRiskLevel(portfolioSummary.overallHealthFactor);
  if (riskLevel !== "safe") {
    response += "** Risk Assessment:**\n";
    response += `Your portfolio is ${riskLevel}.\n`;
    if (portfolioSummary.overallHealthFactor < 1.5) {
      response += "Consider reducing leverage or adding collateral across your positions.\n";
    }
    response += "\n";
  }
  
  // Rewards
  if (!portfolioSummary.totalRewardsValue.isZero()) {
    response += "** Total Rewards Available:**\n";
    response += ` **Value:** $${formatNumber(portfolioSummary.totalRewardsValue)}\n`;
    response += "Use the claim rewards action to collect them!\n\n";
  }
  
  return response;
}

function buildBasicResponse(position: any): string {
  let response = " **Your Moonwell Position**\n\n";

  // Health Factor with visual indicator
  const healthEmoji = getHealthEmoji(position.healthFactor);
  response += `${healthEmoji} **Health Factor:** ${position.healthFactor.toFixed(2)}\n`;
  response += getHealthFactorMessage(position.healthFactor) + "\n\n";

  // Summary
  response += "** Summary:**\n";
  response += ` Total Supplied: $${formatNumber(position.totalSupplied)}\n`;
  response += ` Total Borrowed: $${formatNumber(position.totalBorrowed)}\n`;
  response += ` Available to Borrow: $${formatNumber(position.availableToBorrow)}\n\n`;

  // Supplied assets
  if (position.supplies.length > 0) {
    response += "** Supplied Assets:**\n";
    for (const supply of position.supplies) {
      const collateralIcon = supply.isCollateral ? "✓" : "✗";
      response += ` ${supply.symbol}: ${formatTokenAmount(supply.balance)} ($${formatNumber(supply.balanceInUSD)})\n`;
      response += `  - APY: ${supply.apy.toFixed(2)}% | Collateral: ${collateralIcon}\n`;
    }
    response += "\n";
  }

  // Borrowed assets
  if (position.borrows.length > 0) {
    response += "** Borrowed Assets:**\n";
    for (const borrow of position.borrows) {
      response += ` ${borrow.symbol}: ${formatTokenAmount(borrow.balance)} ($${formatNumber(borrow.balanceInUSD)})\n`;
      response += `  - APY: ${borrow.apy.toFixed(2)}%\n`;
    }
    response += "\n";
  }

  // Earnings calculation
  const dailyEarnings = calculateDailyEarnings(position);
  if (dailyEarnings.net !== 0) {
    response += "** Estimated Daily Earnings:**\n";
    response += ` Supply Interest: +$${dailyEarnings.supply.toFixed(2)}\n`;
    response += ` Borrow Interest: -$${dailyEarnings.borrow.toFixed(2)}\n`;
    response += ` Net: ${dailyEarnings.net >= 0 ? "+" : ""}$${dailyEarnings.net.toFixed(2)}\n\n`;
  }

  // Recommendations
  response += "** Recommendations:**\n";
  if (position.healthFactor < 1.5) {
    response +=
      " Your health factor is low. Consider repaying debt or adding collateral.\n";
  }
  if (position.availableToBorrow.isGreaterThan(1000)) {
    response +=
      " You have borrowing capacity. Consider leveraging for higher yields.\n";
  }
  if (
    position.supplies.some(
      (s: any) => !s.isCollateral && s.balanceInUSD.isGreaterThan(100),
    )
  ) {
    response +=
      " Enable unused collateral to increase borrowing power.\n";
  }

  response += "\nTip: Use 'comprehensive portfolio' for full cross-market view!";

  return response;
}

function getRiskLevel(healthFactor: number): string {
  if (healthFactor >= 2.0) return "safe";
  if (healthFactor >= 1.5) return "moderate risk";
  if (healthFactor >= 1.2) return "high risk";
  return "critical - liquidation risk";
}
