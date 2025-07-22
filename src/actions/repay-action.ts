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
import { RepayParams, RepayResult } from "../types";
import {
  validateAmount,
  validateAsset,
  SUPPORTED_ASSETS,
  formatAmount,
  formatUSD,
} from "../utils/validation";
import { formatErrorResponse } from "../utils/error-handler";

export const repayAction: Action = {
  name: "MOONWELL_REPAY",
  similes: ["REPAY", "PAY_BACK", "PAYBACK", "REPAY_LOAN", "REPAY_DEBT"],
  description: "Repay borrowed assets to Moonwell protocol",

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
  ): Promise<boolean> => {
    try {
      const text = (message.content.text || "").toLowerCase();

      // Check if this is a repay request
      const repayKeywords = [
        "repay",
        "pay back",
        "payback",
        "repay loan",
        "repay debt",
        "pay off",
      ];
      const hasRepayKeyword = repayKeywords.some((keyword) =>
        text.includes(keyword),
      );

      if (!hasRepayKeyword) {
        return false;
      }

      // Check if Moonwell is mentioned or if it's a generic repay request
      const isMoonwellSpecific = text.includes("moonwell");
      const isGenericRepayment =
        repayKeywords.some((keyword) => text.includes(keyword)) &&
        !text.includes("aave") &&
        !text.includes("compound");

      return isMoonwellSpecific || isGenericRepayment;
    } catch (error) {
      logger.error("Error validating repay action:", error);
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
      logger.info("Handling MOONWELL_REPAY action");

      // Get services
      const moonwellService = runtime.getService("moonwell") as MoonwellService;
      const walletService = runtime.getService("wallet") as WalletService;

      if (!moonwellService || !walletService) {
        throw new Error("Required services not available");
      }

      // Parse the message to extract parameters
      const text = message.content.text || "";
      const params = parseRepayParams(text);

      // Get current position
      const position = await moonwellService.getUserPosition();

      // Find the debt for the specified asset
      const debtPosition = position.borrows.find(
        (b) => b.asset === params.asset,
      );

      if (!debtPosition || debtPosition.balance.isZero()) {
        const responseContent: Content = {
          text: `You don't have any ${params.asset} debt to repay on Moonwell.`,
          actions: ["MOONWELL_REPAY"],
          source: message.content.source,
        };

        if (callback) {
          await callback(responseContent);
        }

        return {
          text: responseContent.text,
          success: false,
          data: { error: "NO_DEBT" },
        };
      }

      // Determine repay amount
      const assetInfo =
        SUPPORTED_ASSETS[params.asset as keyof typeof SUPPORTED_ASSETS];
      let repayAmount = params.amount;

      if (
        params.isMax ||
        (params.amount && params.amount.gte(debtPosition.balance))
      ) {
        repayAmount = debtPosition.balance;
        params.isMax = true;
      }

      // Check wallet balance
      const walletAddress = await walletService.getAddress();
      const balance = await walletService.getBalance(assetInfo.address);
      const formattedBalance = formatAmount(balance, assetInfo.decimals);
      const formattedRepayAmount = formatAmount(
        repayAmount,
        assetInfo.decimals,
      );

      if (repayAmount.gt(balance)) {
        const responseContent: Content = {
          text: `Insufficient ${params.asset} balance for repayment. You have ${formattedBalance} ${params.asset} but need ${formattedRepayAmount} to repay.`,
          actions: ["MOONWELL_REPAY"],
          source: message.content.source,
        };

        if (callback) {
          await callback(responseContent);
        }

        return {
          text: responseContent.text,
          success: false,
          data: { error: "INSUFFICIENT_BALANCE" },
        };
      }

      // Execute repay
      logger.info(`Repaying ${repayAmount.toString()} ${params.asset}`);
      const result: RepayResult = await moonwellService.repay({
        asset: params.asset,
        amount: repayAmount,
        isMax: params.isMax,
      });

      // Get updated position
      const positionAfter = await moonwellService.getUserPosition();

      // Format response
      const formattedDebtBefore = formatAmount(
        debtPosition.balance,
        assetInfo.decimals,
      );
      const formattedDebtAfter = formatAmount(
        result.remainingDebt,
        assetInfo.decimals,
      );
      const totalBorrowedBefore = formatUSD(position.totalBorrowed);
      const totalBorrowedAfter = formatUSD(positionAfter.totalBorrowed);

      const debtStatus = result.remainingDebt.isZero()
        ? `\n ${params.asset} debt fully repaid!`
        : `\nRemaining ${params.asset} debt: ${formattedDebtAfter}`;

      const responseText = `Successfully repaid ${formattedRepayAmount} ${params.asset} to Moonwell!

Transaction: ${result.transactionHash}${debtStatus}

Position Update:
- ${params.asset} Debt: ${formattedDebtBefore} → ${formattedDebtAfter}
- Total Borrowed: ${totalBorrowedBefore} → ${totalBorrowedAfter}
- Health Factor: ${position.healthFactor.toFixed(2)} → ${result.healthFactor.toFixed(2)}`;

      const responseContent: Content = {
        text: responseText,
        actions: ["MOONWELL_REPAY"],
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
          repaidAmount: formattedRepayAmount,
          asset: params.asset,
          remainingDebt: formattedDebtAfter,
          healthFactor: result.healthFactor,
          debtFullyRepaid: result.remainingDebt.isZero(),
        },
      };
    } catch (error: any) {
      logger.error("Error in MOONWELL_REPAY action:", error);

      const errorMessage = formatErrorResponse(error);
      const responseContent: Content = {
        text: errorMessage,
        actions: ["MOONWELL_REPAY"],
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
          text: "Repay 300 USDC to Moonwell",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll help you repay 300 USDC to reduce your Moonwell debt. Processing the repayment...",
          actions: ["MOONWELL_REPAY"],
        },
      },
    ],
    [
      {
        name: "{{user}}",
        content: {
          text: "Pay back all my DAI debt",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll repay your entire DAI debt on Moonwell. Let me calculate the total amount and process the repayment...",
          actions: ["MOONWELL_REPAY"],
        },
      },
    ],
    [
      {
        name: "{{user}}",
        content: {
          text: "Repay 0.05 ETH loan",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll process the repayment of 0.05 ETH to Moonwell. This will reduce your borrowed amount...",
          actions: ["MOONWELL_REPAY"],
        },
      },
    ],
  ],
};

function parseRepayParams(text: string): RepayParams {
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
    lowerText.includes("complete");

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

  // For max repayment, we still need to know the asset
  if (!asset) {
    throw new Error(
      "Could not determine which asset to repay. Please specify like 'repay 300 USDC' or 'repay all DAI debt'",
    );
  }

  // If max repayment, amount can be set to a large value (will be capped at debt amount)
  if (isMax && !amount) {
    amount = new BigNumber("999999999999"); // Large number
  }

  // Validate we have amount
  if (!amount) {
    throw new Error(
      "Could not parse repayment amount. Please specify like '300 USDC' or use 'all' for full repayment",
    );
  }

  return {
    amount: validateAmount(amount),
    asset: validateAsset(asset),
    isMax,
  };
}
