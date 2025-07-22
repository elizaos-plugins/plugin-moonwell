import { BigNumber } from "bignumber.js";
import { describe, expect, test } from "bun:test";
import { MoonwellError } from "../src/types";
import { MoonwellErrorCode } from "../src/types";
import {
  calculateHealthFactor,
  formatAmount,
  formatAPY,
  formatUSD,
  isHealthy,
  parseAmount,
  validateAmount,
  validateAsset,
  validateBorrowCapacity,
  validateHealthFactor,
} from "../src/utils/validation";

describe("Validation Utils", () => {
  describe("validateAmount", () => {
    test("should accept valid positive amounts", () => {
      const amount = validateAmount("100");
      expect(amount.toString()).toBe("100");
    });

    test("should accept BigNumber inputs", () => {
      const amount = validateAmount(new BigNumber(500));
      expect(amount.toString()).toBe("500");
    });

    test("should reject negative amounts", () => {
      expect(() => validateAmount("-100")).toThrow();
    });

    test("should reject zero amounts", () => {
      expect(() => validateAmount("0")).toThrow();
    });

    test("should reject NaN", () => {
      expect(() => validateAmount("not a number")).toThrow();
    });
  });

  describe("validateAsset", () => {
    test("should accept supported assets", () => {
      expect(validateAsset("USDC")).toBe("USDC");
      expect(validateAsset("weth")).toBe("WETH");
      expect(validateAsset("dai")).toBe("DAI");
    });

    test("should reject unsupported assets", () => {
      expect(() => validateAsset("BTC")).toThrow();
      expect(() => validateAsset("UNKNOWN")).toThrow();
    });

    test("should normalize asset names to uppercase", () => {
      expect(validateAsset("usdc")).toBe("USDC");
      expect(validateAsset("Weth")).toBe("WETH");
    });
  });

  describe("validateHealthFactor", () => {
    test("should pass for healthy positions", () => {
      expect(() => validateHealthFactor(2.0, 1.5)).not.toThrow();
      expect(() => validateHealthFactor(3.5, 1.5)).not.toThrow();
    });

    test("should throw for unhealthy positions", () => {
      expect(() => validateHealthFactor(1.2, 1.5)).toThrow();
      expect(() => validateHealthFactor(0.9, 1.5)).toThrow();
    });

    test("should include suggestions for risky positions", () => {
      try {
        validateHealthFactor(0.8, 1.5);
      } catch (error) {
        expect((error as MoonwellError).code).toBe(
          MoonwellErrorCode.LIQUIDATION_RISK,
        );
        expect((error as MoonwellError).suggestions).toBeDefined();
        expect((error as MoonwellError).suggestions?.length).toBeGreaterThan(0);
      }
    });
  });

  describe("validateBorrowCapacity", () => {
    test("should pass when capacity is sufficient", () => {
      const requested = new BigNumber(1000);
      const available = new BigNumber(2000);
      expect(() => validateBorrowCapacity(requested, available)).not.toThrow();
    });

    test("should throw when capacity is exceeded", () => {
      const requested = new BigNumber(3000);
      const available = new BigNumber(2000);
      expect(() => validateBorrowCapacity(requested, available)).toThrow();
    });
  });

  describe("formatAmount", () => {
    test("should format amounts with correct decimals", () => {
      const amount = new BigNumber("1000000"); // 1 USDC (6 decimals)
      expect(formatAmount(amount, 6)).toBe("1");

      const ethAmount = new BigNumber("1000000000000000000"); // 1 ETH (18 decimals)
      expect(formatAmount(ethAmount, 18)).toBe("1");
    });
  });

  describe("parseAmount", () => {
    test("should parse amounts to correct units", () => {
      const usdc = parseAmount("1", 6);
      expect(usdc.toString()).toBe("1000000");

      const eth = parseAmount("1", 18);
      expect(eth.toString()).toBe("1000000000000000000");
    });
  });

  describe("calculateHealthFactor", () => {
    test("should calculate health factor correctly", () => {
      const collateral = new BigNumber(10000);
      const debt = new BigNumber(5000);
      const threshold = 0.8;

      const hf = calculateHealthFactor(collateral, debt, threshold);
      expect(hf).toBe(1.6); // (10000 * 0.8) / 5000
    });

    test("should return max value when no debt", () => {
      const collateral = new BigNumber(10000);
      const debt = new BigNumber(0);
      const threshold = 0.8;

      const hf = calculateHealthFactor(collateral, debt, threshold);
      expect(hf).toBe(999);
    });
  });

  describe("isHealthy", () => {
    test("should identify healthy positions", () => {
      expect(isHealthy(2.0)).toBe(true);
      expect(isHealthy(1.5)).toBe(true);
    });

    test("should identify unhealthy positions", () => {
      expect(isHealthy(1.4)).toBe(false);
      expect(isHealthy(0.9)).toBe(false);
    });
  });

  describe("formatAPY", () => {
    test("should format APY as percentage", () => {
      expect(formatAPY(0.05)).toBe("5.00%");
      expect(formatAPY(0.125)).toBe("12.50%");
      expect(formatAPY(0.002)).toBe("0.20%");
    });
  });

  describe("formatUSD", () => {
    test("should format USD amounts", () => {
      expect(formatUSD(new BigNumber(1000))).toBe("$1000.00");
      expect(formatUSD(new BigNumber(1234.56))).toBe("$1234.56");
      expect(formatUSD(new BigNumber(0.99))).toBe("$0.99");
    });
  });
});
