import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useAccount, useChainId } from "wagmi";
// Import from bundle - works with the UMD CDN loaded in index.html
// See: https://docs.zama.org/protocol/relayer-sdk-guides/development-guide/web-applications
import { initSDK, createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/bundle";

// Sepolia chain ID
const SEPOLIA_CHAIN_ID = 11155111;

// Types for FHE operations
export interface EncryptedInput {
  handles: `0x${string}`[];
  inputProof: `0x${string}`;
}

// FHE Instance type from the SDK
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FHEInstanceType = any; // The SDK doesn't export proper types yet

// FHE Context
interface FHEContextType {
  instance: FHEInstanceType | null;
  isLoading: boolean;
  isInitialized: boolean;
  isSupported: boolean; // True only on Sepolia
  error: Error | null;
  encryptMove: (contractAddress: string, x: number, y: number) => Promise<EncryptedInput>;
  publicDecrypt: (handles: `0x${string}`[]) => Promise<{
    clearValues: Record<string, boolean | bigint>;
    decryptionProof: `0x${string}`;
  }>;
}

const FHEContext = createContext<FHEContextType | null>(null);

// FHE Provider Component
export function FHEProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const [instance, setInstance] = useState<FHEInstanceType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [sdkLoaded, setSdkLoaded] = useState(false);

  // Check if we're on a supported network (Sepolia only for now)
  const isSupported = chainId === SEPOLIA_CHAIN_ID;

  // Step 1: Load SDK WASM on mount (only on Sepolia)
  useEffect(() => {
    // Don't load SDK on unsupported networks
    if (!isSupported) {
      console.log(`FHE not supported on chain ${chainId}. FHE features require Sepolia (${SEPOLIA_CHAIN_ID}).`);
      setSdkLoaded(false);
      setInstance(null);
      setIsInitialized(false);
      setError(null);
      return;
    }

    let mounted = true;

    async function loadSDK() {
      try {
        await initSDK();
        if (mounted) {
          setSdkLoaded(true);
          console.log("FHE SDK WASM loaded successfully");
        }
      } catch (err) {
        console.error("Failed to load FHE SDK:", err);
        if (mounted) {
          setError(err instanceof Error ? err : new Error("Failed to load FHE SDK"));
        }
      }
    }

    loadSDK();

    return () => {
      mounted = false;
    };
  }, [isSupported, chainId]);

  // Step 2: Create instance when wallet is connected, SDK is loaded, and on Sepolia
  useEffect(() => {
    if (!isSupported || !sdkLoaded || !isConnected || !address) {
      // Reset state when disconnected or on wrong network
      if ((!isConnected || !isSupported) && isInitialized) {
        setInstance(null);
        setIsInitialized(false);
      }
      return;
    }

    let mounted = true;

    async function initFHE() {
      setIsLoading(true);
      setError(null);

      try {
        if (typeof window === "undefined" || !window.ethereum) {
          throw new Error("No ethereum provider found");
        }

        // Create instance with Sepolia config
        const config = {
          ...SepoliaConfig,
          network: window.ethereum,
        };

        const fheInstance = await createInstance(config);

        if (mounted) {
          setInstance(fheInstance);
          setIsInitialized(true);
          console.log("FHE instance created successfully for address:", address);
        }
      } catch (err) {
        console.error("FHE initialization error:", err);
        if (mounted) {
          setError(err instanceof Error ? err : new Error("Failed to initialize FHE"));
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    initFHE();

    return () => {
      mounted = false;
    };
  }, [isSupported, sdkLoaded, isConnected, address, chainId, isInitialized]);

  // Encrypt a move (x, y coordinates)
  // See: https://docs.zama.org/protocol/relayer-sdk-guides/fhevm-relayer/input
  const encryptMove = useCallback(
    async (contractAddress: string, x: number, y: number): Promise<EncryptedInput> => {
      if (!isSupported) {
        throw new Error("FHE encryption is only available on Sepolia testnet");
      }
      if (!instance) {
        throw new Error("FHE SDK not initialized");
      }
      if (!address) {
        throw new Error("Wallet not connected");
      }

      // Create encrypted input for the contract
      const input = instance.createEncryptedInput(contractAddress, address);

      // Add the x and y coordinates as uint8 values
      input.add8(x);
      input.add8(y);

      // Encrypt and get handles + proof
      const encrypted = await input.encrypt();

      return {
        handles: encrypted.handles as `0x${string}`[],
        inputProof: encrypted.inputProof as `0x${string}`,
      };
    },
    [instance, address, isSupported],
  );

  // Public decryption
  // See: https://docs.zama.org/protocol/relayer-sdk-guides/fhevm-relayer/decryption/public-decryption
  const publicDecrypt = useCallback(
    async (
      handles: `0x${string}`[],
    ): Promise<{
      clearValues: Record<string, boolean | bigint>;
      decryptionProof: `0x${string}`;
    }> => {
      if (!isSupported) {
        throw new Error("FHE decryption is only available on Sepolia testnet");
      }
      if (!instance) {
        throw new Error("FHE SDK not initialized");
      }

      // Request public decryption through the relayer
      const result = await instance.publicDecrypt(handles);

      return {
        clearValues: result.clearValues,
        decryptionProof: result.decryptionProof as `0x${string}`,
      };
    },
    [instance, isSupported],
  );

  const value: FHEContextType = {
    instance,
    isLoading,
    isInitialized,
    isSupported,
    error,
    encryptMove,
    publicDecrypt,
  };

  return <FHEContext.Provider value={value}>{children}</FHEContext.Provider>;
}

// Hook to use FHE functionality
export function useFHE() {
  const context = useContext(FHEContext);
  if (!context) {
    throw new Error("useFHE must be used within an FHEProvider");
  }
  return context;
}

// Hook for encrypting moves
export function useEncryptMove() {
  const { encryptMove, isLoading: fheLoading, isInitialized, isSupported, error: fheError } = useFHE();
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const encrypt = useCallback(
    async (contractAddress: string, x: number, y: number): Promise<EncryptedInput | null> => {
      if (!isSupported) {
        setError(new Error("FHE encryption requires Sepolia testnet"));
        return null;
      }
      if (!isInitialized) {
        setError(new Error("FHE SDK not yet initialized"));
        return null;
      }

      setIsEncrypting(true);
      setError(null);

      try {
        const result = await encryptMove(contractAddress, x, y);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Encryption failed");
        setError(error);
        return null;
      } finally {
        setIsEncrypting(false);
      }
    },
    [encryptMove, isInitialized, isSupported],
  );

  return {
    encrypt,
    isEncrypting,
    isFHELoading: fheLoading,
    isFHEReady: isInitialized && isSupported,
    isFHESupported: isSupported,
    error: error || fheError,
  };
}

// Hook for public decryption
export function usePublicDecrypt() {
  const { publicDecrypt, isLoading: fheLoading, isInitialized, isSupported, error: fheError } = useFHE();
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const decrypt = useCallback(
    async (
      handles: `0x${string}`[],
    ): Promise<{
      clearValues: Record<string, boolean | bigint>;
      decryptionProof: `0x${string}`;
    } | null> => {
      if (!isSupported) {
        setError(new Error("FHE decryption requires Sepolia testnet"));
        return null;
      }
      if (!isInitialized) {
        setError(new Error("FHE SDK not yet initialized"));
        return null;
      }

      setIsDecrypting(true);
      setError(null);

      try {
        const result = await publicDecrypt(handles);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Decryption failed");
        setError(error);
        return null;
      } finally {
        setIsDecrypting(false);
      }
    },
    [publicDecrypt, isInitialized, isSupported],
  );

  return {
    decrypt,
    isDecrypting,
    isFHELoading: fheLoading,
    isFHEReady: isInitialized && isSupported,
    isFHESupported: isSupported,
    error: error || fheError,
  };
}

// Export the context for direct use if needed
export { FHEContext };
