import { useReadContract, useWatchContractEvent, useAccount, usePublicClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import { toHex } from "viem";
import {
  SIMPHANTOE_ABI,
  SIMPHANTOE_ADDRESS,
  type Game,
  type Move,
  type LocalMove,
  GamePhase,
  Winner,
  isGameFinished,
  isBoardRevealed,
} from "../lib/contracts";
import { useFHE, useEncryptMove, usePublicDecrypt, RelayerError } from "../lib/fhe";
import { useSponsoredWriteContract } from "./useSponsoredTransaction";

// Helper hook for localStorage-backed moves (persists across page refreshes)
function usePersistedMoves(gameId: bigint | undefined, playerAddress: string | undefined) {
  const [moves, setMovesInternal] = useState<LocalMove[]>([]);

  // Generate a unique storage key for this game/player combination
  const storageKey = useMemo(() => {
    if (gameId === undefined || !playerAddress) return null;
    return `simphantoe-moves-${gameId.toString()}-${playerAddress.toLowerCase()}`;
  }, [gameId, playerAddress]);

  // Use a ref to always access the latest storageKey in the setter
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;

  // Load moves from localStorage when storage key changes
  useEffect(() => {
    if (!storageKey) {
      setMovesInternal([]);
      return;
    }

    try {
      const stored = localStorage.getItem(storageKey);
      setMovesInternal(stored ? JSON.parse(stored) : []);
    } catch (e) {
      console.error("Failed to load moves from localStorage:", e);
      setMovesInternal([]);
    }
  }, [storageKey]);

  // Custom setter that also persists to localStorage
  const setMoves = useCallback((newMoves: LocalMove[] | ((prev: LocalMove[]) => LocalMove[])) => {
    setMovesInternal((prev) => {
      const updated = typeof newMoves === "function" ? newMoves(prev) : newMoves;

      // Persist to localStorage using current key from ref
      const currentKey = storageKeyRef.current;
      if (currentKey) {
        try {
          localStorage.setItem(currentKey, JSON.stringify(updated));
        } catch (e) {
          console.error("Failed to save moves to localStorage:", e);
        }
      }

      return updated;
    });
  }, []);

  return { moves, setMoves };
}

// Hook to get the contract address with validation
export function useContractAddress() {
  const address = SIMPHANTOE_ADDRESS;
  const isValid = address && address.startsWith("0x") && address.length === 42;
  return { address: isValid ? address : undefined, isConfigured: isValid };
}

// Hook to get the total game count
export function useGameCount() {
  const { address } = useContractAddress();
  return useReadContract({
    address,
    abi: SIMPHANTOE_ABI,
    functionName: "gameCount",
    query: {
      enabled: !!address,
    },
  });
}

// Hook to get a specific game by ID
export function useGame(gameId: bigint | undefined) {
  const { address } = useContractAddress();
  return useReadContract({
    address,
    abi: SIMPHANTOE_ABI,
    functionName: "getGame",
    args: gameId !== undefined ? [gameId] : undefined,
    query: {
      enabled: !!address && gameId !== undefined,
      refetchInterval: 3000,
    },
  });
}

// Hook to get open games (waiting for player 2)
export function useOpenGames() {
  const { address } = useContractAddress();
  return useReadContract({
    address,
    abi: SIMPHANTOE_ABI,
    functionName: "getOpenGames",
    query: {
      enabled: !!address,
      refetchInterval: 5000,
    },
  });
}

// Hook to get games by player
export function usePlayerGames(playerAddress: `0x${string}` | undefined) {
  const { address } = useContractAddress();
  return useReadContract({
    address,
    abi: SIMPHANTOE_ABI,
    functionName: "getGamesByPlayer",
    args: playerAddress ? [playerAddress] : undefined,
    query: {
      enabled: !!address && !!playerAddress,
      refetchInterval: 5000,
    },
  });
}

// Hook to get both players' moves
export function useMoves(gameId: bigint | undefined) {
  const { address } = useContractAddress();
  return useReadContract({
    address,
    abi: SIMPHANTOE_ABI,
    functionName: "getMoves",
    args: gameId !== undefined ? [gameId] : undefined,
    query: {
      enabled: !!address && gameId !== undefined,
      refetchInterval: 2000,
    },
  });
}

// Hook to check if player can submit a move
export function useCanSubmitMove(gameId: bigint | undefined, playerAddress: `0x${string}` | undefined) {
  const { address } = useContractAddress();
  return useReadContract({
    address,
    abi: SIMPHANTOE_ABI,
    functionName: "canSubmitMove",
    args: gameId !== undefined && playerAddress ? [gameId, playerAddress] : undefined,
    query: {
      enabled: !!address && gameId !== undefined && !!playerAddress,
      refetchInterval: 2000,
    },
  });
}

// Hook to start a new game
export function useStartGame() {
  const { address } = useContractAddress();
  const { writeContractAsync, isPending, isSuccess, error } = useSponsoredWriteContract();
  const queryClient = useQueryClient();

  const startGame = useCallback(async () => {
    if (!address) throw new Error("Contract not configured");
    const result = await writeContractAsync({
      address,
      abi: SIMPHANTOE_ABI,
      functionName: "startGame",
    });
    queryClient.invalidateQueries({ queryKey: ["readContract"] });
    return result;
  }, [address, writeContractAsync, queryClient]);

  return { startGame, isPending, isSuccess, error };
}

// Hook to join a game
export function useJoinGame() {
  const { address } = useContractAddress();
  const { writeContractAsync, isPending, isSuccess, error } = useSponsoredWriteContract();
  const queryClient = useQueryClient();

  const joinGame = useCallback(
    async (gameId: bigint) => {
      if (!address) throw new Error("Contract not configured");
      const result = await writeContractAsync({
        address,
        abi: SIMPHANTOE_ABI,
        functionName: "joinGame",
        args: [gameId],
      });
      queryClient.invalidateQueries({ queryKey: ["readContract"] });
      return result;
    },
    [address, writeContractAsync, queryClient],
  );

  return { joinGame, isPending, isSuccess, error };
}

// Hook to submit an encrypted move (FHE)
export function useSubmitMove() {
  const { address: contractAddress } = useContractAddress();
  const { writeContractAsync, isPending: isSubmitting, error: submitError } = useSponsoredWriteContract();
  const { encrypt, isEncrypting, error: encryptError } = useEncryptMove();
  const queryClient = useQueryClient();

  const submitMove = useCallback(
    async (gameId: bigint, x: number, y: number) => {
      if (!contractAddress) throw new Error("Contract not configured");

      // Step 1: Encrypt the move coordinates
      const encrypted = await encrypt(contractAddress, x, y);
      if (!encrypted) throw new Error("Failed to encrypt move");

      // Step 2: Submit the encrypted move to the contract
      // Convert Uint8Arrays to hex strings for viem (SDK may return either format)
      const handle0 = encrypted.handles[0] as `0x${string}` | Uint8Array;
      const handle1 = encrypted.handles[1] as `0x${string}` | Uint8Array;
      const inputProof = encrypted.inputProof as `0x${string}` | Uint8Array;
      const handle0Hex = handle0 instanceof Uint8Array ? toHex(handle0) : handle0;
      const handle1Hex = handle1 instanceof Uint8Array ? toHex(handle1) : handle1;
      const inputProofHex = inputProof instanceof Uint8Array ? toHex(inputProof) : inputProof;
      const result = await writeContractAsync({
        address: contractAddress,
        abi: SIMPHANTOE_ABI,
        functionName: "submitMove",
        args: [gameId, handle0Hex, handle1Hex, inputProofHex],
      });

      queryClient.invalidateQueries({ queryKey: ["readContract"] });
      return result;
    },
    [contractAddress, encrypt, writeContractAsync, queryClient],
  );

  return {
    submitMove,
    isPending: isEncrypting || isSubmitting,
    isEncrypting,
    isSubmitting,
    error: encryptError || submitError,
  };
}

// Hook to finalize a move after decryption
export function useFinalizeMove() {
  const { address: contractAddress } = useContractAddress();
  const { writeContractAsync, isPending, error } = useSponsoredWriteContract();
  const { decrypt, isDecrypting, error: decryptError } = usePublicDecrypt();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();

  const finalizeMove = useCallback(
    async (gameId: bigint, playerAddress: `0x${string}`, isInvalidHandle: `0x${string}`) => {
      if (!contractAddress) throw new Error("Contract not configured");

      // Step 1: Decrypt the isInvalid flag
      const decrypted = await decrypt([isInvalidHandle]);
      if (!decrypted) throw new Error("Failed to decrypt move validity");

      const isInvalid = decrypted.clearValues[isInvalidHandle] as boolean;

      // Step 2: Call finalizeMove with the decrypted value and proof
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi: SIMPHANTOE_ABI,
        functionName: "finalizeMove",
        args: [gameId, playerAddress, isInvalid, decrypted.decryptionProof],
      });

      // Step 3: Wait for transaction to be mined
      await publicClient?.waitForTransactionReceipt({ hash: txHash });

      queryClient.invalidateQueries({ queryKey: ["readContract"] });
      return { txHash, isInvalid };
    },
    [contractAddress, decrypt, writeContractAsync, publicClient, queryClient],
  );

  return {
    finalizeMove,
    isPending: isDecrypting || isPending,
    isDecrypting,
    error: decryptError || error,
  };
}

