import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useAccount, useChainId } from "wagmi";
// Import from bundle - uses window.relayerSDK set up by UMD script in index.html
// See: https://docs.zama.org/protocol/relayer-sdk-guides/development-guide/web-applications
import { initSDK, createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/bundle";
import { isPrivyConfigured } from "./privy";

// Sepolia chain ID
const SEPOLIA_CHAIN_ID = 11155111;

// Types for FHE operations
export interface EncryptedInput {
  handles: `0x${string}`[];
  inputProof: `0x${string}`;
}

// Custom error class for Zama relayer errors with detailed information
export class RelayerError extends Error {
  public readonly statusCode?: number;
  public readonly statusText?: string;
  public readonly relayerMessage?: string;
  public readonly isRelayerError: boolean = true;
  public readonly originalError?: unknown;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      statusText?: string;
      relayerMessage?: string;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "RelayerError";
    this.statusCode = options?.statusCode;
    this.statusText = options?.statusText;
    this.relayerMessage = options?.relayerMessage;
    this.originalError = options?.cause;
  }

  // Format error for display
  getDisplayMessage(): string {
    const parts: string[] = [];
    if (this.statusCode) {
      parts.push(`Status ${this.statusCode}${this.statusText ? ` (${this.statusText})` : ""}`);
    }
    if (this.relayerMessage) {
      parts.push(this.relayerMessage);
    }
    if (parts.length === 0) {
      parts.push(this.message);
    }
    return parts.join(": ");
  }
}

// Helper to extract detailed error information from SDK errors
export function parseRelayerError(error: unknown): RelayerError {
  // Already a RelayerError
  if (error instanceof RelayerError) {
    return error;
  }

  // Extract information from various error formats
  let statusCode: number | undefined;
  let statusText: string | undefined;
  let relayerMessage: string | undefined;
  let originalMessage = "Unknown relayer error";

  if (error instanceof Error) {
    originalMessage = error.message;

    // Try to extract status code from error message (e.g., "Request failed with status 500")
    const statusMatch = originalMessage.match(/status\s*[:=]?\s*(\d{3})/i);
    if (statusMatch) {
      statusCode = parseInt(statusMatch[1], 10);
    }

    // Try to extract JSON message from error
    // The SDK might include the response body in the error message
    const jsonMatch = originalMessage.match(/\{[\s\S]*"message"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.message) {
          relayerMessage = parsed.message;
        }
      } catch {
        // Failed to parse JSON, continue with other extraction methods
      }
    }

    // Check if error has additional properties (some SDKs attach these)
    const anyError = error as unknown as Record<string, unknown>;

    // Check for response object (common in fetch-based errors)
    if (anyError.response && typeof anyError.response === "object") {
      const response = anyError.response as Record<string, unknown>;
      if (typeof response.status === "number") statusCode = response.status;
      if (typeof response.statusText === "string") statusText = response.statusText;
      if (typeof response.data === "object" && response.data) {
        const data = response.data as Record<string, unknown>;
        if (typeof data.message === "string") relayerMessage = data.message;
      }
    }

    // Check for status directly on error (axios-style)
    if (typeof anyError.status === "number") statusCode = anyError.status;
    if (typeof anyError.statusCode === "number") statusCode = anyError.statusCode;
    if (typeof anyError.statusText === "string") statusText = anyError.statusText;

    // Check for body/data property
    if (typeof anyError.body === "string") {
      try {
        const parsed = JSON.parse(anyError.body);
        if (parsed.message) relayerMessage = parsed.message;
      } catch {
        // Not JSON, use as-is if short enough
        if (anyError.body.length < 500) relayerMessage = anyError.body;
      }
    }
    if (typeof anyError.data === "object" && anyError.data) {
      const data = anyError.data as Record<string, unknown>;
      if (typeof data.message === "string") relayerMessage = data.message;
    }

    // Look for nested cause (ES2022+ feature, access via anyError)
    if (anyError.cause) {
      const causeError = parseRelayerError(anyError.cause);
      if (!statusCode && causeError.statusCode) statusCode = causeError.statusCode;
      if (!relayerMessage && causeError.relayerMessage) relayerMessage = causeError.relayerMessage;
    }
  } else if (typeof error === "string") {
    originalMessage = error;
  }

  // Create descriptive message based on status code
  let displayMessage = "Zama relayer request failed";
  if (statusCode) {
    switch (statusCode) {
      case 500:
        displayMessage = "Zama relayer internal server error";
        break;
      case 520:
        displayMessage = "Zama relayer unknown error (520)";
        break;
      case 502:
        displayMessage = "Zama relayer bad gateway";
        break;
      case 503:
        displayMessage = "Zama relayer service unavailable";
        break;
      case 504:
        displayMessage = "Zama relayer gateway timeout";
        break;
      case 408:
        displayMessage = "Zama relayer request timeout";
        break;
      default:
        displayMessage = `Zama relayer error (${statusCode})`;
    }
  }

  return new RelayerError(displayMessage, {
    statusCode,
    statusText,
    relayerMessage,
    cause: error,
  });
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

