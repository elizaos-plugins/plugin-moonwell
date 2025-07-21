import { describe, expect, test, beforeEach, vi } from "bun:test";
import { MoonwellService } from "../services/moonwell-service";
import { BigNumber } from "bignumber.js";
import { MoonwellErrorCode } from "../types";

// Mock runtime
const mockRuntime = {
    getSetting: vi.fn((key: string) => {
        const settings: Record<string, string> = {
            BASE_RPC_URL: "https://mainnet.base.org",
            MOONWELL_NETWORK: "base",
            HEALTH_FACTOR_ALERT: "1.5",
        };
        return settings[key];
    }),
    getService: vi.fn(),
};

describe("MoonwellService", () => {
    let service: MoonwellService;
    
    beforeEach(() => {
        vi.clearAllMocks();
        service = new MoonwellService(mockRuntime as any);
    });
    
    test("should initialize with correct configuration", () => {
        expect(service).toBeDefined();
        expect(mockRuntime.getSetting).toHaveBeenCalledWith("MOONWELL_NETWORK");
        expect(mockRuntime.getSetting).toHaveBeenCalledWith("BASE_RPC_URL");
        expect(mockRuntime.getSetting).toHaveBeenCalledWith("HEALTH_FACTOR_ALERT");
    });
    
    test("should throw error when not initialized", async () => {
        try {
            await service.getUserPosition();
            expect(true).toBe(false); // Should not reach here
        } catch (error: any) {
            expect(error.code).toBe(MoonwellErrorCode.WALLET_NOT_CONNECTED);
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
        } catch (error: any) {
            expect(error.code).toBe(MoonwellErrorCode.UNSUPPORTED_ASSET);
        }
    });
    
    test("should validate negative amounts", async () => {
        const params = {
            asset: "USDC",
            amount: new BigNumber(-100),
            enableAsCollateral: false,
        };
        
        try {
            await service.supply(params);
            expect(true).toBe(false); // Should not reach here
        } catch (error: any) {
            expect(error.code).toBe(MoonwellErrorCode.INVALID_AMOUNT);
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
        } catch (error: any) {
            expect(error.code).toBe(MoonwellErrorCode.WALLET_NOT_CONNECTED);
        }
    });
});