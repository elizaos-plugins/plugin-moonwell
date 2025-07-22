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
import { BigNumber } from "bignumber.js";
import { MoonwellService } from "../services/moonwell-service";
import type {
  MorphoVault as SDKMorphoVault,
  MorphoVaultUserPosition as SDKMorphoVaultUserPosition,
  MorphoVaultSnapshot as SDKMorphoVaultSnapshot
} from "@moonwell-fi/moonwell-sdk";
import {
  MorphoVaultSummary,
  MorphoVaultPortfolio,
  MorphoVaultFilters,
} from "../types";

export const morphoVaultsAction: Action = {
  name: "MORPHO_VAULTS",
  similes: [
    "SHOW_MORPHO_VAULTS", 
    "LIST_MORPHO_VAULTS", 
    "GET_MORPHO_VAULTS",
    "MORPHO_VAULT_INFO",
    "VIEW_VAULTS",
    "VAULT_PERFORMANCE",
    "YIELD_VAULTS",
    "MORPHO_YIELDS"
  ],
  description: "Display Morpho vaults with APY, TVL, strategy info, user positions, and performance metrics",
  
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const content = message.content?.text?.toLowerCase() || "";
    
    return (
      content.includes("morpho") && 
      (content.includes("vault") || content.includes("yield")) ||
      content.includes("vault") && 
      (content.includes("apy") || content.includes("performance") || content.includes("strategy"))
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: { [key: string]: unknown },
    callback?: HandlerCallback
  ) => {

    try {
      const service = runtime.getService<MoonwellService>("moonwell");
      if (!service) {
        const responseContent: Content = {
          text: "Moonwell service not available. Please ensure the service is properly initialized.",
          source: message.content.source,
        };
        
        if (callback) {
          await callback(responseContent);
        }
        return;
      }

      const content = message.content?.text?.toLowerCase() || "";

      // Parse filters from message content
      const filters: MorphoVaultFilters = {};
      
      // Asset filter
      if (content.includes("usdc")) filters.asset = "USDC";
      else if (content.includes("eth") || content.includes("weth")) filters.asset = "WETH";
      else if (content.includes("eurc")) filters.asset = "EURC";
      else if (content.includes("btc") || content.includes("wbtc")) filters.asset = "WBTC";

      // APY filter
      const apyMatch = content.match(/apy\s+(?:above|over|more than|>\s*)(\d+(?:\.\d+)?)/);
      if (apyMatch) {
        filters.minAPY = parseFloat(apyMatch[1]);
      }

      // Risk level filter
      if (content.includes("low risk")) filters.maxRiskLevel = "LOW";
      else if (content.includes("medium risk")) filters.maxRiskLevel = "MEDIUM";

      // Strategy filter
      if (content.includes("staking")) filters.strategy = "staking";
      else if (content.includes("farming")) filters.strategy = "farming";
      else if (content.includes("yield")) filters.strategy = "yield";

      // Determine what type of information to show
      const showPositions = content.includes("position") || content.includes("my") || content.includes("balance");
      const showPerformance = content.includes("performance") || content.includes("history") || content.includes("chart");
      const showSummary = content.includes("summary") || content.includes("overview");
      const showPortfolio = content.includes("portfolio") || content.includes("all positions");

      let response = "";

      if (showPortfolio) {
        // Show user's complete vault portfolio
        const portfolio = await service.getMorphoVaultPortfolio();
        response = formatVaultPortfolio(portfolio);
      } else if (showSummary) {
        // Show vault summary
        const summary = await service.getMorphoVaultSummary();
        response = formatVaultSummary(summary);
      } else if (showPerformance) {
        // Show performance for specific vault or all vaults
        const vaults = await service.getMorphoVaults();
        if (vaults.length === 1) {
          const snapshots = await service.getMorphoVaultSnapshots(vaults[0].vaultKey);
          response = formatVaultPerformance(vaults[0], snapshots);
        } else {
          response = formatVaultsList(vaults, false, true);
        }
      } else {
        // Default: Show vaults list with optional user positions
        const vaults = await service.getMorphoVaults();
        const userPositions: Map<string, SDKMorphoVaultUserPosition> = new Map();
        
        if (showPositions) {
          // Get user positions for all vaults
          for (const vault of vaults) {
            try {
              const position = await service.getMorphoVaultUserPosition(vault.vaultKey);
              if (position) {
                userPositions.set(vault.vaultKey, position);
              }
            } catch (error) {
              // Skip positions that can't be fetched (likely no position)
              // console.debug(`No position found for vault ${vault.id}`);
            }
          }
        }

        response = formatVaultsList(vaults, showPositions, false, userPositions);
      }

      const responseContent: Content = {
        text: response,
        source: message.content.source,
      };

      if (callback) {
        await callback(responseContent);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      
      const errorContent: Content = {
        text: `Failed to fetch Morpho vault information: ${errorMessage}`,
        source: message.content.source,
      };

      if (callback) {
        await callback(errorContent);
      }
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Show me Morpho vaults" },
      },
      {
        name: "{{agent}}",
        content: { 
          text: "Here are the available Morpho vaults:\n\n **Moonwell USDC Vault** (mwUSDC)\n APY: 8.25%\n TVL: $5.00M USDC\n Strategy: Optimized Yield\n Risk Level: LOW\n Utilization: 50.0%\n\n **Moonwell ETH Vault** (mwETH)\n APY: 12.50%\n TVL: $8.75M WETH\n Strategy: Leveraged Staking\n Risk Level: MEDIUM\n Utilization: 50.0%\n\n **Moonwell EURC Vault** (mwEURC)\n APY: 15.75%\n TVL: $1.08M EURC\n Strategy: High-Yield Farming\n Risk Level: HIGH\n Utilization: 50.0%"
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Show my Morpho vault positions" },
      },
      {
        name: "{{agent}}",
        content: { 
          text: " **Your Morpho Vault Positions**\n\n **Moonwell USDC Vault** (mwUSDC)\n Your Position: $1,050.00 USDC\n Unrealized Gain: +$50.00 (+5.0%)\n Shares: 1,000.000\n Entry: 7 days ago\n\n **Portfolio Summary:**\n Total Value: $1,050.00\n Total Gain: +$50.00 (+5.0%)\n Risk Exposure: 100% Low Risk"
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Show USDC vaults with APY above 8%" },
      },
      {
        name: "{{agent}}",
        content: { 
          text: " **USDC Vaults with APY > 8%**\n\n **Moonwell USDC Vault** (mwUSDC)\n APY: 8.25%\n TVL: $5.00M USDC\n Strategy: Optimized Yield\n Risk Level: LOW\n Utilization: 50.0%\n Available Capacity: $5.00M USDC"
        },
      },
    ],
  ],
};

function formatVaultsList(
  vaults: SDKMorphoVault[], 
  showPositions: boolean = false, 
  showPerformance: boolean = false,
  userPositions?: Map<string, SDKMorphoVaultUserPosition>
): string {
  if (vaults.length === 0) {
    return "No Morpho vaults found matching your criteria.";
  }

  let response = vaults.length === 1 
    ? " **Morpho Vault Information**\n\n"
    : " **Available Morpho Vaults**\n\n";

  vaults.forEach((vault, index) => {
    const userPosition = userPositions?.get(vault.vaultKey);
    const tvlFormatted = formatCurrency(new BigNumber(vault.totalSupplyUsd), vault.underlyingToken.symbol);
    const availableFormatted = formatCurrency(
      new BigNumber(vault.totalLiquidityUsd), 
      "USD"
    );

    response += `**${vault.vaultToken.name}** (${vault.vaultToken.symbol})\n`;
    response += ` APY: ${(vault.totalApy * 100).toFixed(2)}%\n`;
    response += ` TVL: ${tvlFormatted}\n`;
    response += ` Strategy: Morpho Vault\n`;
    response += ` Performance Fee: ${(vault.performanceFee * 100).toFixed(2)}%\n`;
    response += ` Total Staked: ${formatCurrency(new BigNumber(vault.totalStakedUsd), "USD")}\n`;

    if (vault.totalLiquidityUsd > 0) {
      response += ` Available Liquidity: ${availableFormatted}\n`;
    }

    // Show strategy description for single vault view
    if (vaults.length === 1 && vault.markets.length > 0) {
      response += ` Markets: ${vault.markets.length} markets\n`;
    }

    // Show fees
    if (vault.performanceFee > 0) {
      response += ` Performance Fee: ${(vault.performanceFee * 100).toFixed(2)}%\n`;
    }

    // Show user position if requested and available
    if (showPositions && userPosition) {
      response += `\n **Your Position:**\n`;
      const suppliedUSD = new BigNumber(userPosition.supplied.value).multipliedBy(userPosition.supplied.base);
      response += ` Value: ${formatCurrency(suppliedUSD, "USD")}\n`;
      response += ` Shares: ${formatNumber(new BigNumber(userPosition.suppliedShares.value))}\n`;
      response += ` Token: ${userPosition.underlyingToken.symbol}\n`;
    }

    // Show performance metrics if requested
    if (showPerformance && vaults.length > 1) {
      // For multiple vaults, show basic performance info
      response += ` Performance: Expected based on ${(vault.totalApy * 100).toFixed(2)}% APY\n`;
    }

    if (index < vaults.length - 1) {
      response += "\n";
    }
  });

  return response;
}

function formatVaultSummary(summary: { 
  totalVaults: number; 
  totalTVL: BigNumber; 
  totalTVLInUSD: BigNumber; 
  averageAPY: number;
  vaults: SDKMorphoVault[];
}): string {
  let response = " **Morpho Vaults Summary**\n\n";
  
  response += ` Total Vaults: ${summary.totalVaults}\n`;
  response += ` Total TVL: ${formatCurrency(summary.totalTVLInUSD, "USD")}\n`;
  response += ` Average APY: ${(summary.averageAPY * 100).toFixed(2)}%\n\n`;

  if (summary.vaults.length > 0) {
    const topVault = summary.vaults.reduce((max, vault) => 
      vault.totalApy > max.totalApy ? vault : max
    );
    response += ` **Top Performer:**\n`;
    response += `${topVault.vaultToken.name}\n`;
    response += `APY: ${(topVault.totalApy * 100).toFixed(2)}%\n\n`;
  }

  response += ` **Vault Details:**\n`;
  summary.vaults.forEach(vault => {
    response += `• ${vault.vaultToken.symbol}: ${(vault.totalApy * 100).toFixed(2)}% APY\n`;
  });

  return response;
}

function formatVaultPortfolio(portfolio: {
  userAddress: string;
  positions: SDKMorphoVaultUserPosition[];
  lastUpdated: number;
} | null): string {
  if (!portfolio) {
    return " **Your Morpho Vault Portfolio**\n\nYou don't have any positions in Morpho vaults yet.";
  }

  let response = " **Your Morpho Vault Portfolio**\n\n";
  
  const totalValue = portfolio.positions.reduce((sum, position) => 
    sum.plus(new BigNumber(position.supplied.value).multipliedBy(position.supplied.base)), 
    new BigNumber(0)
  );
  
  response += ` User: ${portfolio.userAddress.slice(0, 6)}...${portfolio.userAddress.slice(-4)}\n`;
  response += ` Total Value: ${formatCurrency(totalValue, "USD")}\n`;
  response += ` Last Updated: ${formatTimeAgo(portfolio.lastUpdated)}\n\n`;

  response += `**Positions:**\n`;
  portfolio.positions.forEach((position, index) => {
    const positionValue = new BigNumber(position.supplied.value).multipliedBy(position.supplied.base);
    response += `\n${index + 1}. **${position.vaultToken.name}**\n`;
    response += `    Value: ${formatCurrency(positionValue, "USD")}\n`;
    response += `    Shares: ${formatNumber(new BigNumber(position.suppliedShares.value))}\n`;
    response += `   🪙 Token: ${position.underlyingToken.symbol}\n`;
  });

  return response;
}

function formatVaultPerformance(vault: SDKMorphoVault, snapshots: SDKMorphoVaultSnapshot[]): string {
  let response = ` **${vault.vaultToken.name} Performance**\n\n`;
  
  if (snapshots.length === 0) {
    response += "No performance data available.";
    return response;
  }

  const latest = snapshots[snapshots.length - 1];
  const oldest = snapshots[0];

  // Calculate performance over the period
  const periodReturn = new BigNumber(latest.totalSupply).minus(new BigNumber(oldest.totalSupply))
    .dividedBy(new BigNumber(oldest.totalSupply))
    .multipliedBy(100);

  const periodDays = Math.floor((latest.timestamp - oldest.timestamp) / (24 * 60 * 60 * 1000));

  response += ` **Current Metrics:**\n`;
  response += ` TVL: ${formatCurrency(new BigNumber(latest.totalSupplyUsd), "USD")}\n`;
  response += ` Total Supply: ${latest.totalSupply}\n`;
  response += ` Total Liquidity: $${latest.totalLiquidityUsd}\n\n`;

  response += ` **Performance (${periodDays} days):**\n`;
  response += ` Total Return: ${periodReturn.toFixed(2)}%\n`;
  response += ` Daily Average: ${periodReturn.dividedBy(periodDays).toFixed(3)}%\n`;

  // Performance data may not be available in snapshots
  if (snapshots.length > 1) {
    response += ` Period Return: ${periodReturn.toFixed(2)}% over ${periodDays} days\n`;
  }

  // Show strategy allocations if available
  // Strategy allocations not available in snapshots
  if (vault.markets && vault.markets.length > 0) {
    response += `\n **Vault Markets:** ${vault.markets.length}\n`;
  }

  return response;
}

function formatCurrency(amount: BigNumber, symbol: string): string {
  const num = amount.toNumber();
  
  if (symbol === "USD") {
    if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(2)}M`;
    } else if (num >= 1000) {
      return `$${(num / 1000).toFixed(1)}K`;
    }
    return `$${num.toFixed(2)}`;
  }
  
  // For other tokens
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M ${symbol}`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K ${symbol}`;
  }
  return `${num.toFixed(2)} ${symbol}`;
}

function formatNumber(amount: BigNumber): string {
  const num = amount.toNumber();
  return num.toLocaleString(undefined, { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 3 
  });
}

function formatGainLoss(gainAmount: BigNumber, gainPercent: number): string {
  const sign = gainPercent >= 0 ? "+" : "";
  const color = gainPercent >= 0 ? "" : "";
  return `${color} ${sign}${formatCurrency(gainAmount, "USD")} (${sign}${gainPercent.toFixed(2)}%)`;
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  const diffMinutes = Math.floor(diffMs / (60 * 1000));

  if (diffDays > 0) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }
  return "Just now";
}