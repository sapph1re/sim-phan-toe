/**
 * Custom hook for sending gas-sponsored transactions via Privy
 *
 * When Privy is configured and the user has an embedded wallet,
 * transactions are sent through Privy's infrastructure which
 * automatically applies gas sponsorship.
 *
 * Falls back to wagmi's useWriteContract when Privy is not active.
 *
 * Includes automatic retry logic with exponential backoff for
 * rate limits and temporary Privy infrastructure issues.
 */
import { useCallback, useState, useContext, createContext, type ReactNode } from "react";
import { encodeFunctionData, type Abi } from "viem";
import { useWriteContract } from "wagmi";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { isPrivyConfigured } from "../lib/privy";

// Retry configuration
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 8000;

// Retry status for UI display
export interface TransactionRetryStatus {
  isRetrying: boolean;
  attempt: number;
  maxRetries: number;
  message: string;
  functionName?: string;
}

// Context for sharing retry status globally
interface TransactionRetryContextValue {
  retryStatus: TransactionRetryStatus | null;
  setRetryStatus: (status: TransactionRetryStatus | null) => void;
}

const TransactionRetryContext = createContext<TransactionRetryContextValue | null>(null);

export function TransactionRetryProvider({ children }: { children: ReactNode }) {
  const [retryStatus, setRetryStatus] = useState<TransactionRetryStatus | null>(null);
  return (
    <TransactionRetryContext.Provider value={{ retryStatus, setRetryStatus }}>
      {children}
    </TransactionRetryContext.Provider>
  );
}

export function useTransactionRetryStatus() {
  const context = useContext(TransactionRetryContext);
  return context?.retryStatus ?? null;
}

// Helper to detect retryable Privy errors
function isRetryablePrivyError(error: unknown): boolean {
  if (!error) return false;

  const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  // Rate limit errors
  if (errorMessage.includes("rate limit") || errorMessage.includes("429") || errorMessage.includes("too many requests")) {
    return true;
  }

  // Network/connectivity errors
  if (errorMessage.includes("network") || errorMessage.includes("fetch failed") || errorMessage.includes("timeout")) {
    return true;
  }

  // Privy infrastructure issues
  if (errorMessage.includes("internal error") || errorMessage.includes("service unavailable") || errorMessage.includes("503")) {
    return true;
  }

  // Temporary failures
  if (errorMessage.includes("try again") || errorMessage.includes("temporarily")) {
    return true;
  }

  // NOT retryable: user rejection, reverts, invalid params
  if (
    errorMessage.includes("user rejected") ||
    errorMessage.includes("user denied") ||
    errorMessage.includes("rejected by user") ||
    errorMessage.includes("revert") ||
    errorMessage.includes("execution reverted") ||
    errorMessage.includes("invalid")
  ) {
    return false;
  }

  // Default: retry unknown errors once (Privy can have various transient issues)
  return true;
}

// Exponential backoff delay calculation
function getRetryDelay(attempt: number): number {
  const delay = BASE_DELAY_MS * Math.pow(2, attempt);
  return Math.min(delay, MAX_DELAY_MS);
}

