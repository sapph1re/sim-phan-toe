/**
 * Custom hook for sending gas-sponsored transactions via Privy
 *
 * When Privy is configured and the user has an embedded wallet,
 * transactions are sent through Privy's infrastructure which
 * automatically applies gas sponsorship.
 *
 * Falls back to wagmi's useWriteContract when Privy is not active.
 */
import { useCallback, useState } from "react";
import { encodeFunctionData, type Abi } from "viem";
import { useWriteContract } from "wagmi";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { isPrivyConfigured } from "../lib/privy";

interface WriteContractParams {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

interface UseSponsoredWriteContractReturn {
  writeContractAsync: (params: WriteContractParams) => Promise<`0x${string}`>;
  isPending: boolean;
  isSuccess: boolean;
  error: Error | null;
}

/**
 * Hook that provides gas-sponsored contract writes via Privy's embedded wallet
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

  // Check if we should use Privy (configured + has embedded wallet)
  const hasPrivyEmbeddedWallet = isPrivyConfigured && wallets.some((w) => w.walletClientType === "privy");

  const writeContractAsync = useCallback(
    async (params: WriteContractParams): Promise<`0x${string}`> => {
      const { address, abi, functionName, args } = params;

      setIsPending(true);
      setIsSuccess(false);
      setError(null);

      try {
        if (hasPrivyEmbeddedWallet) {
          // Use Privy's sendTransaction for gas sponsorship
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

          // Send via Privy's sendTransaction with gas sponsorship enabled
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

          // The receipt contains the transaction hash
          const txHash = txReceipt.hash as `0x${string}`;

          console.log("[SponsoredTx] Transaction sent via Privy:", txHash);

          // Note: Privy's sendTransaction already waits for the transaction to be mined
          // so we don't need to wait again here

          setIsSuccess(true);
          setIsPending(false);
          return txHash;
        } else {
          // Fallback to wagmi's writeContract
          console.log("[SponsoredTx] Using wagmi writeContract (no Privy embedded wallet)");
          const result = await wagmiWrite.writeContractAsync({
            address,
            abi,
            functionName,
            args: args as readonly unknown[],
          });

          setIsSuccess(true);
          setIsPending(false);
          return result;
        }
      } catch (err) {
        console.error("[SponsoredTx] Transaction failed:", err);
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        setIsPending(false);
        throw errorObj;
      }
    },
    [hasPrivyEmbeddedWallet, sendTransaction, wagmiWrite],
  );

  return {
    writeContractAsync,
    isPending: isPending || wagmiWrite.isPending,
    isSuccess: isSuccess || wagmiWrite.isSuccess,
    error: error || wagmiWrite.error,
  };
}
