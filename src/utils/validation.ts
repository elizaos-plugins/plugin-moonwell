import { BigNumber } from "bignumber.js";
import { MoonwellError, MoonwellErrorCode } from "../types";

// Type for supported asset keys
export type SupportedAsset = "USDC" | "WETH" | "cbETH" | "DAI" | "USDbC";

// Supported assets on Moonwell Base
export const SUPPORTED_ASSETS: Record<
  SupportedAsset,
  { symbol: string; decimals: number; address: string }
> = {
  USDC: {
    symbol: "USDC",
    decimals: 6,
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base mainnet USDC
  },
  WETH: {
    symbol: "WETH",
    decimals: 18,
    address: "0x4200000000000000000000000000000000000006", // Base mainnet WETH
  },
  cbETH: {
    symbol: "cbETH",
    decimals: 18,
    address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", // Base mainnet cbETH
  },
  DAI: {
    symbol: "DAI",
    decimals: 18,
    address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", // Base mainnet DAI
  },
  USDbC: {
    symbol: "USDbC",
    decimals: 6,
    address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", // Base mainnet USDbC
  },
};

export function validateAmount(amount: BigNumber | string | number): BigNumber {
  const bigAmount = new BigNumber(amount);

  if (bigAmount.isNaN() || bigAmount.isNegative()) {
    throw createError(
      MoonwellErrorCode.INVALID_AMOUNT,
      "Amount must be a positive number",
    );
  }

  if (bigAmount.isZero()) {
    throw createError(
      MoonwellErrorCode.INVALID_AMOUNT,
      "Amount cannot be zero",
    );
  }

  return bigAmount;
}

export function validateAsset(asset: string): string {
  const normalizedAsset = asset.toUpperCase();

  if (!(normalizedAsset in SUPPORTED_ASSETS)) {
    throw createError(
      MoonwellErrorCode.UNSUPPORTED_ASSET,
      `Asset ${asset} is not supported. Supported assets: ${Object.keys(SUPPORTED_ASSETS).join(", ")}`,
      { supportedAssets: Object.keys(SUPPORTED_ASSETS) },
    );
  }

  return normalizedAsset;
}

export function validateHealthFactor(
  healthFactor: number,
  threshold: number = 1.5,
): void {
  if (healthFactor < threshold) {
    const suggestions = [];

    if (healthFactor < 1.0) {
      suggestions.push("URGENT: Your position is at risk of liquidation!");
      suggestions.push("Repay some debt immediately or add more collateral");
    } else if (healthFactor < 1.2) {
      suggestions.push(
        "WARNING: Your position is close to liquidation threshold",
      );
      suggestions.push("Consider repaying debt or adding collateral soon");
    } else {
      suggestions.push("Your health factor is below recommended levels");
      suggestions.push("Monitor your position closely");
    }

    throw createError(
      MoonwellErrorCode.LIQUIDATION_RISK,
      `Health factor ${healthFactor.toFixed(2)} is below safe threshold ${threshold}`,
      { healthFactor, threshold },
      suggestions,
      healthFactor,
    );
  }
}

export function validateBorrowCapacity(
  requestedAmount: BigNumber,
  availableCapacity: BigNumber,
): void {
  if (requestedAmount.gt(availableCapacity)) {
    throw createError(
      MoonwellErrorCode.EXCEEDS_BORROW_CAPACITY,
      `Requested borrow amount exceeds available capacity`,
      {
        requested: requestedAmount.toString(),
        available: availableCapacity.toString(),
      },
      [`Maximum borrowable amount: ${availableCapacity.toString()}`],
    );
  }
}

export function validateLiquidity(
  requestedAmount: BigNumber,
  availableLiquidity: BigNumber,
): void {
  if (requestedAmount.gt(availableLiquidity)) {
    throw createError(
      MoonwellErrorCode.INSUFFICIENT_LIQUIDITY,
      `Insufficient liquidity in the market`,
      {
        requested: requestedAmount.toString(),
        available: availableLiquidity.toString(),
      },
      [`Maximum available: ${availableLiquidity.toString()}`],
    );
  }
}

export function validateWalletBalance(
  requiredAmount: BigNumber,
  walletBalance: BigNumber,
  asset: string,
): void {
  if (requiredAmount.gt(walletBalance)) {
    throw createError(
      MoonwellErrorCode.INSUFFICIENT_BALANCE,
      `Insufficient ${asset} balance in wallet`,
      {
        required: requiredAmount.toString(),
        available: walletBalance.toString(),
      },
      [
        `You need ${requiredAmount.minus(walletBalance).toString()} more ${asset}`,
      ],
    );
  }
}

export function createError(
  code: MoonwellErrorCode,
  message: string,
  details?: any,
  suggestions?: string[],
  healthFactor?: number,
): MoonwellError {
  return {
    code,
    message,
    details,
    suggestions,
    healthFactor,
  };
}

export function formatAmount(amount: BigNumber, decimals: number): string {
  return amount.dividedBy(new BigNumber(10).pow(decimals)).toFixed();
}

export function parseAmount(
  amount: string | number,
  decimals: number,
): BigNumber {
  return new BigNumber(amount).multipliedBy(new BigNumber(10).pow(decimals));
}

export function calculateHealthFactor(
  totalCollateralInUSD: BigNumber,
  totalDebtInUSD: BigNumber,
  liquidationThreshold: number,
): number {
  if (totalDebtInUSD.isZero()) {
    return 999; // Max health factor when no debt
  }

  const weightedCollateral =
    totalCollateralInUSD.multipliedBy(liquidationThreshold);
  return Number(weightedCollateral.dividedBy(totalDebtInUSD).toFixed(2));
}

export function isHealthy(healthFactor: number): boolean {
  return healthFactor >= 1.5;
}

export function formatAPY(apy: number): string {
  return `${(apy * 100).toFixed(2)}%`;
}

export function formatUSD(amount: BigNumber): string {
  return `$${amount.toFixed(2)}`;
}
