import { Service, IAgentRuntime, logger } from "@elizaos/core";
import { ethers } from "ethers";
import { BigNumber } from "bignumber.js";
import {
    Transaction,
    SignedTransaction,
    TransactionReceipt,
    MoonwellErrorCode,
} from "../types";
import { createError } from "../utils/validation";
import { handleError } from "../utils/error-handler";

// ERC20 ABI for token operations
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function name() view returns (string)",
];

export class WalletService extends Service {
    static serviceType = "wallet";
    capabilityDescription = "Manages Base L2 wallet operations including transaction signing and token approvals";
    
    private provider?: ethers.Provider;
    private signer?: ethers.Signer;
    private address?: string;
    private chainId?: bigint;
    
    constructor(protected runtime: IAgentRuntime) {
        super(runtime);
    }
    
    static async start(runtime: IAgentRuntime): Promise<WalletService> {
        logger.info("Starting wallet service...");
        const service = new WalletService(runtime);
        await service.initialize();
        return service;
    }
    
    static async stop(runtime: IAgentRuntime): Promise<void> {
        logger.info("Stopping wallet service...");
        const service = runtime.getService(WalletService.serviceType) as WalletService;
        if (service) {
            await service.stop();
        }
    }
    
    async initialize(): Promise<void> {
        try {
            logger.info("Initializing wallet service...");
            
            const rpcUrl = this.runtime.getSetting("BASE_RPC_URL") || "https://mainnet.base.org";
            this.provider = new ethers.JsonRpcProvider(rpcUrl);
            
            // Get network info
            const network = await this.provider.getNetwork();
            this.chainId = network.chainId;
            logger.info(`Connected to network: ${network.name} (chainId: ${this.chainId})`);
            
            // Initialize signer if private key is available
            const privateKey = this.runtime.getSetting("WALLET_PRIVATE_KEY");
            if (privateKey) {
                await this.connect(privateKey);
            } else {
                logger.warn("No private key provided - wallet service in read-only mode");
            }
            
            logger.info("Wallet service initialized successfully");
        } catch (error) {
            logger.error("Failed to initialize wallet service:", error);
            throw handleError(error);
        }
    }
    
    async connect(privateKey?: string): Promise<void> {
        try {
            if (!this.provider) {
                throw createError(
                    MoonwellErrorCode.WALLET_NOT_CONNECTED,
                    "Provider not initialized"
                );
            }
            
            // Use provided private key or get from settings
            const key = privateKey || this.runtime.getSetting("WALLET_PRIVATE_KEY");
            if (!key) {
                throw createError(
                    MoonwellErrorCode.WALLET_NOT_CONNECTED,
                    "No private key provided"
                );
            }
            
            this.signer = new ethers.Wallet(key, this.provider);
            this.address = await this.signer.getAddress();
            
            logger.info(`Wallet connected: ${this.address}`);
            
            // Log ETH balance
            const balance = await this.provider.getBalance(this.address);
            const ethBalance = ethers.formatEther(balance);
            logger.info(`ETH balance: ${ethBalance} ETH`);
        } catch (error) {
            logger.error("Failed to connect wallet:", error);
            throw handleError(error);
        }
    }
    
    async getAddress(): Promise<string> {
        if (!this.address) {
            throw createError(
                MoonwellErrorCode.WALLET_NOT_CONNECTED,
                "Wallet not connected"
            );
        }
        return this.address;
    }
    
    async signTransaction(tx: Transaction): Promise<SignedTransaction> {
        try {
            if (!this.signer) {
                throw createError(
                    MoonwellErrorCode.WALLET_NOT_CONNECTED,
                    "Wallet not connected - cannot sign transactions"
                );
            }
            
            // Prepare transaction
            const preparedTx = {
                to: tx.to,
                from: tx.from || this.address,
                data: tx.data,
                value: tx.value || "0",
                gasLimit: tx.gasLimit,
                gasPrice: tx.gasPrice,
            };
            
            // Estimate gas if not provided
            if (!preparedTx.gasLimit) {
                const estimatedGas = await this.provider!.estimateGas(preparedTx);
                preparedTx.gasLimit = (estimatedGas * 120n / 100n).toString(); // Add 20% buffer
            }
            
            // Get gas price if not provided
            if (!preparedTx.gasPrice) {
                const feeData = await this.provider!.getFeeData();
                preparedTx.gasPrice = feeData.gasPrice?.toString();
            }
            
            // Sign transaction
            const signedTx = await this.signer.signTransaction(preparedTx);
            
            // Send transaction
            const txResponse = await this.provider!.broadcastTransaction(signedTx);
            
            return {
                ...tx,
                signature: signedTx,
                hash: txResponse.hash,
            };
        } catch (error) {
            logger.error("Failed to sign transaction:", error);
            throw handleError(error);
        }
    }
    
