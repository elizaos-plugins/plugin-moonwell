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
  description:
    "Provides comprehensive Moonwell position context from all markets (core, Morpho, vaults) for agent decision-making",

  get: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
  ): Promise<ProviderResult> => {
    try {
      const moonwellService = runtime.getService("moonwell") as MoonwellService;

      if (!moonwellService) {
        return { text: "" };
      }

      // Check if this is a comprehensive query that needs fresh data
      const text = (message.content.text || "").toLowerCase();
      const isComprehensiveQuery =
        text.includes("position") ||
        text.includes("portfolio") ||
        text.includes("balance") ||
        text.includes("health") ||
        text.includes("collateral") ||
        text.includes("borrowed") ||
        text.includes("supplied") ||
        text.includes("vault") ||
        text.includes("morpho") ||
        text.includes("total") ||
        text.includes("comprehensive") ||
        text.includes("overview");

      // For comprehensive queries, get full data
      if (isComprehensiveQuery) {
        try {
          const comprehensiveData = await moonwellService.getComprehensiveUserData();
          return { text: buildComprehensiveContext(comprehensiveData) };
        } catch (error) {
          logger.debug("Could not fetch comprehensive data, falling back to core position:", error);
        }
      }

      // Fallback to core position for simpler queries
      let position = moonwellService.getCachedPosition();

      if (!position || isComprehensiveQuery) {
        try {
          position = await moonwellService.getUserPosition();
        } catch (error) {
          logger.debug("Could not fetch Moonwell position:", error);
          return { text: "" };
        }
      }

      // If no position or user not connected, return empty
      if (
        !position ||
        (position.totalSupplied.isZero() && position.totalBorrowed.isZero())
      ) {
        return { text: "" };
      }

      // Build basic context string
      return { text: await buildBasicContext(position, moonwellService) };
    } catch (error) {
      logger.error("Error in position context provider:", error);
      return { text: "" };
    }
  },
};