// Hook to finalize game state after decryption
export function useFinalizeGameState() {
  const { address: contractAddress } = useContractAddress();
  const { writeContractAsync, isPending, error } = useSponsoredWriteContract();
  const { decrypt, isDecrypting, error: decryptError } = usePublicDecrypt();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();

  const finalizeGameState = useCallback(
    async (gameId: bigint, winnerHandle: `0x${string}`, collisionHandle: `0x${string}`) => {
      if (!contractAddress) throw new Error("Contract not configured");

      // Step 1: Decrypt winner and collision
      const decrypted = await decrypt([winnerHandle, collisionHandle]);
      if (!decrypted) throw new Error("Failed to decrypt game state");

      const winner = Number(decrypted.clearValues[winnerHandle] as bigint);
      const collision = decrypted.clearValues[collisionHandle] as boolean;

      // Step 2: Call finalizeGameState
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi: SIMPHANTOE_ABI,
        functionName: "finalizeGameState",
        args: [gameId, winner, collision, decrypted.decryptionProof],
      });

      // Step 3: Wait for transaction to be mined
      await publicClient?.waitForTransactionReceipt({ hash: txHash });

      queryClient.invalidateQueries({ queryKey: ["readContract"] });
      return { txHash, winner, collision };
    },
    [contractAddress, decrypt, writeContractAsync, publicClient, queryClient],
  );

  return {
    finalizeGameState,
    isPending: isDecrypting || isPending,
    isDecrypting,
    error: decryptError || error,
  };
}

