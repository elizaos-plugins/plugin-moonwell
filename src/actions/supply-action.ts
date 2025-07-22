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
import { SupplyParams, SupplyResult } from "../types";
import {
  validateAmount,
  validateAsset,
  SUPPORTED_ASSETS,
  formatAmount,
  formatAPY,
  formatUSD,
} from "../utils/validation";
import { formatErrorResponse } from "../utils/error-handler";

export const supplyAction: Action = {
  name: "MOONWELL_SUPPLY",
  similes: ["SUPPLY", "LEND", "DEPOSIT", "ADD_COLLATERAL", "STAKE"],
  description: "Supply assets to Moonwell protocol to earn yield",

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
  ): Promise<boolean> => {
    try {
      const text = (message.content.text || "").toLowerCase();

      // Check if this is a supply/lending request
      const supplyKeywords = [
        "supply",
        "lend",
        "deposit",
        "add collateral",
        "stake",
      ];
      const hasSupplyKeyword = supplyKeywords.some((keyword) =>
        text.includes(keyword),
      );

      if (!hasSupplyKeyword) {
        return false;
      }

      // Check if Moonwell is mentioned or if it's a generic lending request
      const isMoonwellSpecific = text.includes("moonwell");
      const isGenericLending =
        supplyKeywords.some((keyword) => text.includes(keyword)) &&
        !text.includes("aave") &&
        !text.includes("compound");

      return isMoonwellSpecific || isGenericLending;
    } catch (error) {
      logger.error("Error validating supply action:", error);
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
      logger.info("Handling MOONWELL_SUPPLY action");

      // Get services
      const moonwellService = runtime.getService("moonwell") as MoonwellService;
      const walletService = runtime.getService("wallet") as WalletService;

      if (!moonwellService || !walletService) {
        throw new Error("Required services not available");
      }

      // Parse the message to extract parameters
      const text = message.content.text || "";
      const params = parseSupplyParams(text);

      // Get current position before supply
      const positionBefore = await moonwellService.getUserPosition();

      // Check wallet balance
      const walletAddress = await walletService.getAddress();
      const assetInfo =
        SUPPORTED_ASSETS[params.asset as keyof typeof SUPPORTED_ASSETS];
      const balance = await walletService.getBalance(assetInfo.address);
      const formattedBalance = formatAmount(balance, assetInfo.decimals);

      // Validate sufficient balance
      if (params.amount.gt(balance)) {
        const responseContent: Content = {
          text: `Insufficient ${params.asset} balance. You have ${formattedBalance} ${params.asset} but trying to supply ${params.amount.toString()}.`,
          actions: ["MOONWELL_SUPPLY"],
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

      // Execute supply
      logger.info(`Supplying ${params.amount.toString()} ${params.asset}`);
      const result: SupplyResult = await moonwellService.supply(params);

      // Get updated position
      const positionAfter = await moonwellService.getUserPosition();

      // Calculate changes
      const suppliedAmount = formatAmount(params.amount, assetInfo.decimals);
      const apyFormatted = formatAPY(result.currentAPY);
      const totalSuppliedBefore = formatUSD(positionBefore.totalSupplied);
      const totalSuppliedAfter = formatUSD(positionAfter.totalSupplied);

      // Format response
      const responseText = `Successfully supplied ${suppliedAmount} ${params.asset} to Moonwell!

Transaction: ${result.transactionHash}
Current APY: ${apyFormatted}
Collateral Enabled: ${result.collateralEnabled ? "Yes" : "No"}

Position Update:
- Total Supplied: ${totalSuppliedBefore} → ${totalSuppliedAfter}
- Health Factor: ${positionBefore.healthFactor.toFixed(2)} → ${positionAfter.healthFactor.toFixed(2)}
- Available to Borrow: ${formatUSD(positionAfter.availableToBorrow)}`;

      const responseContent: Content = {
        text: responseText,
        actions: ["MOONWELL_SUPPLY"],
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
          suppliedAmount: suppliedAmount,
          asset: params.asset,
          apy: result.currentAPY,
          collateralEnabled: result.collateralEnabled,
          healthFactor: positionAfter.healthFactor,
        },
      };
    } catch (error: any) {
      logger.error("Error in MOONWELL_SUPPLY action:", error);

      const errorMessage = formatErrorResponse(error);
      const responseContent: Content = {
        text: errorMessage,
        actions: ["MOONWELL_SUPPLY"],
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
          text: "Supply 1000 USDC to Moonwell",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll help you supply 1000 USDC to Moonwell protocol. Let me process this transaction for you...",
          actions: ["MOONWELL_SUPPLY"],
        },
      },
    ],
    [
      {
        name: "{{user}}",
        content: {
          text: "Lend 0.5 ETH on Moonwell and enable as collateral",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll supply 0.5 ETH to Moonwell and enable it as collateral for borrowing. Processing the transaction...",
          actions: ["MOONWELL_SUPPLY"],
        },
      },
    ],
    [
      {
        name: "{{user}}",
        content: {
          text: "Deposit 2000 DAI to earn yield",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll deposit 2000 DAI to Moonwell to start earning yield. Let me execute this supply transaction...",
          actions: ["MOONWELL_SUPPLY"],
        },
      },
    ],
  ],
};

function parseSupplyParams(text: string): SupplyParams {
  // Extract amount and asset from the text
  const words = text.split(/\s+/);
  let amount: BigNumber | null = null;
  let asset: string | null = null;
  let enableAsCollateral = false;

  // Check for collateral keywords
  enableAsCollateral =
    text.toLowerCase().includes("collateral") ||
    text.toLowerCase().includes("as collateral") ||
    text.toLowerCase().includes("enable collateral");

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
      "Could not parse amount and asset from message. Please specify like '1000 USDC' or '0.5 ETH'",
    );
  }

  return {
    amount: validateAmount(amount),
    asset: validateAsset(asset),
    enableAsCollateral,
  };
}
