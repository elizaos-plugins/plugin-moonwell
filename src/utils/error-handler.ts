import { logger } from "@elizaos/core";
import { MoonwellError, MoonwellErrorCode } from "../types";
import { createError } from "./validation";

export function handleError(error: any): MoonwellError {
  logger.error("Moonwell plugin error:", error);

  // If it's already a MoonwellError, return it
  if (error.code && Object.values(MoonwellErrorCode).includes(error.code)) {
    return error;
  }

  // Parse common blockchain errors
  const errorMessage = error.message?.toLowerCase() || "";
  const errorString = error.toString().toLowerCase();

  // Insufficient funds errors
  if (
    errorMessage.includes("insufficient") ||
    errorMessage.includes("exceeds balance")
  ) {
    return createError(
      MoonwellErrorCode.INSUFFICIENT_BALANCE,
      "Insufficient funds for transaction",
      { originalError: error.message },
    );
  }

  // Gas estimation errors
  if (errorMessage.includes("gas") || errorMessage.includes("reverted")) {
    return createError(
      MoonwellErrorCode.TRANSACTION_FAILED,
      "Transaction would fail - check parameters",
      { originalError: error.message },
      [
        "Verify you have enough balance",
        "Check if the market is paused",
        "Ensure health factor remains safe",
      ],
    );
  }

  // Network errors
  if (
    errorMessage.includes("network") ||
    errorMessage.includes("rpc") ||
    errorMessage.includes("timeout")
  ) {
    return createError(
      MoonwellErrorCode.RPC_ERROR,
      "Network error - please try again",
      { originalError: error.message },
    );
  }

  // Market paused
  if (errorMessage.includes("paused") || errorMessage.includes("frozen")) {
    return createError(
      MoonwellErrorCode.MARKET_PAUSED,
      "Market is currently paused",
      { originalError: error.message },
      ["Try again later", "Check Moonwell status page"],
    );
  }

  // Default error
  return createError(
    MoonwellErrorCode.TRANSACTION_FAILED,
    error.message || "An unexpected error occurred",
    { originalError: error },
  );
}

export function formatErrorResponse(error: MoonwellError): string {
  let response = `Error: ${error.message}`;

  if (error.healthFactor !== undefined) {
    response += `\nHealth Factor: ${error.healthFactor.toFixed(2)}`;
  }

  if (error.suggestions && error.suggestions.length > 0) {
    response += "\n\nSuggestions:";
    error.suggestions.forEach((suggestion, index) => {
      response += `\n${index + 1}. ${suggestion}`;
    });
  }

  return response;
}