// Hook to reveal the board after game ends
export function useRevealBoard() {
  const { address: contractAddress } = useContractAddress();
  const { writeContractAsync, isPending, error } = useSponsoredWriteContract();
  const { decrypt, isDecrypting, error: decryptError } = usePublicDecrypt();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();

  const revealBoard = useCallback(
    async (gameId: bigint, eBoard: readonly (readonly `0x${string}`[])[]) => {
      if (!contractAddress) throw new Error("Contract not configured");

      // Step 1: Collect all 16 board cell handles
      const boardHandles: `0x${string}`[] = [];
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          boardHandles.push(eBoard[i][j]);
        }
      }

      // Step 2: Decrypt all board cells
      const decrypted = await decrypt(boardHandles);
      if (!decrypted) throw new Error("Failed to decrypt board");

      // Step 3: Build the board array from decrypted values
      const board: number[][] = [];
      for (let i = 0; i < 4; i++) {
        board[i] = [];
        for (let j = 0; j < 4; j++) {
          const handle = eBoard[i][j];
          board[i][j] = Number(decrypted.clearValues[handle] as bigint);
        }
      }

      // Step 4: Call revealBoard with decrypted board and proof
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi: SIMPHANTOE_ABI,
        functionName: "revealBoard",
        args: [
          gameId,
          board as [
            [number, number, number, number],
            [number, number, number, number],
            [number, number, number, number],
            [number, number, number, number],
          ],
          decrypted.decryptionProof,
        ],
      });

      // Step 5: Wait for transaction to be mined
      await publicClient?.waitForTransactionReceipt({ hash: txHash });

      queryClient.invalidateQueries({ queryKey: ["readContract"] });
      return { txHash, board };
    },
    [contractAddress, decrypt, writeContractAsync, publicClient, queryClient],
  );

  return {
    revealBoard,
    isPending: isDecrypting || isPending,
    isDecrypting,
    error: decryptError || error,
  };
}