// Context for passing Privy wallets to FHE provider
interface PrivyWallet {
  walletClientType: string;
  address?: string;
  getEthereumProvider: () => Promise<unknown>;
}

// EIP-1193 Provider type for FHE SDK
interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

// Hook to get the active EIP-1193 provider
// Supports both Privy embedded wallets and external browser wallets
// privyWallets is passed in from parent component that can use Privy hooks
function useEthereumProvider(privyWallets: PrivyWallet[] = []) {
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function getProvider() {
      // First, try to get provider from Privy embedded wallet
      if (isPrivyConfigured && privyWallets.length > 0) {
        // Find the embedded wallet (Privy wallet) or use the first available
        const embeddedWallet = privyWallets.find(
          (w) => w.walletClientType === "privy"
        );
        const activeWallet = embeddedWallet || privyWallets[0];

        if (activeWallet) {
          try {
            // Get EIP-1193 provider from Privy wallet
            const walletProvider = await activeWallet.getEthereumProvider();
            if (walletProvider) {
              setProvider(walletProvider as Eip1193Provider);
              setIsReady(true);
              console.log("Using Privy wallet provider:", activeWallet.walletClientType);
              return;
            }
          } catch (err) {
            console.warn("Failed to get Privy wallet provider:", err);
          }
        }
      }

      // Fallback to window.ethereum for external wallets
      if (typeof window !== "undefined" && window.ethereum) {
        setProvider(window.ethereum as Eip1193Provider);
        setIsReady(true);
        console.log("Using window.ethereum provider");
        return;
      }

      setProvider(null);
      setIsReady(false);
    }

    getProvider();
  }, [privyWallets]);

  return { provider, isReady };
}

