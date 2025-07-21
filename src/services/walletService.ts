import { Service, IAgentRuntime, ServiceType } from "@elizaos/core";
import { ethers } from "ethers";
import { BigNumber } from "bignumber.js";
import { 
    Transaction, 
    SignedTransaction, 
    TransactionReceipt,
    MoonwellError,
    MoonwellErrorCode
} from "../types";

interface WalletServiceState {
    isConnected: boolean;
    address?: string;
    network?: string;
}

export class WalletService extends Service<WalletServiceState> {
    private wallet: ethers.Wallet | null = null;
    private provider: ethers.Provider | null = null;

    static readonly serviceType: ServiceType = ServiceType.WALLET;

    constructor() {
        super();
        this.state = {
            isConnected: false
        };
    }

    async initialize(runtime: IAgentRuntime): Promise<void> {
        try {
            const privateKey = runtime.getSetting('WALLET_PRIVATE_KEY');
            const rpcUrl = runtime.getSetting('BASE_RPC_URL') || 'https://base.publicnode.com';

            if (!privateKey) {
                console.warn('[WalletService] No private key provided, running in read-only mode');
                this.provider = new ethers.JsonRpcProvider(rpcUrl);
                return;
            }

            this.provider = new ethers.JsonRpcProvider(rpcUrl);
            this.wallet = new ethers.Wallet(privateKey, this.provider);

            // Verify connection
            const network = await this.provider.getNetwork();
            const address = await this.wallet.getAddress();

            this.state = {
                isConnected: true,
                address,
                network: network.name
            };

            console.log('[WalletService] Initialized successfully:', {
                address,
                network: network.name
            });
        } catch (error) {
            console.error('[WalletService] Initialization failed:', error);
            throw error;
        }
    }

    async connect(): Promise<void> {
        if (this.state.isConnected) {
            return;
        }

        if (!this.wallet) {
            throw this.createError(
                MoonwellErrorCode.WALLET_NOT_CONNECTED,
                'No wallet configured'
            );
        }

        try {
            const address = await this.wallet.getAddress();
            const network = await this.provider!.getNetwork();

            this.state = {
                isConnected: true,
                address,
                network: network.name
            };
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async getAddress(): Promise<string> {
        if (!this.wallet) {
            throw this.createError(
                MoonwellErrorCode.WALLET_NOT_CONNECTED,
                'Wallet not connected'
            );
        }

        return this.wallet.address;
    }

    async signTransaction(tx: Transaction): Promise<SignedTransaction> {
        if (!this.wallet) {
            throw this.createError(
                MoonwellErrorCode.WALLET_NOT_CONNECTED,
                'Wallet not connected'
            );
        }

        try {
            // Prepare transaction
            const transaction: ethers.TransactionRequest = {
                to: tx.to,
                from: tx.from,
                data: tx.data,
                value: tx.value ? ethers.parseEther(tx.value) : undefined,
                gasLimit: tx.gasLimit ? BigInt(tx.gasLimit) : undefined,
                gasPrice: tx.gasPrice ? ethers.parseUnits(tx.gasPrice, 'gwei') : undefined
            };

            // Sign transaction
            const signedTx = await this.wallet.signTransaction(transaction);
            
            return {
                ...tx,
                signature: signedTx,
                hash: ethers.keccak256(signedTx)
            };
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async getBalance(token?: string): Promise<BigNumber> {
        if (!this.wallet || !this.provider) {
            throw this.createError(
                MoonwellErrorCode.WALLET_NOT_CONNECTED,
                'Wallet not connected'
            );
        }

        try {
            if (!token || token.toLowerCase() === 'eth') {
                // Get ETH balance
                const balance = await this.provider.getBalance(this.wallet.address);
                return new BigNumber(ethers.formatEther(balance));
            } else {
                // Get ERC20 token balance
                const tokenContract = new ethers.Contract(
                    token,
                    ['function balanceOf(address) view returns (uint256)'],
                    this.provider
                );
                
                const balance = await tokenContract.balanceOf(this.wallet.address);
                
                // Assume 18 decimals for simplicity (should fetch decimals in production)
                return new BigNumber(ethers.formatUnits(balance, 18));
            }
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async approveToken(
        token: string, 
        spender: string, 
        amount: BigNumber
    ): Promise<string> {
        if (!this.wallet) {
            throw this.createError(
                MoonwellErrorCode.WALLET_NOT_CONNECTED,
                'Wallet not connected'
            );
        }

        try {
            const tokenContract = new ethers.Contract(
                token,
                [
                    'function approve(address spender, uint256 amount) returns (bool)',
                    'function allowance(address owner, address spender) view returns (uint256)'
                ],
                this.wallet
            );

            // Check current allowance
            const currentAllowance = await tokenContract.allowance(
                this.wallet.address,
                spender
            );

            const requiredAmount = ethers.parseUnits(amount.toString(), 18);

            if (currentAllowance >= requiredAmount) {
                return 'existing'; // No approval needed
            }

            // Execute approval
            const tx = await tokenContract.approve(spender, requiredAmount);
            const receipt = await tx.wait();

            return receipt.hash;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async waitForTransaction(hash: string): Promise<TransactionReceipt> {
        if (!this.provider) {
            throw this.createError(
                MoonwellErrorCode.WALLET_NOT_CONNECTED,
                'Provider not connected'
            );
        }

        try {
            const receipt = await this.provider.waitForTransaction(hash);
            
            if (!receipt) {
                throw this.createError(
                    MoonwellErrorCode.TRANSACTION_FAILED,
                    'Transaction receipt not found'
                );
            }

            return {
                transactionHash: receipt.hash,
                blockNumber: receipt.blockNumber,
                blockHash: receipt.blockHash,
                gasUsed: receipt.gasUsed.toString(),
                status: receipt.status === 1 ? 'success' : 'reverted',
                logs: receipt.logs
            };
        } catch (error) {
            throw this.handleError(error);
        }
    }

    async sendTransaction(tx: Transaction): Promise<string> {
        if (!this.wallet) {
            throw this.createError(
                MoonwellErrorCode.WALLET_NOT_CONNECTED,
                'Wallet not connected'
            );
        }

        try {
            const transaction: ethers.TransactionRequest = {
                to: tx.to,
                from: tx.from,
                data: tx.data,
                value: tx.value ? ethers.parseEther(tx.value) : undefined,
                gasLimit: tx.gasLimit ? BigInt(tx.gasLimit) : undefined,
                gasPrice: tx.gasPrice ? ethers.parseUnits(tx.gasPrice, 'gwei') : undefined
            };

            const txResponse = await this.wallet.sendTransaction(transaction);
            return txResponse.hash;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    private createError(
        code: MoonwellErrorCode,
        message: string,
        details?: any
    ): MoonwellError {
        return {
            code,
            message,
            details
        };
    }

    private handleError(error: any): MoonwellError {
        if (error.code && error.message) {
            return error as MoonwellError;
        }

        // Map common errors
        if (error.message?.includes('insufficient funds')) {
            return this.createError(
                MoonwellErrorCode.INSUFFICIENT_BALANCE,
                'Insufficient funds for transaction',
                error
            );
        }

        if (error.message?.includes('network')) {
            return this.createError(
                MoonwellErrorCode.RPC_ERROR,
                'Network error',
                error
            );
        }

        return this.createError(
            MoonwellErrorCode.TRANSACTION_FAILED,
            'Transaction failed',
            error
        );
    }
}