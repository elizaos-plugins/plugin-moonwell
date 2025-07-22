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

export const enhancedBalancesAction: Action = {
  name: "MOONWELL_ENHANCED_BALANCES",
  description: "View comprehensive user balances across all Moonwell markets (core, Morpho, vaults)",

  similes: [
    "MOONWELL_ENHANCED_BALANCES",
    "COMPREHENSIVE_PORTFOLIO",
    "ALL_BALANCES",
    "PORTFOLIO_OVERVIEW",
    "TOTAL_HOLDINGS",
    "CROSS_MARKET_VIEW",
  ],

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Show me all my holdings across Moonwell" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll show you your comprehensive portfolio across all Moonwell markets.",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "What's my complete portfolio breakdown?" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Let me get your complete portfolio breakdown including wallet, core markets, Morpho, and vaults.",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Show comprehensive portfolio view" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll provide a comprehensive view of your entire Moonwell ecosystem holdings.",
        },
      },
    ],
  ],

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content?.text?.toLowerCase() || "";

    // Check for comprehensive/enhanced keywords
    const comprehensiveKeywords = [
      "comprehensive",
      "complete",
      "all",
      "total",
      "enhanced",
      "full",
      "entire",
      "cross-market",
      "overview",
      "breakdown",
    ];
    
    const portfolioKeywords = [
      "portfolio",
      "holdings",
      "balances",
      "positions",
      "assets",
    ];
    
    const moonwellKeywords = ["moonwell"];

    const hasComprehensiveKeyword = comprehensiveKeywords.some((keyword) =>
      text.includes(keyword),
    );
    const hasPortfolioKeyword = portfolioKeywords.some((keyword) =>
      text.includes(keyword),
    );
    const hasMoonwellKeyword = moonwellKeywords.some((keyword) =>
      text.includes(keyword),
    );

    return (
      (hasComprehensiveKeyword || hasPortfolioKeyword) && 
      (hasMoonwellKeyword || text.includes("lending") || text.includes("defi"))
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
          actions: ["MOONWELL_ENHANCED_BALANCES"],
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
      
      // Determine what to include based on user request
      let includeWallet = true;
      let includeCore = true;
      let includeMorpho = true;
      let includeVaults = true;
      
      if (text.includes("wallet")) {
        includeCore = false;
        includeMorpho = false;
        includeVaults = false;
      } else if (text.includes("core") || text.includes("lending")) {
        includeWallet = false;
        includeMorpho = false;
        includeVaults = false;
      } else if (text.includes("morpho")) {
        includeWallet = false;
        includeCore = false;
        includeVaults = false;
      } else if (text.includes("vault")) {
        includeWallet = false;
        includeCore = false;
        includeMorpho = false;
      }

      // Get comprehensive balance data
      const balanceBreakdown = await moonwellService.getAllUserBalances({
        includeWallet,
        includeCore,
        includeMorpho,
        includeVaults,
        minBalanceThreshold: new BigNumber(0.01) // $0.01 minimum
      });

      const response = buildEnhancedBalancesResponse(balanceBreakdown);

      const responseContent: Content = {
        text: response,
        actions: ["MOONWELL_ENHANCED_BALANCES"],
        source: message.content.source,
      };

      if (callback) {
        await callback(responseContent);
      }

      return {
        text: response,
        success: true,
        data: { balanceBreakdown }
      };
    } catch (error: any) {
      console.error("[EnhancedBalancesAction] Error:", error);

      const errorMessage = formatErrorResponse(error);
      const errorContent: Content = {
        text: errorMessage,
        actions: ["MOONWELL_ENHANCED_BALANCES"],
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

function buildEnhancedBalancesResponse(breakdown: any): string {
  let response = " **Comprehensive Portfolio Overview**\\n\\n";
  
  // Portfolio Summary
  response += "** Portfolio Summary:**\\n";
  response += ` **Total Portfolio Value:** $${formatNumber(breakdown.totalBalanceInUSD)}\\n`;
  
  const distributions = [];
  if (!breakdown.totalWalletValueInUSD.isZero()) {
    const walletPercent = breakdown.totalWalletValueInUSD.dividedBy(breakdown.totalBalanceInUSD).multipliedBy(100).toFixed(1);
    distributions.push(`Wallet: $${formatNumber(breakdown.totalWalletValueInUSD)} (${walletPercent}%)`);
  }
  
  if (!breakdown.totalCoreValueInUSD.isZero()) {
    const corePercent = breakdown.totalCoreValueInUSD.dividedBy(breakdown.totalBalanceInUSD).multipliedBy(100).toFixed(1);
    distributions.push(`Core: $${formatNumber(breakdown.totalCoreValueInUSD)} (${corePercent}%)`);
  }
  
  if (!breakdown.totalMorphoValueInUSD.isZero()) {
    const morphoPercent = breakdown.totalMorphoValueInUSD.dividedBy(breakdown.totalBalanceInUSD).multipliedBy(100).toFixed(1);
    distributions.push(`Morpho: $${formatNumber(breakdown.totalMorphoValueInUSD)} (${morphoPercent}%)`);
  }
  
  if (!breakdown.totalVaultValueInUSD.isZero()) {
    const vaultPercent = breakdown.totalVaultValueInUSD.dividedBy(breakdown.totalBalanceInUSD).multipliedBy(100).toFixed(1);
    distributions.push(`Vaults: $${formatNumber(breakdown.totalVaultValueInUSD)} (${vaultPercent}%)`);
  }
  
  if (distributions.length > 1) {
    response += "** Distribution:**\\n";
    distributions.forEach(dist => {
      response += `  • ${dist}\\n`;
    });
    response += "\\n";
  }
  
  // Wallet Balances
  if (breakdown.walletBalances.length > 0) {
    response += "** Wallet Balances:**\\n";
    breakdown.walletBalances
      .sort((a: any, b: any) => b.balanceInUSD.minus(a.balanceInUSD).toNumber())
      .forEach((balance: any) => {
        response += ` ${balance.symbol}: ${formatTokenAmount(balance.balance)} ($${formatNumber(balance.balanceInUSD)})\\n`;
      });
    response += "\\n";
  }
  
  // Core Market Positions
  if (breakdown.corePositions.length > 0) {
    const supplies = breakdown.corePositions.filter((pos: any) => pos.balance.gt(0));
    const borrows = breakdown.corePositions.filter((pos: any) => pos.balance.lt(0));
    
    if (supplies.length > 0) {
      response += "** Core Market Supplies:**\\n";
      supplies
        .sort((a: any, b: any) => b.balanceInUSD.minus(a.balanceInUSD).toNumber())
        .forEach((supply: any) => {
          const collateralIcon = supply.isCollateral ? "" : "";
          response += ` ${supply.symbol}: ${formatTokenAmount(supply.balance)} ($${formatNumber(supply.balanceInUSD)})\\n`;
          response += `   APY: ${supply.apy?.toFixed(2) || "N/A"}% | Collateral: ${collateralIcon}\\n`;
        });
      response += "\\n";
    }
    
    if (borrows.length > 0) {
      response += "** Core Market Borrows:**\\n";
      borrows
        .sort((a: any, b: any) => a.balanceInUSD.minus(b.balanceInUSD).toNumber()) // Most debt first (most negative)
        .forEach((borrow: any) => {
          response += ` ${borrow.symbol}: ${formatTokenAmount(borrow.balance.abs())} ($${formatNumber(borrow.balanceInUSD.abs())})\\n`;
          response += `   APY: ${borrow.apy?.toFixed(2) || "N/A"}%\\n`;
        });
      response += "\\n";
    }
  }
  
  // Morpho Positions
  if (breakdown.morphoPositions.length > 0) {
    const morphoSupplies = breakdown.morphoPositions.filter((pos: any) => pos.balance.gt(0));
    const morphoBorrows = breakdown.morphoPositions.filter((pos: any) => pos.balance.lt(0));
    
    if (morphoSupplies.length > 0) {
      response += "** Morpho Market Supplies:**\\n";
      morphoSupplies
        .sort((a: any, b: any) => b.balanceInUSD.minus(a.balanceInUSD).toNumber())
        .forEach((supply: any) => {
          const collateralIcon = supply.isCollateral ? "" : "";
          response += ` ${supply.symbol}: ${formatTokenAmount(supply.balance)} ($${formatNumber(supply.balanceInUSD)})\\n`;
          response += `   APY: ${supply.apy?.toFixed(2) || "N/A"}% | Collateral: ${collateralIcon}\\n`;
          if (supply.marketId) {
            response += `   Market: ${supply.marketId.substring(0, 8)}...\\n`;
          }
        });
      response += "\\n";
    }
    
    if (morphoBorrows.length > 0) {
      response += "** Morpho Market Borrows:**\\n";
      morphoBorrows
        .sort((a: any, b: any) => a.balanceInUSD.minus(b.balanceInUSD).toNumber())
        .forEach((borrow: any) => {
          response += ` ${borrow.symbol}: ${formatTokenAmount(borrow.balance.abs())} ($${formatNumber(borrow.balanceInUSD.abs())})\\n`;
          response += `   APY: ${borrow.apy?.toFixed(2) || "N/A"}%\\n`;
          if (borrow.marketId) {
            response += `   Market: ${borrow.marketId.substring(0, 8)}...\\n`;
          }
        });
      response += "\\n";
    }
  }
  
  // Vault Positions
  if (breakdown.vaultPositions.length > 0) {
    response += "** Vault Positions:**\\n";
    breakdown.vaultPositions
      .sort((a: any, b: any) => b.balanceInUSD.minus(a.balanceInUSD).toNumber())
      .forEach((vault: any) => {
        response += ` ${vault.symbol}: ${formatTokenAmount(vault.balance)} ($${formatNumber(vault.balanceInUSD)})\\n`;
        response += `   APY: ${vault.apy?.toFixed(2) || "N/A"}%\\n`;
        if (vault.vaultId) {
          response += `   Vault: ${vault.vaultId}\\n`;
        }
      });
    response += "\\n";
  }
  
  // Summary insights
  if (!breakdown.totalBalanceInUSD.isZero()) {
    response += "** Portfolio Insights:**\\n";
    
    const netPosition = breakdown.corePositions
      .concat(breakdown.morphoPositions)
      .reduce((sum: BigNumber, pos: any) => sum.plus(pos.balanceInUSD), new BigNumber(0));
    
    if (netPosition.gt(0)) {
      response += ` Net lending position: $${formatNumber(netPosition)}\\n`;
    } else if (netPosition.lt(0)) {
      response += ` Net borrowing position: $${formatNumber(netPosition.abs())}\\n`;
    }
    
    // Calculate total APY-earning assets
    const apyEarningAssets = [
      ...breakdown.corePositions.filter((pos: any) => pos.balance.gt(0) && pos.apy > 0),
      ...breakdown.morphoPositions.filter((pos: any) => pos.balance.gt(0) && pos.apy > 0),
      ...breakdown.vaultPositions.filter((pos: any) => pos.apy > 0)
    ];
    
    if (apyEarningAssets.length > 0) {
      const weightedAPY = apyEarningAssets.reduce((sum, asset) => {
        return sum + (asset.apy * asset.balanceInUSD.toNumber());
      }, 0) / apyEarningAssets.reduce((sum, asset) => sum + asset.balanceInUSD.toNumber(), 0);
      
      response += ` Portfolio-weighted APY: ${weightedAPY.toFixed(2)}%\\n`;
    }
    
    const totalPositions = breakdown.walletBalances.length + 
                          breakdown.corePositions.length + 
                          breakdown.morphoPositions.length + 
                          breakdown.vaultPositions.length;
    
    response += ` Total positions: ${totalPositions}\\n`;
  }
  
  return response;
}

function formatNumber(value: BigNumber): string {
  const num = value.toNumber();
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(2);
}

function formatTokenAmount(value: BigNumber): string {
  const num = value.toNumber();
  if (Math.abs(num) >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (Math.abs(num) >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  if (Math.abs(num) < 0.01) return `${num.toExponential(2)}`;
  return num.toFixed(4);
}