// Inner FHE Provider that receives Privy wallets as props
function FHEProviderInner({ children, privyWallets = [] }: { children: ReactNode; privyWallets?: PrivyWallet[] }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { provider: ethereumProvider, isReady: providerReady } = useEthereumProvider(privyWallets);
  
  // Check if user has a wallet connection (either wagmi or Privy)
  const hasWalletConnection = isConnected || privyWallets.length > 0;
  const activeAddress = address || (privyWallets.length > 0 ? privyWallets[0]?.address : undefined);

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
        // Disable threading to avoid SharedArrayBuffer issues
        await initSDK({ thread: 0 });
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
    if (!isSupported || !sdkLoaded || !hasWalletConnection || !activeAddress || !providerReady || !ethereumProvider) {
      // Reset state when disconnected or on wrong network
      if ((!hasWalletConnection || !isSupported) && isInitialized) {
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
        if (!ethereumProvider) {
          throw new Error("No ethereum provider found");
        }

        // Create instance with Sepolia config using the active provider
        // (could be Privy embedded wallet or external browser wallet)
        const config = {
          ...SepoliaConfig,
          network: ethereumProvider,
        };

        const fheInstance = await createInstance(config);

        if (mounted) {
          setInstance(fheInstance);
          setIsInitialized(true);
          console.log("FHE instance created successfully for address:", activeAddress);
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
  }, [isSupported, sdkLoaded, hasWalletConnection, activeAddress, chainId, isInitialized, providerReady, ethereumProvider]);

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
      if (!activeAddress) {
        throw new Error("Wallet not connected");
      }

      // Create encrypted input for the contract
      const input = instance.createEncryptedInput(contractAddress, activeAddress);

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
    [instance, activeAddress, isSupported],
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

      try {
        console.log("[FHE] Starting publicDecrypt with handles:", handles);
        console.log("[FHE] Number of handles:", handles.length);
        console.log("[FHE] Instance available:", !!instance);
        console.log("[FHE] Is supported:", isSupported);

        // Request public decryption through the relayer
        const result = await instance.publicDecrypt(handles);

        console.log("[FHE] Decryption successful");
        console.log("[FHE] Clear values:", result.clearValues);
        console.log("[FHE] Decryption proof length:", result.decryptionProof?.length || 0);
        console.log("[FHE] Decryption proof (first 100 chars):", result.decryptionProof?.slice(0, 100) || "N/A");

        return {
          clearValues: result.clearValues,
          decryptionProof: result.decryptionProof as `0x${string}`,
        };
      } catch (error) {
        // Log the full error for debugging
        console.error("[FHE] Public decrypt relayer error:", error);
        console.error("[FHE] Error type:", typeof error);
        console.error("[FHE] Error constructor:", error?.constructor?.name);
        if (error && typeof error === "object") {
          console.error("[FHE] Error properties:", Object.keys(error));
          console.error("[FHE] Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        }

        // Parse and re-throw as RelayerError with detailed information
        throw parseRelayerError(error);
      }
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

// Wrapper component that gets Privy wallets when Privy is configured
function PrivyWalletsWrapper({ children }: { children: ReactNode }) {
  // Conditionally import and use Privy hooks only when configured
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let wallets: any[] = [];
  
  if (isPrivyConfigured) {
    try {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const { useWallets } = require("@privy-io/react-auth");
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const walletsResult = useWallets();
      wallets = walletsResult.wallets || [];
    } catch {
      // Privy not available, use empty wallets
    }
  }

  return <FHEProviderInner privyWallets={wallets}>{children}</FHEProviderInner>;
}

// FHE Provider Component - exported wrapper
export function FHEProvider({ children }: { children: ReactNode }) {
  return <PrivyWalletsWrapper>{children}</PrivyWalletsWrapper>;
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
  const [error, setError] = useState<Error | RelayerError | null>(null);

  const decrypt = useCallback(
    async (
      handles: `0x${string}`[],
    ): Promise<{
      clearValues: Record<string, boolean | bigint>;
      decryptionProof: `0x${string}`;
    }> => {
      if (!isSupported) {
        const err = new Error("FHE decryption requires Sepolia testnet");
        setError(err);
        throw err;
      }
      if (!isInitialized) {
        const err = new Error("FHE SDK not yet initialized");
        setError(err);
        throw err;
      }

      setIsDecrypting(true);
      setError(null);

      try {
        const result = await publicDecrypt(handles);
        return result;
      } catch (err) {
        // Preserve RelayerError with all its details, otherwise wrap in generic error
        let errorToThrow: Error | RelayerError;
        if (err instanceof RelayerError) {
          errorToThrow = err;
        } else {
          errorToThrow = err instanceof Error ? err : new Error("Decryption failed");
        }
        setError(errorToThrow);
        // Re-throw so callers can catch the detailed error
        throw errorToThrow;
      } finally {
        setIsDecrypting(false);
      }
    },
    [publicDecrypt, isInitialized, isSupported],
  );

  // Helper to get relayer-specific error details
  const getRelayerErrorDetails = useCallback((): {
    isRelayerError: boolean;
    statusCode?: number;
    statusText?: string;
    relayerMessage?: string;
    displayMessage: string;
  } | null => {
    const currentError = error || fheError;
    if (!currentError) return null;

    if (currentError instanceof RelayerError) {
      return {
        isRelayerError: true,
        statusCode: currentError.statusCode,
        statusText: currentError.statusText,
        relayerMessage: currentError.relayerMessage,
        displayMessage: currentError.getDisplayMessage(),
      };
    }

    return {
      isRelayerError: false,
      displayMessage: currentError.message,
    };
  }, [error, fheError]);

  return {
    decrypt,
    isDecrypting,
    isFHELoading: fheLoading,
    isFHEReady: isInitialized && isSupported,
    isFHESupported: isSupported,
    error: error || fheError,
    getRelayerErrorDetails,
  };
}

// Export the context for direct use if needed
export { FHEContext };