// Build comprehensive context from all markets
function buildComprehensiveContext(data: any): string {
  let context = "\n\n** Comprehensive Moonwell Portfolio Overview:**\n";
  
  const { portfolioSummary, balanceBreakdown, corePosition, morphoPositions, morphoVaultPortfolio } = data;
  
  // Portfolio Summary
  context += `\n** Portfolio Summary:**\n`;
  context += `- **Total Net Worth:** ${formatUSD(portfolioSummary.totalNetWorth)}\n`;
  context += `- **Total Supplied:** ${formatUSD(portfolioSummary.totalSupplied)}\n`;
  context += `- **Total Borrowed:** ${formatUSD(portfolioSummary.totalBorrowed)}\n`;
  context += `- **Net Position:** ${formatUSD(portfolioSummary.totalSupplied.minus(portfolioSummary.totalBorrowed))}\n`;
  context += `- **Overall Health Factor:** ${portfolioSummary.overallHealthFactor.toFixed(2)} ${getHealthFactorEmoji(portfolioSummary.overallHealthFactor)}\n`;
  
  if (!portfolioSummary.totalRewardsValue.isZero()) {
    context += `- **Total Rewards Value:** ${formatUSD(portfolioSummary.totalRewardsValue)}\n`;
  }
  
  // Market Distribution
  context += `\n** Market Distribution:**\n`;
  const totalValue = portfolioSummary.marketDistribution.core
    .plus(portfolioSummary.marketDistribution.morpho)
    .plus(portfolioSummary.marketDistribution.vaults);
  
  if (!portfolioSummary.marketDistribution.core.isZero()) {
    const corePercent = portfolioSummary.marketDistribution.core.dividedBy(totalValue).multipliedBy(100).toFixed(1);
    context += `- **Core Markets:** ${formatUSD(portfolioSummary.marketDistribution.core)} (${corePercent}%)\n`;
  }
  
  if (!portfolioSummary.marketDistribution.morpho.isZero()) {
    const morphoPercent = portfolioSummary.marketDistribution.morpho.dividedBy(totalValue).multipliedBy(100).toFixed(1);
    context += `- **Morpho Markets:** ${formatUSD(portfolioSummary.marketDistribution.morpho)} (${morphoPercent}%)\n`;
  }
  
  if (!portfolioSummary.marketDistribution.vaults.isZero()) {
    const vaultPercent = portfolioSummary.marketDistribution.vaults.dividedBy(totalValue).multipliedBy(100).toFixed(1);
    context += `- **Vault Positions:** ${formatUSD(portfolioSummary.marketDistribution.vaults)} (${vaultPercent}%)\n`;
  }
  
  // Yield Information
  context += `\n** Yield Overview:**\n`;
  if (portfolioSummary.weightedAverageSupplyAPY > 0) {
    context += `- **Average Supply APY:** ${formatAPY(portfolioSummary.weightedAverageSupplyAPY)}\n`;
  }
  if (portfolioSummary.weightedAverageBorrowAPY > 0) {
    context += `- **Average Borrow APY:** ${formatAPY(portfolioSummary.weightedAverageBorrowAPY)}\n`;
  }
  
  // Risk Assessment
  const riskLevel = getRiskLevel(portfolioSummary.overallHealthFactor);
  if (riskLevel !== "safe") {
    context += `\n** Risk Assessment:** Portfolio is ${riskLevel}.\n`;
    if (portfolioSummary.overallHealthFactor < 1.5) {
      context += "Consider reducing leverage or adding collateral.\n";
    }
  }
  
  // Top Positions (by value)
  const allPositions = [...balanceBreakdown.corePositions, ...balanceBreakdown.morphoPositions, ...balanceBreakdown.vaultPositions]
    .filter(pos => pos.balanceInUSD.gt(0))
    .sort((a, b) => b.balanceInUSD.minus(a.balanceInUSD).toNumber())
    .slice(0, 5);
  
  if (allPositions.length > 0) {
    context += `\n** Top Positions:**\n`;
    allPositions.forEach((pos, index) => {
      const sourceEmoji = pos.source === "core" ? "" : pos.source === "morpho" ? "" : "";
      context += `${index + 1}. ${sourceEmoji} ${pos.symbol}: ${formatUSD(pos.balanceInUSD)}`;
      if (pos.apy) {
        context += ` (${formatAPY(pos.apy)})`;
      }
      if (pos.isCollateral) {
        context += " [Collateral]";
      }
      context += "\n";
    });
  }
  
  // Vault Performance (if applicable)
  if (morphoVaultPortfolio && morphoVaultPortfolio.positions.length > 0) {
    const totalGain = morphoVaultPortfolio.totalUnrealizedGainInUSD;
    if (!totalGain.isZero()) {
      const gainPercent = morphoVaultPortfolio.totalUnrealizedGainPercent;
      context += `\n** Vault Performance:**\n`;
      context += `- **Unrealized P&L:** ${formatUSD(totalGain)} (${gainPercent > 0 ? '+' : ''}${gainPercent.toFixed(2)}%)\n`;
    }
  }
  
  return context;
}

// Build basic context (fallback)
async function buildBasicContext(position: any, moonwellService: any): Promise<string> {
  let context = "\n\n**Current Moonwell Position:**\n";

  // Overall position summary
  context += `- Total Supplied: ${formatUSD(position.totalSupplied)}\n`;
  context += `- Total Borrowed: ${formatUSD(position.totalBorrowed)}\n`;
  context += `- Health Factor: ${position.healthFactor.toFixed(2)} ${getHealthFactorEmoji(position.healthFactor)}\n`;
  context += `- Available to Borrow: ${formatUSD(position.availableToBorrow)}\n`;

  // Try to get reward data
  try {
    const rewards = await moonwellService.getUserRewards();
    if (rewards.rewards.length > 0) {
      context += "\n**Unclaimed Rewards:**\n";
      rewards.rewards.forEach((reward: any) => {
        context += `- ${reward.amount.toFixed(4)} ${reward.symbol}\n`;
      });
    }
  } catch (error) {
    logger.debug("Could not fetch rewards:", error);
  }

  // Supplied assets details
  if (position.supplies.length > 0) {
    context += "\n**Supplied Assets:**\n";
    position.supplies.forEach((supply: any) => {
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
    position.borrows.forEach((borrow: any) => {
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

  return context;
}

function getHealthFactorEmoji(healthFactor: number): string {
  if (healthFactor >= 2.0) return "";
  if (healthFactor >= 1.5) return "";
  if (healthFactor >= 1.2) return "";
  return "";
}

function getRiskLevel(healthFactor: number): string {
  if (healthFactor >= 2.0) return "safe";
  if (healthFactor >= 1.5) return "moderate risk";
  if (healthFactor >= 1.2) return "high risk";
  return "critical - liquidation risk";
}
