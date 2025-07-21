import {
    Evaluator,
    IAgentRuntime,
    Memory,
    State,
    logger,
} from "@elizaos/core";
import { MoonwellService } from "../services/moonwell-service";
import { isHealthy } from "../utils/validation";

export const positionHealthEvaluator: Evaluator = {
    name: "MOONWELL_POSITION_HEALTH_EVALUATOR",
    similes: [],
    description: "Evaluates position health after Moonwell lending operations to update agent's risk assessment",
    
    validate: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State | undefined
    ): Promise<boolean> => {
        // Only evaluate after Moonwell actions
        const moonwellActions = [
            "MOONWELL_SUPPLY",
            "MOONWELL_BORROW",
            "MOONWELL_REPAY",
            "MOONWELL_WITHDRAW",
        ];
        
        return message.content.actions?.some(action => 
            moonwellActions.includes(action)
        ) || false;
    },
    
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State | undefined
    ): Promise<{ success: boolean; state?: State }> => {
        try {
            logger.info("Evaluating position health after Moonwell operation");
            
            const moonwellService = runtime.getService("moonwell") as MoonwellService;
            if (!moonwellService) {
                logger.warn("Moonwell service not available for evaluation");
                return { success: false };
            }
            
            // Get current position
            const position = await moonwellService.getUserPosition();
            
            // Extract relevant data from the interaction
            const actionData = message.content.data || {};
            const previousHealthFactor = state?.values?.previousHealthFactor || 999;
            
            // Analyze health factor changes
            const healthFactorDelta = position.healthFactor - previousHealthFactor;
            const isImprovement = healthFactorDelta > 0;
            const isHealthyPosition = isHealthy(position.healthFactor);
            
            // Update state with learning insights
            const updatedState: State = {
                values: {
                    ...(state?.values || {}),
                    previousHealthFactor: position.healthFactor,
                    positionHealthHistory: [
                        ...(state?.values?.positionHealthHistory || []),
                        {
                            timestamp: Date.now(),
                            healthFactor: position.healthFactor,
                            action: message.content.actions?.[0],
                            delta: healthFactorDelta,
                        },
                    ],
                    riskProfile: {
                        isConservative: position.healthFactor > 2.5,
                        isModerate: position.healthFactor >= 1.5 && position.healthFactor <= 2.5,
                        isAggressive: position.healthFactor < 1.5,
                        liquidationRiskLevel: position.healthFactor < 1.2 ? "high" : 
                                            position.healthFactor < 1.5 ? "medium" : "low",
                    },
                    insights: generateInsights(position, healthFactorDelta, isImprovement),
                },
                data: state?.data || {},
                text: state?.text,
            };
            
            // Log evaluation results
            logger.info(`Position health evaluation complete:
                Health Factor: ${position.healthFactor.toFixed(2)} (${isImprovement ? "+" : ""}${healthFactorDelta.toFixed(2)})
                Risk Level: ${updatedState.values.riskProfile.liquidationRiskLevel}
                Position Status: ${isHealthyPosition ? "Healthy" : "At Risk"}`);
            
            return {
                success: true,
                state: updatedState,
            };
        } catch (error) {
            logger.error("Error evaluating position health:", error);
            return { success: false };
        }
    },
    
    examples: [],
};

function generateInsights(
    position: any,
    healthFactorDelta: number,
    isImprovement: boolean
): string[] {
    const insights: string[] = [];
    
    // Health factor insights
    if (position.healthFactor < 1.2) {
        insights.push("URGENT: Position is at high risk of liquidation. Consider repaying debt or adding collateral immediately.");
    } else if (position.healthFactor < 1.5) {
        insights.push("WARNING: Health factor is below safe levels. Monitor position closely.");
    } else if (position.healthFactor > 3.0) {
        insights.push("Position is very safe. You have room to borrow more if needed.");
    }
    
    // Delta insights
    if (Math.abs(healthFactorDelta) > 0.5) {
        if (isImprovement) {
            insights.push(`Good move! Health factor improved significantly by ${healthFactorDelta.toFixed(2)}.`);
        } else {
            insights.push(`Caution: Health factor decreased by ${Math.abs(healthFactorDelta).toFixed(2)}. Consider the impact on position safety.`);
        }
    }
    
    // Utilization insights
    const utilization = position.totalBorrowed.dividedBy(
        position.totalSupplied.multipliedBy(position.liquidationThreshold)
    ).toNumber();
    
    if (utilization > 0.8) {
        insights.push("High utilization rate. You're using most of your borrowing capacity.");
    } else if (utilization < 0.3 && !position.totalBorrowed.isZero()) {
        insights.push("Low utilization rate. Your position is conservative with room for optimization.");
    }
    
    // Supply/borrow balance insights
    if (position.totalSupplied.gt(0) && position.totalBorrowed.isZero()) {
        insights.push("You're only supplying without borrowing. Consider borrowing to leverage your position if appropriate.");
    }
    
    return insights;
}