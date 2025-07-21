import { describe, expect, test, beforeEach } from "bun:test";
import { moonwellPlugin } from "../index";
import { z } from "zod";

describe("Moonwell Plugin Integration", () => {
    test("plugin should have correct structure", () => {
        expect(moonwellPlugin.name).toBe("plugin-moonwell");
        expect(moonwellPlugin.description).toContain("Moonwell Protocol");
        expect(moonwellPlugin.actions).toHaveLength(4);
        expect(moonwellPlugin.providers).toHaveLength(2);
        expect(moonwellPlugin.evaluators).toHaveLength(2);
        expect(moonwellPlugin.services).toHaveLength(2);
    });
    
    test("plugin should validate configuration", async () => {
        const validConfig = {
            BASE_RPC_URL: "https://mainnet.base.org",
            WALLET_PRIVATE_KEY: "0x123...",
            HEALTH_FACTOR_ALERT: "2.0",
            MOONWELL_NETWORK: "base",
        };
        
        // Should not throw
        await expect(moonwellPlugin.init(validConfig)).resolves.toBeUndefined();
    });
    
    test("plugin should reject invalid configuration", async () => {
        const invalidConfig = {
            BASE_RPC_URL: "", // Empty URL
            MOONWELL_NETWORK: "invalid-network",
        };
        
        try {
            await moonwellPlugin.init(invalidConfig);
            expect(true).toBe(false); // Should not reach
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain("Invalid Moonwell plugin configuration");
        }
    });
    
    test("actions should have required properties", () => {
        moonwellPlugin.actions.forEach(action => {
            expect(action).toHaveProperty("name");
            expect(action).toHaveProperty("description");
            expect(action).toHaveProperty("validate");
            expect(action).toHaveProperty("handler");
            expect(action).toHaveProperty("examples");
            expect(action.examples.length).toBeGreaterThan(0);
        });
    });
    
    test("providers should have required properties", () => {
        moonwellPlugin.providers.forEach(provider => {
            expect(provider).toHaveProperty("name");
            expect(provider).toHaveProperty("description");
            expect(provider).toHaveProperty("get");
        });
    });
    
    test("evaluators should have required properties", () => {
        moonwellPlugin.evaluators?.forEach(evaluator => {
            expect(evaluator).toHaveProperty("name");
            expect(evaluator).toHaveProperty("description");
            expect(evaluator).toHaveProperty("validate");
            expect(evaluator).toHaveProperty("handler");
        });
    });
    
    test("services should have correct types", () => {
        const serviceTypes = moonwellPlugin.services.map(s => s.type);
        expect(serviceTypes).toContain("moonwell");
        expect(serviceTypes).toContain("wallet");
    });
});