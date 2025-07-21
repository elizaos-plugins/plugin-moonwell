import { describe, expect, test, beforeEach, vi } from "bun:test";
import { supplyAction, borrowAction, repayAction, withdrawAction } from "../actions";
import { BigNumber } from "bignumber.js";

// Mock services
const mockMoonwellService = {
    getUserPosition: vi.fn(),
    supply: vi.fn(),
    borrow: vi.fn(),
    repay: vi.fn(),
    withdraw: vi.fn(),
    getMarketData: vi.fn(),
};

const mockWalletService = {
    getAddress: vi.fn().mockResolvedValue("0x123..."),
    getBalance: vi.fn().mockResolvedValue(new BigNumber("10000000000")), // 10k USDC
};

const mockRuntime = {
    getService: vi.fn((serviceName: string) => {
        if (serviceName === "moonwell") return mockMoonwellService;
        if (serviceName === "wallet") return mockWalletService;
        return null;
    }),
};

const mockMessage = (text: string) => ({
    content: {
        text,
        source: "test",
    },
    userId: "test-user",
    roomId: "test-room",
});

describe("Actions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        
        // Setup default mock responses
        mockMoonwellService.getUserPosition.mockResolvedValue({
            totalSupplied: new BigNumber(5000),
            totalBorrowed: new BigNumber(2000),
            healthFactor: 2.0,
            liquidationThreshold: 0.8,
            availableToBorrow: new BigNumber(3000),
            supplies: [],
            borrows: [],
        });
    });
    
    describe("SupplyAction", () => {
        test("should validate supply requests", async () => {
            const validMessage = mockMessage("Supply 1000 USDC to Moonwell");
            const isValid = await supplyAction.validate(mockRuntime as any, validMessage as any, undefined);
            expect(isValid).toBe(true);
            
            const invalidMessage = mockMessage("Check my balance");
            const isInvalid = await supplyAction.validate(mockRuntime as any, invalidMessage as any, undefined);
            expect(isInvalid).toBe(false);
        });
        
        test("should handle supply execution", async () => {
            mockMoonwellService.supply.mockResolvedValue({
                transactionHash: "0xabc123",
                mTokenBalance: new BigNumber("1000000000"),
                currentAPY: 0.05,
                collateralEnabled: true,
            });
            
            const message = mockMessage("Supply 1000 USDC to Moonwell");
            const result = await supplyAction.handler(
                mockRuntime as any,
                message as any,
                undefined,
                {},
                undefined,
                []
            );
            
            expect(result.success).toBe(true);
            expect(result.data?.transactionHash).toBe("0xabc123");
            expect(mockMoonwellService.supply).toHaveBeenCalled();
        });
        
        test("should handle insufficient balance", async () => {
            mockWalletService.getBalance.mockResolvedValue(new BigNumber("500000000")); // Only 500 USDC
            
            const message = mockMessage("Supply 1000 USDC");
            const result = await supplyAction.handler(
                mockRuntime as any,
                message as any,
                undefined,
                {},
                undefined,
                []
            );
            
            expect(result.success).toBe(false);
            expect(result.data?.error).toBe("INSUFFICIENT_BALANCE");
        });
    });
    
    describe("BorrowAction", () => {
        test("should validate borrow requests", async () => {
            const validMessage = mockMessage("Borrow 500 USDC from Moonwell");
            const isValid = await borrowAction.validate(mockRuntime as any, validMessage as any, undefined);
            expect(isValid).toBe(true);
            
            const invalidMessage = mockMessage("Supply 1000 USDC");
            const isInvalid = await borrowAction.validate(mockRuntime as any, invalidMessage as any, undefined);
            expect(isInvalid).toBe(false);
        });
        
        test("should check collateral before borrowing", async () => {
            mockMoonwellService.getUserPosition.mockResolvedValue({
                totalSupplied: new BigNumber(0), // No collateral
                totalBorrowed: new BigNumber(0),
                healthFactor: 999,
                liquidationThreshold: 0.8,
                availableToBorrow: new BigNumber(0),
                supplies: [],
                borrows: [],
            });
            
            const message = mockMessage("Borrow 500 USDC");
            const result = await borrowAction.handler(
                mockRuntime as any,
                message as any,
                undefined,
                {},
                undefined,
                []
            );
            
            expect(result.success).toBe(false);
            expect(result.data?.error).toBe("NO_COLLATERAL");
        });
        
        test("should check health factor before borrowing", async () => {
            mockMoonwellService.getUserPosition.mockResolvedValue({
                totalSupplied: new BigNumber(5000),
                totalBorrowed: new BigNumber(3500),
                healthFactor: 1.3, // Too low
                liquidationThreshold: 0.8,
                availableToBorrow: new BigNumber(500),
                supplies: [],
                borrows: [],
            });
            
            const message = mockMessage("Borrow 100 USDC");
            const result = await borrowAction.handler(
                mockRuntime as any,
                message as any,
                undefined,
                {},
                undefined,
                []
            );
            
            expect(result.success).toBe(false);
            expect(result.data?.error).toBe("LOW_HEALTH_FACTOR");
        });
    });
    
    describe("RepayAction", () => {
        test("should validate repay requests", async () => {
            const validMessage = mockMessage("Repay 300 USDC to Moonwell");
            const isValid = await repayAction.validate(mockRuntime as any, validMessage as any, undefined);
            expect(isValid).toBe(true);
            
            const allMessage = mockMessage("Pay back all my DAI debt");
            const isValidAll = await repayAction.validate(mockRuntime as any, allMessage as any, undefined);
            expect(isValidAll).toBe(true);
        });
        
        test("should handle full repayment", async () => {
            mockMoonwellService.getUserPosition.mockResolvedValue({
                totalSupplied: new BigNumber(5000),
                totalBorrowed: new BigNumber(1000),
                healthFactor: 2.5,
                liquidationThreshold: 0.8,
                availableToBorrow: new BigNumber(3000),
                supplies: [],
                borrows: [{
                    asset: "USDC",
                    symbol: "USDC",
                    balance: new BigNumber("1000000000"), // 1000 USDC
                    balanceInUSD: new BigNumber(1000),
                    apy: 0.08,
                }],
            });
            
            mockMoonwellService.repay.mockResolvedValue({
                transactionHash: "0xdef456",
                repaidAmount: new BigNumber("1000000000"),
                remainingDebt: new BigNumber(0),
                healthFactor: 999,
            });
            
            const message = mockMessage("Repay all USDC debt");
            const result = await repayAction.handler(
                mockRuntime as any,
                message as any,
                undefined,
                {},
                undefined,
                []
            );
            
            expect(result.success).toBe(true);
            expect(result.data?.debtFullyRepaid).toBe(true);
        });
    });
    
    describe("WithdrawAction", () => {
        test("should validate withdraw requests", async () => {
            const validMessage = mockMessage("Withdraw 500 USDC from Moonwell");
            const isValid = await withdrawAction.validate(mockRuntime as any, validMessage as any, undefined);
            expect(isValid).toBe(true);
        });
        
        test("should check liquidation risk before withdrawal", async () => {
            mockMoonwellService.getUserPosition.mockResolvedValue({
                totalSupplied: new BigNumber(5000),
                totalBorrowed: new BigNumber(4000),
                healthFactor: 1.5,
                liquidationThreshold: 0.8,
                availableToBorrow: new BigNumber(0),
                supplies: [{
                    asset: "USDC",
                    symbol: "USDC",
                    balance: new BigNumber("5000000000"),
                    balanceInUSD: new BigNumber(5000),
                    apy: 0.05,
                    isCollateral: true,
                }],
                borrows: [],
            });
            
            const message = mockMessage("Withdraw 2000 USDC");
            const result = await withdrawAction.handler(
                mockRuntime as any,
                message as any,
                undefined,
                {},
                undefined,
                []
            );
            
            expect(result.success).toBe(false);
            expect(result.data?.error).toBe("LIQUIDATION_RISK");
        });
    });
});