// Hook to watch for game events
export function useGameEvents(gameId: bigint | undefined) {
  const { address } = useContractAddress();
  const queryClient = useQueryClient();
  const [lastEvent, setLastEvent] = useState<{
    type: "submitted" | "invalid" | "made" | "processed" | "collision" | "updated" | "joined" | "revealed";
    data: unknown;
  } | null>(null);

  useWatchContractEvent({
    address,
    abi: SIMPHANTOE_ABI,
    eventName: "PlayerJoined",
    onLogs: (logs) => {
      const relevant = logs.find((log) => log.args.gameId === gameId);
      if (relevant) {
        setLastEvent({ type: "joined", data: relevant.args });
        queryClient.invalidateQueries({ queryKey: ["readContract"] });
      }
    },
    enabled: !!address && gameId !== undefined,
  });

  useWatchContractEvent({
    address,
    abi: SIMPHANTOE_ABI,
    eventName: "MoveSubmitted",
    onLogs: (logs) => {
      const relevant = logs.find((log) => log.args.gameId === gameId);
      if (relevant) {
        setLastEvent({ type: "submitted", data: relevant.args });
        queryClient.invalidateQueries({ queryKey: ["readContract"] });
      }
    },
    enabled: !!address && gameId !== undefined,
  });

  useWatchContractEvent({
    address,
    abi: SIMPHANTOE_ABI,
    eventName: "MoveInvalid",
    onLogs: (logs) => {
      const relevant = logs.find((log) => log.args.gameId === gameId);
      if (relevant) {
        setLastEvent({ type: "invalid", data: relevant.args });
        queryClient.invalidateQueries({ queryKey: ["readContract"] });
      }
    },
    enabled: !!address && gameId !== undefined,
  });

  useWatchContractEvent({
    address,
    abi: SIMPHANTOE_ABI,
    eventName: "MoveMade",
    onLogs: (logs) => {
      const relevant = logs.find((log) => log.args.gameId === gameId);
      if (relevant) {
        setLastEvent({ type: "made", data: relevant.args });
        queryClient.invalidateQueries({ queryKey: ["readContract"] });
      }
    },
    enabled: !!address && gameId !== undefined,
  });

  useWatchContractEvent({
    address,
    abi: SIMPHANTOE_ABI,
    eventName: "MovesProcessed",
    onLogs: (logs) => {
      const relevant = logs.find((log) => log.args.gameId === gameId);
      if (relevant) {
        setLastEvent({ type: "processed", data: relevant.args });
        queryClient.invalidateQueries({ queryKey: ["readContract"] });
      }
    },
    enabled: !!address && gameId !== undefined,
  });

  useWatchContractEvent({
    address,
    abi: SIMPHANTOE_ABI,
    eventName: "Collision",
    onLogs: (logs) => {
      const relevant = logs.find((log) => log.args.gameId === gameId);
      if (relevant) {
        setLastEvent({ type: "collision", data: relevant.args });
        queryClient.invalidateQueries({ queryKey: ["readContract"] });
      }
    },
    enabled: !!address && gameId !== undefined,
  });

  useWatchContractEvent({
    address,
    abi: SIMPHANTOE_ABI,
    eventName: "GameUpdated",
    onLogs: (logs) => {
      const relevant = logs.find((log) => log.args.gameId === gameId);
      if (relevant) {
        setLastEvent({ type: "updated", data: relevant.args });
        queryClient.invalidateQueries({ queryKey: ["readContract"] });
      }
    },
    enabled: !!address && gameId !== undefined,
  });

  useWatchContractEvent({
    address,
    abi: SIMPHANTOE_ABI,
    eventName: "BoardRevealed",
    onLogs: (logs) => {
      const relevant = logs.find((log) => log.args.gameId === gameId);
      if (relevant) {
        setLastEvent({ type: "revealed", data: relevant.args });
        queryClient.invalidateQueries({ queryKey: ["readContract"] });
      }
    },
    enabled: !!address && gameId !== undefined,
  });

  return { lastEvent, clearEvent: () => setLastEvent(null) };
}

