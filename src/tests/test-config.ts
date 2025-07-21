import { BigNumber } from "bignumber.js";
import { UserPosition, MarketData, AssetPosition } from "../types";

// Test fixtures
export const mockPosition: UserPosition = {
    totalSupplied: new BigNumber(10000),
    totalBorrowed: new BigNumber(4000),
    healthFactor: 2.0,
    liquidationThreshold: 0.8,
    availableToBorrow: new BigNumber(4000),
    supplies: [
        {
            asset: "USDC",
            symbol: "USDC",
            balance: new BigNumber("5000000000"),
            balanceInUSD: new BigNumber(5000),
            apy: 0.05,
            isCollateral: true,
        },
        {
            asset: "WETH",
            symbol: "WETH",
            balance: new BigNumber("2500000000000000000"),
            balanceInUSD: new BigNumber(5000),
            apy: 0.03,
            isCollateral: true,
        },
    ],
    borrows: [
        {
            asset: "DAI",
            symbol: "DAI",
            balance: new BigNumber("4000000000000000000000"),
            balanceInUSD: new BigNumber(4000),
            apy: 0.08,
        },
    ],
};

export const mockMarketData: MarketData[] = [
    {
        asset: "USDC",
        symbol: "USDC",
        supplyAPY: 0.05,
        borrowAPY: 0.08,
        totalSupply: new BigNumber("100000000000000"),
        totalBorrow: new BigNumber("70000000000000"),
        utilizationRate: 0.7,
        liquidityAvailable: new BigNumber("30000000000000"),
        collateralFactor: 0.85,
        priceInUSD: 1.0,
    },
    {
        asset: "WETH",
        symbol: "WETH",
        supplyAPY: 0.03,
        borrowAPY: 0.06,
        totalSupply: new BigNumber("50000000000000000000000"),
        totalBorrow: new BigNumber("20000000000000000000000"),
        utilizationRate: 0.4,
        liquidityAvailable: new BigNumber("30000000000000000000000"),
        collateralFactor: 0.8,
        priceInUSD: 2000,
    },
];