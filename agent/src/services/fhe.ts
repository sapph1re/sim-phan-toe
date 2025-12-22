// FHE service for encryption and decryption operations
// Non-React wrapper around @zama-fhe/relayer-sdk

import { createLogger } from "../utils/logger.js";
import { withRelayerRetry } from "../utils/retry.js";

const logger = createLogger("FHE");

// Type definitions for the SDK (SDK doesn't export proper types yet)
/* eslint-disable @typescript-eslint/no-explicit-any */
type FHEInstance = any;
type FHEModule = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface EncryptedInput {
  handles: `0x${string}`[];
  inputProof: `0x${string}`;
}

export interface DecryptionResult {
  clearValues: Record<string, boolean | bigint>;
  decryptionProof: `0x${string}`;
}

// Custom error class for relayer errors
export class RelayerError extends Error {
  public readonly statusCode?: number;
  public readonly statusText?: string;
  public readonly relayerMessage?: string;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      statusText?: string;
      relayerMessage?: string;
    }
  ) {
    super(message);
    this.name = "RelayerError";
    this.statusCode = options?.statusCode;
    this.statusText = options?.statusText;
    this.relayerMessage = options?.relayerMessage;
  }
}

// Parse error from SDK to RelayerError
function parseRelayerError(error: unknown): RelayerError {
  if (error instanceof RelayerError) {
    return error;
  }

  let statusCode: number | undefined;
  let relayerMessage: string | undefined;
  let originalMessage = "Unknown relayer error";

  if (error instanceof Error) {
    originalMessage = error.message;

    const statusMatch = originalMessage.match(/status\s*[:=]?\s*(\d{3})/i);
    if (statusMatch) {
      statusCode = parseInt(statusMatch[1], 10);
    }

    const jsonMatch = originalMessage.match(/\{[\s\S]*"message"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.message) {
          relayerMessage = parsed.message;
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

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
      default:
        displayMessage = `Zama relayer error (${statusCode})`;
    }
  }

  return new RelayerError(displayMessage, {
    statusCode,
    relayerMessage,
  });
}

export class FHEService {
  private instance: FHEInstance | null = null;
  private initPromise: Promise<void> | null = null;
  private contractAddress: `0x${string}`;
  private playerAddress: `0x${string}`;

  constructor(contractAddress: `0x${string}`, playerAddress: `0x${string}`) {
    this.contractAddress = contractAddress;
    this.playerAddress = playerAddress;
  }

  async initialize(): Promise<void> {
    if (this.instance) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    logger.info("Initializing FHE SDK...");

    try {
      // Dynamic import of the SDK (use any to avoid TS module resolution issues)
      const sdk: FHEModule = await import("@zama-fhe/relayer-sdk");
      const { initSDK, createInstance, SepoliaConfig } = sdk;

      // Initialize WASM with threading disabled for Node.js compatibility
      await initSDK({ thread: 0 });
      logger.debug("FHE SDK WASM loaded");

      // Create instance with Sepolia config
      // For Node.js, we need to provide a network adapter
      const config = {
        ...SepoliaConfig,
        network: {
          request: async ({ method, params }: { method: string; params?: unknown[] }) => {
            // Use viem's HTTP transport for RPC calls
            const rpcUrl = process.env.SEPOLIA_RPC_URL;
            if (!rpcUrl) {
              throw new Error("SEPOLIA_RPC_URL not set");
            }

            const response = await fetch(rpcUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: Date.now(),
                method,
                params,
              }),
            });

            const data = (await response.json()) as { error?: { message: string }; result?: unknown };
            if (data.error) {
              throw new Error(data.error.message);
            }
            return data.result;
          },
        },
      };

      this.instance = await createInstance(config);
      logger.info("FHE SDK initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize FHE SDK", error);
      this.initPromise = null;
      throw error;
    }
  }

  async encryptMove(x: number, y: number): Promise<EncryptedInput> {
    await this.initialize();

    if (!this.instance) {
      throw new Error("FHE SDK not initialized");
    }

    logger.debug("Encrypting move", { x, y });

    try {
      const input = this.instance.createEncryptedInput(this.contractAddress, this.playerAddress);
      input.add8(x);
      input.add8(y);

      const encrypted = await input.encrypt();

      return {
        handles: encrypted.handles as `0x${string}`[],
        inputProof: encrypted.inputProof as `0x${string}`,
      };
    } catch (error) {
      logger.error("Failed to encrypt move", error);
      throw parseRelayerError(error);
    }
  }

  async publicDecrypt(handles: `0x${string}`[]): Promise<DecryptionResult> {
    await this.initialize();

    if (!this.instance) {
      throw new Error("FHE SDK not initialized");
    }

    logger.debug("Requesting public decryption", { handleCount: handles.length });

    try {
      const result = await withRelayerRetry(async () => {
        return await this.instance!.publicDecrypt(handles);
      });

      return {
        clearValues: result.clearValues,
        decryptionProof: result.decryptionProof as `0x${string}`,
      };
    } catch (error) {
      logger.error("Failed to decrypt", error);
      throw parseRelayerError(error);
    }
  }

  // Decrypt a single boolean handle
  async decryptBool(handle: `0x${string}`): Promise<{ value: boolean; proof: `0x${string}` }> {
    const result = await this.publicDecrypt([handle]);
    return {
      value: result.clearValues[handle] as boolean,
      proof: result.decryptionProof,
    };
  }

  // Decrypt a single uint8 handle
  async decryptUint8(handle: `0x${string}`): Promise<{ value: number; proof: `0x${string}` }> {
    const result = await this.publicDecrypt([handle]);
    return {
      value: Number(result.clearValues[handle] as bigint),
      proof: result.decryptionProof,
    };
  }

  // Decrypt winner and collision handles together
  async decryptGameState(
    winnerHandle: `0x${string}`,
    collisionHandle: `0x${string}`
  ): Promise<{ winner: number; collision: boolean; proof: `0x${string}` }> {
    const result = await this.publicDecrypt([winnerHandle, collisionHandle]);
    return {
      winner: Number(result.clearValues[winnerHandle] as bigint),
      collision: result.clearValues[collisionHandle] as boolean,
      proof: result.decryptionProof,
    };
  }

  // Decrypt entire board (16 cells)
  async decryptBoard(
    eBoard: readonly (readonly `0x${string}`[])[]
  ): Promise<{ board: number[][]; proof: `0x${string}` }> {
    const handles: `0x${string}`[] = [];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        handles.push(eBoard[i][j]);
      }
    }

    const result = await this.publicDecrypt(handles);

    const board: number[][] = [];
    for (let i = 0; i < 4; i++) {
      board[i] = [];
      for (let j = 0; j < 4; j++) {
        const handle = eBoard[i][j];
        board[i][j] = Number(result.clearValues[handle] as bigint);
      }
    }

    return {
      board,
      proof: result.decryptionProof,
    };
  }
}

// Factory function to create FHE service
export function createFHEService(
  contractAddress: `0x${string}`,
  playerAddress: `0x${string}`
): FHEService {
  return new FHEService(contractAddress, playerAddress);
}

