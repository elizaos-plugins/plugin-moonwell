import { Plugin } from "@elizaos/core";
import { MoonwellService } from "./services/moonwellService";
import { WalletService } from "./services/walletService";
import { 
    MarketDataAction,
    PositionAction,
    GovernanceAction
} from "./actions";
import {
    PositionContextProvider,
    MarketDataProvider
} from "./providers";

export const moonwellPlugin: Plugin = {
    name: "moonwell",
    description: "Moonwell lending protocol integration - supply, borrow, and manage DeFi positions",
    
    services: [
        new MoonwellService(),
        new WalletService()
    ],
    
    actions: [
        new MarketDataAction(),
        new PositionAction(),
        new GovernanceAction()
    ],
    
    providers: [
        new PositionContextProvider(),
        new MarketDataProvider()
    ],
    
    evaluators: [],
    
    // API endpoints for external access
    apis: [
        {
            path: "/moonwell/position/:address",
            method: "GET",
            handler: async (req, res, runtime) => {
                try {
                    const moonwellService = runtime.getService('moonwell') as MoonwellService;
                    const position = await moonwellService.getUserPosition();
                    res.json({ success: true, data: position });
                } catch (error) {
                    res.status(500).json({ success: false, error: error.message });
                }
            }
        },
        {
            path: "/moonwell/markets",
            method: "GET",
            handler: async (req, res, runtime) => {
                try {
                    const moonwellService = runtime.getService('moonwell') as MoonwellService;
                    const markets = await moonwellService.getMarketData();
                    res.json({ success: true, data: markets });
                } catch (error) {
                    res.status(500).json({ success: false, error: error.message });
                }
            }
        },
        {
            path: "/moonwell/governance",
            method: "GET",
            handler: async (req, res, runtime) => {
                try {
                    const moonwellService = runtime.getService('moonwell') as MoonwellService;
                    const governance = await moonwellService.getGovernanceInfo();
                    res.json({ success: true, data: governance });
                } catch (error) {
                    res.status(500).json({ success: false, error: error.message });
                }
            }
        }
    ]
};

export default moonwellPlugin;