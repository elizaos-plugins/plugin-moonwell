import {
  Action,
  ActionResult,
  Content,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  logger,
} from "@elizaos/core";
import { BigNumber } from "bignumber.js";
import { MoonwellService } from "../services/moonwell-service";
import { WalletService } from "../services/wallet-service";
import { WithdrawParams, WithdrawResult } from "../types";
import {
  validateAmount,
  validateAsset,
  SUPPORTED_ASSETS,
  formatAmount,
  formatUSD,
} from "../utils/validation";
import { formatErrorResponse } from "../utils/error-handler";

export const withdrawAction: Action = {
  name: "MOONWELL_WITHDRAW",
  similes: ["WITHDRAW", "REDEEM", "REMOVE", "TAKE_OUT", "WITHDRAWAL"],
  description: "Withdraw supplied assets from Moonwell protocol",

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
  ): Promise<boolean> => {
    try {
      const text = (message.content.text || "").toLowerCase();

      // Check if this is a withdraw request
      const withdrawKeywords = [
        "withdraw",
        "redeem",
        "remove",
        "take out",
        "withdrawal",
      ];
      const hasWithdrawKeyword = withdrawKeywords.some((keyword) =>
        text.includes(keyword),
      );

      if (!hasWithdrawKeyword) {
        return false;
      }

      // Check if Moonwell is mentioned or if it's a generic withdraw request
      const isMoonwellSpecific = text.includes("moonwell");
      const isGenericWithdrawal =
        withdrawKeywords.some((keyword) => text.includes(keyword)) &&
        !text.includes("aave") &&
        !text.includes("compound");

      return isMoonwellSpecific || isGenericWithdrawal;
    } catch (error) {
      logger.error("Error validating withdraw action:", error);
      return false;
    }
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback,
    _responses?: Memory[],
  ): Promise<ActionResult> => {
    try {
      logger.info("Handling MOONWELL_WITHDRAW action");

      // Get services
      const moonwellService = runtime.getService("moonwell") as MoonwellService;
      const walletService = runtime.getService("wallet") as WalletService;

      if (!moonwellService || !walletService) {
        throw new Error("Required services not available");
      }

      // Parse the message to extract parameters
      const text = message.content.text || "";
      const params = parseWithdrawParams(text);

      // Get current position
      const position = await moonwellService.getUserPosition();

      // Find the supply position for the specified asset
      const supplyPosition = position.supplies.find(
        (s) => s.asset === params.asset,
      );

      if (!supplyPosition || supplyPosition.balance.isZero()) {
        const responseContent: Content = {
          text: `You don't have any ${params.asset} supplied to Moonwell to withdraw.`,
          actions: ["MOONWELL_WITHDRAW"],
          source: message.content.source,
        };

        if (callback) {
          await callback(responseContent);
        }

        return {
          text: responseContent.text,
          success: false,
          data: { error: "NO_SUPPLY" },
        };
      }

      // Determine withdraw amount
      const assetInfo =
        SUPPORTED_ASSETS[params.asset as keyof typeof SUPPORTED_ASSETS];
      let withdrawAmount = params.amount;

      if (
        params.isMax ||
        (params.amount && params.amount.gte(supplyPosition.balance))
      ) {
        withdrawAmount = supplyPosition.balance;
        params.isMax = true;
      }

      const formattedWithdrawAmount = formatAmount(
        withdrawAmount,
        assetInfo.decimals,
      );

      // Check if withdrawal would cause liquidation risk
      if (!position.totalBorrowed.isZero()) {
        // Estimate health factor after withdrawal
        const withdrawValueUSD = withdrawAmount
          .multipliedBy(supplyPosition.balanceInUSD)
          .dividedBy(supplyPosition.balance);

        const newTotalSupplied = position.totalSupplied.minus(withdrawValueUSD);
        const estimatedHealthFactor = newTotalSupplied
          .multipliedBy(position.liquidationThreshold)
          .dividedBy(position.totalBorrowed)
          .toNumber();

        if (estimatedHealthFactor < 1.2) {
          const safeWithdrawAmount = position.totalSupplied.minus(
            position.totalBorrowed
              .multipliedBy(1.5)
              .dividedBy(position.liquidationThreshold),
          );

          const responseContent: Content = {
            text: `Withdrawing ${formattedWithdrawAmount} ${params.asset} would put your position at risk (health factor: ${estimatedHealthFactor.toFixed(2)}). You can safely withdraw up to ${formatUSD(safeWithdrawAmount)} worth of assets.`,
            actions: ["MOONWELL_WITHDRAW"],
            source: message.content.source,
          };

          if (callback) {
            await callback(responseContent);
          }

          return {
            text: responseContent.text,
            success: false,
            data: { error: "LIQUIDATION_RISK" },
          };
        }
      }

      // Execute withdrawal
      logger.info(`Withdrawing ${withdrawAmount.toString()} ${params.asset}`);
      const result: WithdrawResult = await moonwellService.withdraw({
        asset: params.asset,
        amount: withdrawAmount,
        isMax: params.isMax,
      });

      // Get updated position
      const positionAfter = await moonwellService.getUserPosition();

      // Format response
      const formattedSupplyBefore = formatAmount(
        supplyPosition.balance,
        assetInfo.decimals,
      );
      const formattedSupplyAfter = formatAmount(
        result.remainingSupply,
        assetInfo.decimals,
      );
      const totalSuppliedBefore = formatUSD(position.totalSupplied);
      const totalSuppliedAfter = formatUSD(positionAfter.totalSupplied);

      const supplyStatus = result.remainingSupply.isZero()
        ? `\n✅ All ${params.asset} withdrawn from Moonwell!`
        : `\nRemaining ${params.asset} supply: ${formattedSupplyAfter}`;

      const healthFactorInfo = !position.totalBorrowed.isZero()
        ? `\n- Health Factor: ${position.healthFactor.toFixed(2)} → ${result.healthFactor.toFixed(2)}`
        : "";

      const responseText = `Successfully withdrew ${formattedWithdrawAmount} ${params.asset} from Moonwell!

Transaction: ${result.transactionHash}${supplyStatus}

Position Update:
- ${params.asset} Supply: ${formattedSupplyBefore} → ${formattedSupplyAfter}
- Total Supplied: ${totalSuppliedBefore} → ${totalSuppliedAfter}${healthFactorInfo}`;

      const responseContent: Content = {
        text: responseText,
        actions: ["MOONWELL_WITHDRAW"],
        source: message.content.source,
      };

      if (callback) {
        await callback(responseContent);
      }

      return {
        text: responseText,
        success: true,
        data: {
          transactionHash: result.transactionHash,
          withdrawnAmount: formattedWithdrawAmount,
          asset: params.asset,
          remainingSupply: formattedSupplyAfter,
          healthFactor: result.healthFactor,
        },
      };
    } catch (error: any) {
      logger.error("Error in MOONWELL_WITHDRAW action:", error);

      const errorMessage = formatErrorResponse(error);
      const responseContent: Content = {
        text: errorMessage,
        actions: ["MOONWELL_WITHDRAW"],
        source: message.content.source,
      };

      if (callback) {
        await callback(responseContent);
      }

      return {
        text: errorMessage,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  examples: [
    [
      {
        name: "{{user}}",
        content: {
          text: "Withdraw 500 USDC from Moonwell",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll help you withdraw 500 USDC from your Moonwell supply. Processing the withdrawal...",
          actions: ["MOONWELL_WITHDRAW"],
        },
      },
    ],
    [
      {
        name: "{{user}}",
        content: {
          text: "Remove all my DAI from lending",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll withdraw all your DAI from Moonwell lending. Let me process this complete withdrawal...",
          actions: ["MOONWELL_WITHDRAW"],
        },
      },
    ],
    [
      {
        name: "{{user}}",
        content: {
          text: "Take out 0.2 ETH from my supply",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll withdraw 0.2 ETH from your Moonwell supply position. Processing the withdrawal...",
          actions: ["MOONWELL_WITHDRAW"],
        },
      },
    ],
  ],
};

function parseWithdrawParams(text: string): WithdrawParams {
  // Extract amount and asset from the text
  const words = text.split(/\s+/);
  let amount: BigNumber | null = null;
  let asset: string | null = null;
  let isMax = false;

  // Check for "all" or "full" keywords
  const lowerText = text.toLowerCase();
  isMax =
    lowerText.includes("all") ||
    lowerText.includes("full") ||
    lowerText.includes("entire") ||
    lowerText.includes("complete") ||
    lowerText.includes("everything");

  // Look for amount
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const numericValue = parseFloat(word.replace(/,/g, ""));

    if (!isNaN(numericValue) && numericValue > 0) {
      amount = new BigNumber(numericValue);

      // Check next word for asset
      if (i + 1 < words.length) {
        const potentialAsset = words[i + 1].toUpperCase();
        if (Object.keys(SUPPORTED_ASSETS).includes(potentialAsset)) {
          asset = potentialAsset;
        }
      }
    }

    // Also check for asset names
    const upperWord = word.toUpperCase();
    if (Object.keys(SUPPORTED_ASSETS).includes(upperWord)) {
      asset = upperWord;
    }
  }

  // Handle special cases
  if (text.toLowerCase().includes("eth") && !asset) {
    asset = "WETH"; // Convert ETH to WETH
  }

  // For max withdrawal, we still need to know the asset
  if (!asset) {
    throw new Error(
      "Could not determine which asset to withdraw. Please specify like 'withdraw 500 USDC' or 'withdraw all DAI'",
    );
  }

  // If max withdrawal, amount can be set to a large value (will be capped at supply amount)
  if (isMax && !amount) {
    amount = new BigNumber("999999999999"); // Large number
  }

  // Validate we have amount
  if (!amount) {
    throw new Error(
      "Could not parse withdrawal amount. Please specify like '500 USDC' or use 'all' for complete withdrawal",
    );
  }

  return {
    amount: validateAmount(amount),
    asset: validateAsset(asset),
    isMax,
  };
}
