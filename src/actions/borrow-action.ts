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
import { BorrowParams, BorrowResult } from "../types";
import {
  validateAmount,
  validateAsset,
  SUPPORTED_ASSETS,
  formatAmount,
  formatAPY,
  formatUSD,
} from "../utils/validation";
import { formatErrorResponse } from "../utils/error-handler";

export const borrowAction: Action = {
  name: "MOONWELL_BORROW",
  similes: ["BORROW", "LOAN", "TAKE_LOAN", "GET_LOAN"],
  description: "Borrow assets from Moonwell protocol using supplied collateral",

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
  ): Promise<boolean> => {
    try {
      const text = (message.content.text || "").toLowerCase();

      // Check if this is a borrow request
      const borrowKeywords = ["borrow", "loan", "take loan", "get loan"];
      const hasBorrowKeyword = borrowKeywords.some((keyword) =>
        text.includes(keyword),
      );

      if (!hasBorrowKeyword) {
        return false;
      }

      // Check if Moonwell is mentioned or if it's a generic borrow request
      const isMoonwellSpecific = text.includes("moonwell");
      const isGenericBorrowing =
        borrowKeywords.some((keyword) => text.includes(keyword)) &&
        !text.includes("aave") &&
        !text.includes("compound");

      return isMoonwellSpecific || isGenericBorrowing;
    } catch (error) {
      logger.error("Error validating borrow action:", error);
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
      logger.info("Handling MOONWELL_BORROW action");

      // Get services
      const moonwellService = runtime.getService("moonwell") as MoonwellService;
      const walletService = runtime.getService("wallet") as WalletService;

      if (!moonwellService || !walletService) {
        throw new Error("Required services not available");
      }

      // Parse the message to extract parameters
      const text = message.content.text || "";
      const params = parseBorrowParams(text);

      // Get current position
      const position = await moonwellService.getUserPosition();

      // Check if user has collateral
      if (position.totalSupplied.isZero()) {
        const responseContent: Content = {
          text: "You need to supply collateral before you can borrow. Please supply some assets first using the supply command.",
          actions: ["MOONWELL_BORROW", "MOONWELL_SUPPLY"],
          source: message.content.source,
        };

        if (callback) {
          await callback(responseContent);
        }

        return {
          text: responseContent.text,
          success: false,
          data: { error: "NO_COLLATERAL" },
        };
      }

      // Check borrowing capacity
      const assetInfo =
        SUPPORTED_ASSETS[params.asset as keyof typeof SUPPORTED_ASSETS];
      const borrowAmountFormatted = formatAmount(
        params.amount,
        assetInfo.decimals,
      );
      const availableToBorrow = formatUSD(position.availableToBorrow);

      if (params.amount.gt(position.availableToBorrow)) {
        const responseContent: Content = {
          text: `Insufficient borrowing capacity. You can borrow up to ${availableToBorrow} worth of assets based on your collateral. You're trying to borrow ${borrowAmountFormatted} ${params.asset}.`,
          actions: ["MOONWELL_BORROW"],
          source: message.content.source,
        };

        if (callback) {
          await callback(responseContent);
        }

        return {
          text: responseContent.text,
          success: false,
          data: { error: "EXCEEDS_BORROW_CAPACITY" },
        };
      }

      // Check current health factor
      if (position.healthFactor < 1.5) {
        const responseContent: Content = {
          text: `Your current health factor (${position.healthFactor.toFixed(2)}) is too low to borrow safely. Please improve your position by supplying more collateral or repaying existing debt.`,
          actions: ["MOONWELL_BORROW", "MOONWELL_SUPPLY", "MOONWELL_REPAY"],
          source: message.content.source,
        };

        if (callback) {
          await callback(responseContent);
        }

        return {
          text: responseContent.text,
          success: false,
          data: { error: "LOW_HEALTH_FACTOR" },
        };
      }

      // Execute borrow
      logger.info(`Borrowing ${params.amount.toString()} ${params.asset}`);
      const result: BorrowResult = await moonwellService.borrow(params);

      // Get updated position
      const positionAfter = await moonwellService.getUserPosition();

      // Format response
      const apyFormatted = formatAPY(result.interestRate);
      const totalBorrowedBefore = formatUSD(position.totalBorrowed);
      const totalBorrowedAfter = formatUSD(positionAfter.totalBorrowed);
      const healthFactorWarning =
        result.healthFactor < 2.0
          ? "\n⚠️ Warning: Your health factor is getting low. Monitor your position closely."
          : "";

      const responseText = `Successfully borrowed ${borrowAmountFormatted} ${params.asset} from Moonwell!

Transaction: ${result.transactionHash}
Borrow APY: ${apyFormatted}

Position Update:
- Total Borrowed: ${totalBorrowedBefore} → ${totalBorrowedAfter}
- Health Factor: ${position.healthFactor.toFixed(2)} → ${result.healthFactor.toFixed(2)}
- Available to Borrow: ${formatUSD(positionAfter.availableToBorrow)}${healthFactorWarning}`;

      const responseContent: Content = {
        text: responseText,
        actions: ["MOONWELL_BORROW"],
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
          borrowedAmount: borrowAmountFormatted,
          asset: params.asset,
          interestRate: result.interestRate,
          healthFactor: result.healthFactor,
        },
      };
    } catch (error: any) {
      logger.error("Error in MOONWELL_BORROW action:", error);

      const errorMessage = formatErrorResponse(error);
      const responseContent: Content = {
        text: errorMessage,
        actions: ["MOONWELL_BORROW"],
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
          text: "Borrow 500 USDC from Moonwell",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll help you borrow 500 USDC from Moonwell. Let me check your collateral and process this loan...",
          actions: ["MOONWELL_BORROW"],
        },
      },
    ],
    [
      {
        name: "{{user}}",
        content: {
          text: "Take a loan of 0.1 ETH",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll process your loan request for 0.1 ETH from Moonwell. Checking your borrowing capacity...",
          actions: ["MOONWELL_BORROW"],
        },
      },
    ],
    [
      {
        name: "{{user}}",
        content: {
          text: "Can I borrow 1000 DAI against my collateral?",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Let me check if you can borrow 1000 DAI based on your current collateral position in Moonwell...",
          actions: ["MOONWELL_BORROW"],
        },
      },
    ],
  ],
};

function parseBorrowParams(text: string): BorrowParams {
  // Extract amount and asset from the text
  const words = text.split(/\s+/);
  let amount: BigNumber | null = null;
  let asset: string | null = null;
  let interestRateMode: "stable" | "variable" = "variable"; // Default to variable

  // Check for interest rate mode
  if (text.toLowerCase().includes("stable")) {
    interestRateMode = "stable";
  }

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

  // Validate we found both amount and asset
  if (!amount || !asset) {
    throw new Error(
      "Could not parse amount and asset from message. Please specify like '500 USDC' or '0.1 ETH'",
    );
  }

  return {
    amount: validateAmount(amount),
    asset: validateAsset(asset),
    interestRateMode,
  };
}