// Sleep helper
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface WriteContractParams {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

interface UseSponsoredWriteContractReturn {
  writeContractAsync: (params: WriteContractParams) => Promise<`0x${string}`>;
  isPending: boolean;
  isSuccess: boolean;
  error: Error | null;
}

/**
 * Hook that provides gas-sponsored contract writes via Privy's embedded wallet
 * with automatic retry logic for rate limits and temporary issues
 */
export function useSponsoredWriteContract(): UseSponsoredWriteContractReturn {
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Privy's sendTransaction - automatically applies gas sponsorship
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();

  // Fallback to wagmi's useWriteContract
  const wagmiWrite = useWriteContract();

  // Get retry status context (may be null if not wrapped in provider)
  const retryContext = useContext(TransactionRetryContext);

  // Check if we should use Privy (configured + has embedded wallet)
  const hasPrivyEmbeddedWallet = isPrivyConfigured && wallets.some((w) => w.walletClientType === "privy");

  const writeContractAsync = useCallback(
    async (params: WriteContractParams): Promise<`0x${string}`> => {
      const { address, abi, functionName, args, value } = params;

      setIsPending(true);
      setIsSuccess(false);
      setError(null);

      // Helper to clear retry status
      const clearRetryStatus = () => {
        retryContext?.setRetryStatus(null);
      };

      // Helper to update retry status
      const updateRetryStatus = (attempt: number, message: string) => {
        retryContext?.setRetryStatus({
          isRetrying: true,
          attempt,
          maxRetries: MAX_RETRIES,
          message,
          functionName,
        });
      };

      try {
        // Check if transaction includes ETH value - sponsorship doesn't support payable transactions
        const hasEthValue = value !== undefined && value > 0n;

        if (hasPrivyEmbeddedWallet && !hasEthValue) {
          // Use Privy's sendTransaction for gas sponsorship with retry logic
          // Only for non-payable transactions (value = 0)
          console.log("[SponsoredTx] Using Privy sendTransaction for gas sponsorship");
          console.log("[SponsoredTx] Function:", functionName);
          console.log("[SponsoredTx] Args:", args);

          // Encode the contract call data
          const data = encodeFunctionData({
            abi,
            functionName,
            args: args as unknown[],
          });

          console.log("[SponsoredTx] Encoded data length:", data.length);
          console.log("[SponsoredTx] Encoded data (first 100 chars):", data.slice(0, 100));
          console.log("[SponsoredTx] Contract address:", address);
          console.log("[SponsoredTx] Chain ID: 11155111 (Sepolia)");

          // Log wallet details for debugging
          const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
          console.log("[SponsoredTx] Embedded wallet:", {
            address: embeddedWallet?.address,
            walletClientType: embeddedWallet?.walletClientType,
            chainId: embeddedWallet?.chainId,
          });

          // Retry loop for Privy transactions
          let lastError: unknown = null;
          for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
              // If retrying, show status and wait
              if (attempt > 0) {
                const delay = getRetryDelay(attempt - 1);
                console.log(`[SponsoredTx] Retry attempt ${attempt}/${MAX_RETRIES} after ${delay}ms delay`);
                updateRetryStatus(attempt, `Retrying transaction... (${attempt}/${MAX_RETRIES})`);
                await sleep(delay);
              }

              // Send via Privy's sendTransaction with gas sponsorship enabled
              console.log("[SponsoredTx] Calling sendTransaction with sponsor: true");
              const txReceipt = await sendTransaction(
                {
                  to: address,
                  data,
                  chainId: 11155111, // Sepolia
                },
                {
                  // Enable gas sponsorship - Privy will pay gas fees from your credits
                  sponsor: true,
                },
              );

              // Success! Clear retry status
              clearRetryStatus();

              // The receipt contains the transaction hash
              const txHash = txReceipt.hash as `0x${string}`;

              console.log("[SponsoredTx] Transaction sent via Privy:", txHash);
              console.log("[SponsoredTx] Transaction receipt:", txReceipt);
              console.log("[SponsoredTx] Transaction receipt keys:", Object.keys(txReceipt));

              // Note: Privy's sendTransaction already waits for the transaction to be mined
              // so we don't need to wait again here

              setIsSuccess(true);
              setIsPending(false);
              return txHash;
            } catch (err) {
              lastError = err;
              console.error(`[SponsoredTx] Attempt ${attempt + 1} failed:`, err);

              // Check if error is retryable
              if (!isRetryablePrivyError(err)) {
                console.log("[SponsoredTx] Error is not retryable, giving up");
                clearRetryStatus();
                break;
              }

              // If we've exhausted retries, give up
              if (attempt >= MAX_RETRIES) {
                console.log("[SponsoredTx] Max retries reached, giving up");
                clearRetryStatus();
                break;
              }

              // Will retry on next iteration
              console.log("[SponsoredTx] Error is retryable, will retry...");
            }
          }

          // If we get here, all retries failed
          throw lastError;
        } else if (hasPrivyEmbeddedWallet && hasEthValue) {
          // Payable transaction with Privy wallet - send without sponsorship
          // Gas sponsorship doesn't support transactions that send ETH
          console.log("[SponsoredTx] Using Privy sendTransaction WITHOUT sponsorship (payable tx)");
          console.log("[SponsoredTx] Function:", functionName);
          console.log("[SponsoredTx] Value:", value.toString(), "wei");

          const data = encodeFunctionData({
            abi,
            functionName,
            args: args as unknown[],
          });

          const txReceipt = await sendTransaction({
            to: address,
            data,
            chainId: 11155111,
            value: `0x${value.toString(16)}`,
          });

          const txHash = txReceipt.hash as `0x${string}`;
          console.log("[SponsoredTx] Payable transaction sent via Privy (unsponsored):", txHash);

          setIsSuccess(true);
          setIsPending(false);
          return txHash;
        } else {
          // Fallback to wagmi's writeContract (no retry logic for external wallets)
          console.log("[SponsoredTx] Using wagmi writeContract (no Privy embedded wallet)");
          const result = await wagmiWrite.writeContractAsync({
            address,
            abi,
            functionName,
            args: args as readonly unknown[],
            value,
          });

          setIsSuccess(true);
          setIsPending(false);
          return result;
        }
      } catch (err) {
        // Clear any retry status
        clearRetryStatus();

        // Detailed error logging for debugging
        console.error("[SponsoredTx] Transaction failed:", err);
        console.error("[SponsoredTx] Error type:", typeof err);
        console.error("[SponsoredTx] Error constructor:", err?.constructor?.name);
        console.error("[SponsoredTx] Error message:", err instanceof Error ? err.message : String(err));
        console.error("[SponsoredTx] Error stack:", err instanceof Error ? err.stack : "No stack trace");

        // Log error properties for Privy-specific errors
        if (err && typeof err === "object") {
          console.error("[SponsoredTx] Error properties:", Object.keys(err));
          console.error("[SponsoredTx] Error details:", JSON.stringify(err, Object.getOwnPropertyNames(err), 2));

          // Check for Privy-specific error fields
          if ("code" in err) {
            console.error("[SponsoredTx] Error code:", (err as { code: unknown }).code);
          }
          if ("reason" in err) {
            console.error("[SponsoredTx] Error reason:", (err as { reason: unknown }).reason);
          }
          if ("data" in err) {
            console.error("[SponsoredTx] Error data:", (err as { data: unknown }).data);
          }
        }

        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        setIsPending(false);
        throw errorObj;
      }
    },
    [hasPrivyEmbeddedWallet, sendTransaction, wagmiWrite, wallets, retryContext],
  );

  return {
    writeContractAsync,
    isPending: isPending || wagmiWrite.isPending,
    isSuccess: isSuccess || wagmiWrite.isSuccess,
    error: error || wagmiWrite.error,
  };
}