// Main hook for managing the current player's game state
export function useCurrentPlayerGameState(gameId: bigint | undefined) {
  const { address: playerAddress } = useAccount();
  const { data: game, isLoading: gameLoading, refetch: refetchGame } = useGame(gameId);
  const { data: moves, isLoading: movesLoading, refetch: refetchMoves } = useMoves(gameId);
  const { data: canSubmit } = useCanSubmitMove(gameId, playerAddress);
  const { isLoading: fheLoading } = useFHE();

  // Local move tracking - persisted to localStorage per game/player
  const { moves: myLocalMoves, setMoves: setMyLocalMoves } = usePersistedMoves(gameId, playerAddress);
  const [currentRoundMove, setCurrentRoundMove] = useState<{ x: number; y: number } | null>(null);
  const [gamePhase, setGamePhase] = useState<GamePhase>(GamePhase.SelectingMove);

  // Determine player role
  const isPlayer1 = playerAddress === game?.player1;
  const isPlayer2 = playerAddress === game?.player2;
  const isPlayer = isPlayer1 || isPlayer2;
  const waitingForOpponent = game?.player2 === "0x0000000000000000000000000000000000000000";

  // Extract move data
  const myMove = isPlayer1 ? moves?.[0] : moves?.[1];
  const opponentMove = isPlayer1 ? moves?.[1] : moves?.[0];

  const myMoveSubmitted = myMove?.isSubmitted ?? false;
  const myMoveMade = myMove?.isMade ?? false;
  const opponentMoveSubmitted = opponentMove?.isSubmitted ?? false;
  const opponentMoveMade = opponentMove?.isMade ?? false;

  // Determine game phase
  useEffect(() => {
    if (!game || !isPlayer) {
      setGamePhase(GamePhase.SelectingMove);
      return;
    }

    if (waitingForOpponent) {
      setGamePhase(GamePhase.WaitingForOpponent);
    } else if (isGameFinished(game)) {
      setGamePhase(GamePhase.GameOver);
    } else if (!myMoveSubmitted) {
      setGamePhase(GamePhase.SelectingMove);
    } else if (myMoveSubmitted && !myMoveMade) {
      setGamePhase(GamePhase.WaitingForValidation);
    } else if (myMoveMade && !opponentMoveMade) {
      setGamePhase(GamePhase.WaitingForOpponentMove);
    } else if (myMoveMade && opponentMoveMade) {
      setGamePhase(GamePhase.ProcessingMoves);
    }
  }, [game, isPlayer, waitingForOpponent, myMoveSubmitted, myMoveMade, opponentMoveMade]);

  // Add a local move (when player selects a cell)
  const addLocalMove = useCallback((x: number, y: number) => {
    setCurrentRoundMove({ x, y });
  }, []);

  // Commit local move to history after successful round
  const commitLocalMove = useCallback(() => {
    if (currentRoundMove) {
      setMyLocalMoves((prev) => [...prev, { ...currentRoundMove, timestamp: Date.now() }]);
      setCurrentRoundMove(null);
    }
  }, [currentRoundMove]);

  // Clear current round move (on collision or invalid)
  const clearCurrentRoundMove = useCallback(() => {
    setCurrentRoundMove(null);
  }, []);

  // Reset game state
  const resetLocalState = useCallback(() => {
    setMyLocalMoves([]);
    setCurrentRoundMove(null);
  }, []);

  return {
    // Game data
    game: game as Game | undefined,
    moves: moves as [Move, Move] | undefined,
    isLoading: gameLoading || movesLoading || fheLoading,

    // Player info
    isPlayer,
    isPlayer1,
    isPlayer2,
    playerAddress,
    opponentAddress: isPlayer1 ? game?.player2 : game?.player1,

    // Game status
    waitingForOpponent,
    gamePhase,
    canSubmitMove: canSubmit ?? false,

    // Move status
    myMoveSubmitted,
    myMoveMade,
    opponentMoveSubmitted,
    opponentMoveMade,
    myMove: myMove as Move | undefined,
    opponentMove: opponentMove as Move | undefined,

    // Local state
    myLocalMoves,
    currentRoundMove,

    // Actions
    addLocalMove,
    commitLocalMove,
    clearCurrentRoundMove,
    resetLocalState,
    refetchGame,
    refetchMoves,
  };
}

