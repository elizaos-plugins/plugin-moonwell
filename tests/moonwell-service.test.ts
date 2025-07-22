import { describe, expect, test, beforeEach, mock } from "bun:test";
import { IAgentRuntime } from "@elizaos/core";
import { MoonwellService } from "../src/services/moonwell-service";
import { BigNumber } from "bignumber.js";
import { MoonwellErrorCode, MoonwellError } from "../src/types";

// Mock runtime
const mockGetSetting = mock((key: string) => {
  const settings: Record<string, string> = {
    BASE_RPC_URL: "https://mainnet.base.org",
    MOONWELL_NETWORK: "base",
    HEALTH_FACTOR_ALERT: "1.5",
  };
  return settings[key];
});

const mockGetService = mock();

const mockRuntime = {
  getSetting: mockGetSetting,
  getService: mockGetService,
} as unknown as IAgentRuntime;

describe("MoonwellService", () => {
  let service: MoonwellService;

  beforeEach(() => {
    mockGetSetting.mockClear();
    mockGetService.mockClear();
    service = new MoonwellService(mockRuntime);
  });

  test("should initialize with correct configuration", () => {
    expect(service).toBeDefined();
    expect(mockGetSetting).toHaveBeenCalledWith("MOONWELL_NETWORK");
    expect(mockGetSetting).toHaveBeenCalledWith("BASE_RPC_URL");
    expect(mockGetSetting).toHaveBeenCalledWith("HEALTH_FACTOR_ALERT");
  });

  test("should throw error when not initialized", async () => {
    try {
      await service.getUserPosition();
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect((error as MoonwellError).code).toBe(
        MoonwellErrorCode.WALLET_NOT_CONNECTED,
      );
    }
  });

  test("should validate supply parameters", async () => {
    const params = {
      asset: "INVALID",
      amount: new BigNumber(1000),
      enableAsCollateral: true,
    };

    try {
      await service.supply(params);
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect((error as MoonwellError).code).toBe(
        MoonwellErrorCode.WALLET_NOT_CONNECTED,
      );
    }
  });

  test("should validate negative amounts", async () => {
    const params = {
      asset: "USDC",
      amount: new BigNumber(-1000),
      enableAsCollateral: false,
    };

    try {
      await service.supply(params);
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect((error as MoonwellError).code).toBe(
        MoonwellErrorCode.WALLET_NOT_CONNECTED,
      );
    }
  });

  test("should handle cached position correctly", () => {
    const cachedPosition = service.getCachedPosition();
    expect(cachedPosition).toBeNull();
  });

  test("should validate borrow capacity", async () => {
    const params = {
      asset: "USDC",
      amount: new BigNumber(10000),
      interestRateMode: "variable" as const,
    };

    try {
      await service.borrow(params);
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect((error as MoonwellError).code).toBe(
        MoonwellErrorCode.WALLET_NOT_CONNECTED,
      );
    }
  });
});