    async getBalance(tokenAddress?: string): Promise<BigNumber> {
        try {
            if (!this.provider || !this.address) {
                throw createError(
                    MoonwellErrorCode.WALLET_NOT_CONNECTED,
                    "Wallet not connected"
                );
            }
            
            if (!tokenAddress || tokenAddress.toLowerCase() === "eth") {
                // Get ETH balance
                const balance = await this.provider.getBalance(this.address);
                return new BigNumber(balance.toString());
            } else {
                // Get ERC20 token balance
                const tokenContract = new ethers.Contract(
                    tokenAddress,
                    ERC20_ABI,
                    this.provider
                );
                
                const balance = await tokenContract.balanceOf(this.address);
                return new BigNumber(balance.toString());
            }
        } catch (error) {
            logger.error("Failed to get balance:", error);
            throw handleError(error);
        }
    }
    
    async approveToken(
        tokenAddress: string,
        spenderAddress: string,
        amount: BigNumber
    ): Promise<string> {
        try {
            if (!this.signer) {
                throw createError(
                    MoonwellErrorCode.WALLET_NOT_CONNECTED,
                    "Wallet not connected - cannot approve tokens"
                );
            }
            
            const tokenContract = new ethers.Contract(
                tokenAddress,
                ERC20_ABI,
                this.signer
            );
            
            // Check current allowance
            const currentAllowance = await tokenContract.allowance(
                this.address,
                spenderAddress
            );
            
            const currentAllowanceBN = new BigNumber(currentAllowance.toString());
            
            // If allowance is sufficient, no need to approve
            if (currentAllowanceBN.gte(amount)) {
                logger.info("Sufficient allowance already exists");
                return "0x0"; // Return dummy hash
            }
            
            // Set allowance to 0 first if current allowance is non-zero (best practice)
            if (currentAllowanceBN.gt(0)) {
                const resetTx = await tokenContract.approve(spenderAddress, 0);
                await resetTx.wait();
                logger.info("Reset token allowance to 0");
            }
            
            // Approve the requested amount
            const approveTx = await tokenContract.approve(
                spenderAddress,
                amount.toString()
            );
            
            const receipt = await approveTx.wait();
            logger.info(`Token approval confirmed: ${receipt.hash}`);
            
            return receipt.hash;
        } catch (error) {
            logger.error("Failed to approve token:", error);
            throw handleError(error);
        }
    }
    
    async waitForTransaction(hash: string): Promise<TransactionReceipt> {
        try {
            if (!this.provider) {
                throw createError(
                    MoonwellErrorCode.WALLET_NOT_CONNECTED,
                    "Provider not initialized"
                );
            }
            
            const receipt = await this.provider.waitForTransaction(hash, 1, 60000); // 1 confirmation, 60s timeout
            
            if (!receipt) {
                throw createError(
                    MoonwellErrorCode.TIMEOUT,
                    "Transaction timeout"
                );
            }
            
            return {
                transactionHash: receipt.hash,
                blockNumber: receipt.blockNumber,
                blockHash: receipt.blockHash,
                gasUsed: receipt.gasUsed.toString(),
                status: receipt.status === 1 ? "success" : "reverted",
                logs: [...receipt.logs],
            };
        } catch (error) {
            logger.error("Failed to wait for transaction:", error);
            throw handleError(error);
        }
    }
    
    async getTokenInfo(tokenAddress: string): Promise<{
        name: string;
        symbol: string;
        decimals: number;
    }> {
        try {
            if (!this.provider) {
                throw createError(
                    MoonwellErrorCode.WALLET_NOT_CONNECTED,
                    "Provider not initialized"
                );
            }
            
            const tokenContract = new ethers.Contract(
                tokenAddress,
                ERC20_ABI,
                this.provider
            );
            
            const [name, symbol, decimals] = await Promise.all([
                tokenContract.name(),
                tokenContract.symbol(),
                tokenContract.decimals(),
            ]);
            
            return {
                name,
                symbol,
                decimals: Number(decimals),
            };
        } catch (error) {
            logger.error("Failed to get token info:", error);
            throw handleError(error);
        }
    }
    
    async estimateGas(tx: Transaction): Promise<BigNumber> {
        try {
            if (!this.provider) {
                throw createError(
                    MoonwellErrorCode.WALLET_NOT_CONNECTED,
                    "Provider not initialized"
                );
            }
            
            const estimatedGas = await this.provider.estimateGas({
                to: tx.to,
                from: tx.from || this.address,
                data: tx.data,
                value: tx.value || "0",
            });
            
            return new BigNumber(estimatedGas.toString());
        } catch (error) {
            logger.error("Failed to estimate gas:", error);
            throw handleError(error);
        }
    }
    
    async getGasPrice(): Promise<BigNumber> {
        try {
            if (!this.provider) {
                throw createError(
                    MoonwellErrorCode.WALLET_NOT_CONNECTED,
                    "Provider not initialized"
                );
            }
            
            const feeData = await this.provider.getFeeData();
            
            if (!feeData.gasPrice) {
                throw createError(
                    MoonwellErrorCode.RPC_ERROR,
                    "Failed to get gas price"
                );
            }
            
            return new BigNumber(feeData.gasPrice.toString());
        } catch (error) {
            logger.error("Failed to get gas price:", error);
            throw handleError(error);
        }
    }
    
    async stop(): Promise<void> {
        logger.info("Stopping wallet service...");
        // Clean up any resources if needed
    }
}