// Hook for the full FHE game flow orchestration
export function useGameFlow(gameId: bigint | undefined) {
  const queryClient = useQueryClient();
  const gameState = useCurrentPlayerGameState(gameId);
  const { submitMove, isPending: isSubmitting, isEncrypting } = useSubmitMove();
  const { finalizeMove, isPending: isFinalizing, isDecrypting: isDecryptingMove } = useFinalizeMove();
  const { finalizeGameState, isPending: isFinalizingState, isDecrypting: isDecryptingState } = useFinalizeGameState();
  const { revealBoard, isPending: isRevealingBoard, isDecrypting: isDecryptingBoard } = useRevealBoard();
  const { lastEvent, clearEvent } = useGameEvents(gameId);

  const [fheStatus, setFheStatus] = useState<{
    type: string;
    message: string;
    errorDetails?: string;
    statusCode?: number;
    relayerMessage?: string;
  } | null>(null);
  const [showCollision, setShowCollision] = useState(false);
  const [showGameOver, setShowGameOver] = useState(false);
  const [lastWinner, setLastWinner] = useState<Winner>(Winner.None);
  const [canRetry, setCanRetry] = useState(false);
  const [pendingRetryAction, setPendingRetryAction] = useState<(() => Promise<void>) | null>(null);
  const [boardRevealed, setBoardRevealed] = useState(false);

  // Track if we need to auto-finalize
  const needsFinalizeMoveRef = useRef(false);
  const needsFinalizeGameRef = useRef(false);
  const needsRevealBoardRef = useRef(false);

  // Async locks to prevent concurrent execution of the same operation
  const finalizeMoveInProgressRef = useRef(false);
  const finalizeGameInProgressRef = useRef(false);
  const revealBoardInProgressRef = useRef(false);

  // Track handles we've already processed to avoid using stale handles
  const processedHandlesRef = useRef<Set<string>>(new Set());

  // Track if we've already checked for stuck moves on mount (prevents infinite loops)
  const stuckMoveCheckDoneRef = useRef(false);

  // Track when MovesProcessed event fires - this is when we need to finalize game state
  const [movesProcessedPending, setMovesProcessedPending] = useState(false);

  // Check if board is already revealed on mount
  useEffect(() => {
    if (gameState.game && isBoardRevealed(gameState.game)) {
      setBoardRevealed(true);
    }
  }, [gameState.game]);

  // Handle submitting a move
  const handleSubmitMove = useCallback(async () => {
    // Note: gameId can be 0n which is falsy, so check for undefined explicitly
    if (gameId === undefined || !gameState.currentRoundMove) {
      return;
    }

    const { x, y } = gameState.currentRoundMove;

    try {
      setFheStatus({ type: "encrypt", message: "Encrypting move..." });
      await submitMove(gameId, x, y);
      setFheStatus({ type: "submit", message: "Move submitted!" });
      needsFinalizeMoveRef.current = true;
    } catch (error) {
      console.error("Failed to submit move:", error);
      setFheStatus(null);
      gameState.clearCurrentRoundMove();
    }
  }, [gameId, gameState, submitMove]);

  // One-time check for stuck moves after page load
  useEffect(() => {
    // Only run once per game session
    if (stuckMoveCheckDoneRef.current) return;
    if (gameId === undefined) return;
    if (!gameState.playerAddress || !gameState.myMove) return;

    // Check if move is submitted but not finalized
    if (gameState.myMoveSubmitted && !gameState.myMoveMade) {
      const isInvalidHandle = gameState.myMove.isInvalid;
      if (isInvalidHandle && isInvalidHandle !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
        stuckMoveCheckDoneRef.current = true;
        needsFinalizeMoveRef.current = true;
      }
    }
  }, [gameId, gameState.playerAddress, gameState.myMove, gameState.myMoveSubmitted, gameState.myMoveMade]);

  // Auto-finalize move when submitted
  useEffect(() => {
    async function autoFinalizeMove() {
      // Skip if not flagged for finalization
      if (!needsFinalizeMoveRef.current) return;

      // Skip if already in progress (prevents race conditions with concurrent effect executions)
      if (finalizeMoveInProgressRef.current) return;

      if (gameId === undefined || !gameState.playerAddress || !gameState.myMove) return;
      if (!gameState.myMoveSubmitted || gameState.myMoveMade) return;

      const isInvalidHandle = gameState.myMove.isInvalid;
      if (!isInvalidHandle || isInvalidHandle === "0x0000000000000000000000000000000000000000000000000000000000000000")
        return;

      // Set both flags atomically to prevent double execution
      needsFinalizeMoveRef.current = false;
      finalizeMoveInProgressRef.current = true;

      try {
        setFheStatus({ type: "decrypt", message: "Validating move..." });
        setCanRetry(false);
        const { isInvalid } = await finalizeMove(gameId, gameState.playerAddress, isInvalidHandle);

        if (isInvalid) {
          setFheStatus({ type: "error", message: "Move was invalid!" });
          gameState.clearCurrentRoundMove();
        } else {
          // Move was valid - show success temporarily
          if (!showCollision) {
            setFheStatus({ type: "success", message: "Move accepted!" });
          }

          // After finalizing our move, check if both moves are now made
          // This acts as a fallback in case MovesProcessed event is missed
          setTimeout(async () => {
            try {
              const result = await gameState.refetchGame();
              const freshGame = result.data as Game | undefined;

              // If eWinner handle is set, trigger game finalization
              if (
                freshGame?.eWinner &&
                freshGame.eWinner !== "0x0000000000000000000000000000000000000000000000000000000000000000"
              ) {
                setMovesProcessedPending(true);
              }
            } catch (err) {
              console.error("Failed to check game state:", err);
            }
          }, 2000); // Wait 2 seconds for tx to be mined
        }
      } catch (error) {
        console.error("Failed to finalize move:", error);

        // Handle RelayerError with detailed information
        if (error instanceof RelayerError) {
          setFheStatus({
            type: "relayer_error",
            message: error.message,
            errorDetails: error.getDisplayMessage(),
            statusCode: error.statusCode,
            relayerMessage: error.relayerMessage,
          });
        } else {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          setFheStatus({
            type: "error",
            message: "Failed to validate move",
            errorDetails: errorMessage,
          });
        }
        setCanRetry(true);
        // Store retry action
        setPendingRetryAction(() => async () => {
          needsFinalizeMoveRef.current = true;
          // Trigger re-run of the effect
          gameState.refetchMoves();
        });
      } finally {
        // Release the lock
        finalizeMoveInProgressRef.current = false;
      }
    }

    autoFinalizeMove();
  }, [gameId, gameState, finalizeMove, showCollision]);

  // Reset processed handles when game changes
  useEffect(() => {
    processedHandlesRef.current.clear();
  }, [gameId]);

  // Auto-finalize game state when MovesProcessed event is received
  useEffect(() => {
    async function autoFinalizeGame() {
      // Only run when movesProcessedPending is set (triggered by MovesProcessed event)
      if (!movesProcessedPending) return;
      if (gameId === undefined) return;
      if (needsFinalizeGameRef.current) return;

      // Skip if already in progress (prevents race conditions with concurrent effect executions)
      if (finalizeGameInProgressRef.current) return;

      // Clear the pending flag immediately to prevent re-entry
      setMovesProcessedPending(false);
      needsFinalizeGameRef.current = true;
      finalizeGameInProgressRef.current = true;

      try {
        // Refetch game state to ensure we have fresh handles
        const refetchResult = await gameState.refetchGame();
        const freshGame = refetchResult.data as Game | undefined;

        if (!freshGame) {
          needsFinalizeGameRef.current = false;
          return;
        }

        // Don't process if game is already finished
        if (isGameFinished(freshGame)) {
          needsFinalizeGameRef.current = false;
          // Check if board needs revealing
          if (!isBoardRevealed(freshGame)) {
            needsRevealBoardRef.current = true;
          }
          return;
        }

        const winnerHandle = freshGame.eWinner;
        const collisionHandle = freshGame.eCollision;

        if (!winnerHandle || winnerHandle === "0x0000000000000000000000000000000000000000000000000000000000000000") {
          needsFinalizeGameRef.current = false;
          return;
        }

        // Check if we've already processed these exact handles to avoid double-processing
        const handleKey = `${winnerHandle}-${collisionHandle}`;
        if (processedHandlesRef.current.has(handleKey)) {
          needsFinalizeGameRef.current = false;
          return;
        }

        setFheStatus({ type: "decrypt", message: "Decrypting result..." });
        const { winner, collision } = await finalizeGameState(gameId, winnerHandle, collisionHandle);

        // Mark these handles as processed
        processedHandlesRef.current.add(handleKey);

        if (collision) {
          setShowCollision(true);
          gameState.clearCurrentRoundMove();
          setFheStatus({ type: "collision", message: "Moves collided!" });
        } else {
          gameState.commitLocalMove();
          if (winner !== Winner.None) {
            setLastWinner(winner);
            setShowGameOver(true);
            // Trigger board reveal
            needsRevealBoardRef.current = true;
          }
          setFheStatus(null);
        }
        needsFinalizeGameRef.current = false;

        // Refetch game and move state to get fresh data from contract
        // (the contract has deleted/updated the moves after finalizeGameState)
        // Small delay to ensure RPC node has updated state
        await new Promise((resolve) => setTimeout(resolve, 500));
        // Invalidate all queries to force fresh fetch
        queryClient.invalidateQueries({ queryKey: ["readContract"] });
        // Refetch with fresh data
        await gameState.refetchGame();
        await gameState.refetchMoves();
      } catch (error) {
        console.error("Failed to finalize game state:", error);
        needsFinalizeGameRef.current = false;

        // Handle RelayerError with detailed information
        if (error instanceof RelayerError) {
          setFheStatus({
            type: "relayer_error",
            message: error.message,
            errorDetails: error.getDisplayMessage(),
            statusCode: error.statusCode,
            relayerMessage: error.relayerMessage,
          });
        } else {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          setFheStatus({
            type: "error",
            message: "Failed to decrypt result",
            errorDetails: errorMessage,
          });
        }
        setCanRetry(true);
        setPendingRetryAction(() => async () => {
          // Re-trigger by setting the pending flag
          setMovesProcessedPending(true);
        });
      } finally {
        // Release the lock
        finalizeGameInProgressRef.current = false;
      }
    }

    autoFinalizeGame();
  }, [gameId, movesProcessedPending, gameState, finalizeGameState, queryClient]);

  // Auto-reveal board when game finishes
  useEffect(() => {
    async function autoRevealBoard() {
      if (!needsRevealBoardRef.current) return;
      if (gameId === undefined) return;
      if (!gameState.game) return;
      if (!isGameFinished(gameState.game)) return;
      if (isBoardRevealed(gameState.game)) {
        setBoardRevealed(true);
        needsRevealBoardRef.current = false;
        return;
      }

      // Skip if already in progress (prevents race conditions with concurrent effect executions)
      if (revealBoardInProgressRef.current) return;

      needsRevealBoardRef.current = false;
      revealBoardInProgressRef.current = true;

      try {
        setFheStatus({ type: "decrypt", message: "Revealing board..." });
        await revealBoard(gameId, gameState.game.eBoard);
        setBoardRevealed(true);
        setFheStatus(null);

        // Refetch to get the revealed board
        await gameState.refetchGame();
      } catch (error) {
        console.error("Failed to reveal board:", error);

        // Handle RelayerError with detailed information
        if (error instanceof RelayerError) {
          setFheStatus({
            type: "relayer_error",
            message: error.message,
            errorDetails: error.getDisplayMessage(),
            statusCode: error.statusCode,
            relayerMessage: error.relayerMessage,
          });
        } else {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          setFheStatus({
            type: "error",
            message: "Failed to reveal board",
            errorDetails: errorMessage,
          });
        }
        setCanRetry(true);
        setPendingRetryAction(() => async () => {
          needsRevealBoardRef.current = true;
        });
      } finally {
        // Release the lock
        revealBoardInProgressRef.current = false;
      }
    }

    autoRevealBoard();
  }, [gameId, gameState.game, revealBoard, gameState.refetchGame]);

  // Handle events
  useEffect(() => {
    if (!lastEvent) return;

    switch (lastEvent.type) {
      case "processed":
        // Both moves have been processed by the contract
        // Trigger game finalization to decrypt winner/collision
        setMovesProcessedPending(true);
        break;
      case "collision":
        // Collision detected via event - ensure UI reflects this
        setShowCollision(true);
        gameState.clearCurrentRoundMove();
        // Prevent autoFinalizeMove from overwriting the collision status
        needsFinalizeMoveRef.current = false;
        // Set the FHE status to show collision message
        setFheStatus({ type: "collision", message: "Moves collided!" });
        break;
      case "updated":
        const data = lastEvent.data as { winner: number };
        if (data.winner !== Winner.None) {
          setLastWinner(data.winner);
          setShowGameOver(true);
          // Trigger board reveal
          needsRevealBoardRef.current = true;
        }
        break;
      case "revealed":
        setBoardRevealed(true);
        gameState.refetchGame();
        break;
      case "joined":
        gameState.refetchGame();
        break;
    }

    clearEvent();
  }, [lastEvent, clearEvent, gameState]);

  // Handle retry for failed FHE operations
  const handleRetry = useCallback(async () => {
    if (pendingRetryAction) {
      setFheStatus(null);
      setCanRetry(false);
      try {
        await pendingRetryAction();
      } catch (error) {
        console.error("Retry failed:", error);
      }
      setPendingRetryAction(null);
    }
  }, [pendingRetryAction]);

  // Detect if game needs finalization (has handles AND both moves are finalized)
  const needsGameFinalization = useMemo(() => {
    if (!gameState.game) return false;
    if (isGameFinished(gameState.game)) return false;

    // Both moves must be "made" (finalized and valid) for processMoves to have run
    // After finalizeGameState, moves are deleted so this will be false
    const bothMovesReady = gameState.myMoveMade && gameState.opponentMoveMade;
    if (!bothMovesReady) return false;

    const winnerHandle = gameState.game.eWinner;
    // Check if winner handle is set (non-zero means processMoves has run)
    return winnerHandle && winnerHandle !== "0x0000000000000000000000000000000000000000000000000000000000000000";
  }, [gameState.game, gameState.myMoveMade, gameState.opponentMoveMade]);

  // Manual trigger for game finalization
  const handleFinalizeGame = useCallback(() => {
    // Reset the processed handles to allow re-processing
    processedHandlesRef.current.clear();
    needsFinalizeGameRef.current = false;
    setMovesProcessedPending(true);
  }, []);

  // Manual trigger for board reveal
  const handleRevealBoard = useCallback(() => {
    needsRevealBoardRef.current = true;
  }, []);

  return {
    ...gameState,

    // Actions
    handleSubmitMove,
    handleRetry,
    handleFinalizeGame,
    handleRevealBoard,

    // FHE status
    fheStatus,
    canRetry,
    needsGameFinalization,
    isEncrypting,
    isSubmitting,
    isDecryptingMove,
    isFinalizing,
    isDecryptingState,
    isFinalizingState,
    isRevealingBoard,
    isDecryptingBoard,

    // UI state
    showCollision,
    setShowCollision,
    showGameOver,
    setShowGameOver,
    lastWinner,
    boardRevealed,
  };
}
