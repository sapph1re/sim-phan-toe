import { useReadContract, useWriteContract, useWatchContractEvent, useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState, useEffect, useRef } from "react";
import { toHex } from "viem";
import {
  SIMPHANTOE_ABI,
  SIMPHANTOE_ADDRESS,
  type Game,
  type Move,
  type LocalMove,
  GamePhase,
  Winner,
} from "../lib/contracts";
import { useFHE, useEncryptMove, usePublicDecrypt } from "../lib/fhe";

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
  const { writeContractAsync, isPending, isSuccess, error } = useWriteContract();
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
  const { writeContractAsync, isPending, isSuccess, error } = useWriteContract();
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
  const { writeContractAsync, isPending: isSubmitting, error: submitError } = useWriteContract();
  const { encrypt, isEncrypting, error: encryptError } = useEncryptMove();
  const queryClient = useQueryClient();

  const submitMove = useCallback(
    async (gameId: bigint, x: number, y: number) => {
      console.log("useSubmitMove.submitMove called", { gameId: gameId.toString(), x, y, contractAddress });
      if (!contractAddress) throw new Error("Contract not configured");

      // Step 1: Encrypt the move coordinates
      console.log("Step 1: Encrypting move...");
      const encrypted = await encrypt(contractAddress, x, y);
      console.log("Encryption result:", encrypted);
      if (!encrypted) throw new Error("Failed to encrypt move");

      // Step 2: Submit the encrypted move to the contract
      // Convert Uint8Arrays to hex strings for viem
      const handle0Hex =
        encrypted.handles[0] instanceof Uint8Array ? toHex(encrypted.handles[0]) : encrypted.handles[0];
      const handle1Hex =
        encrypted.handles[1] instanceof Uint8Array ? toHex(encrypted.handles[1]) : encrypted.handles[1];
      const inputProofHex =
        encrypted.inputProof instanceof Uint8Array ? toHex(encrypted.inputProof) : encrypted.inputProof;
      console.log("Step 2: Submitting to contract...", {
        handle0Hex,
        handle1Hex,
        inputProofHex,
      });
      const result = await writeContractAsync({
        address: contractAddress,
        abi: SIMPHANTOE_ABI,
        functionName: "submitMove",
        args: [gameId, handle0Hex, handle1Hex, inputProofHex],
      });
      console.log("Contract submission result:", result);

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
  const { writeContractAsync, isPending, error } = useWriteContract();
  const { decrypt, isDecrypting, error: decryptError } = usePublicDecrypt();
  const queryClient = useQueryClient();

  const finalizeMove = useCallback(
    async (gameId: bigint, playerAddress: `0x${string}`, isInvalidHandle: `0x${string}`) => {
      if (!contractAddress) throw new Error("Contract not configured");

      // Step 1: Decrypt the isInvalid flag
      const decrypted = await decrypt([isInvalidHandle]);
      if (!decrypted) throw new Error("Failed to decrypt move validity");

      const isInvalid = decrypted.clearValues[isInvalidHandle] as boolean;

      // Step 2: Call finalizeMove with the decrypted value and proof
      const result = await writeContractAsync({
        address: contractAddress,
        abi: SIMPHANTOE_ABI,
        functionName: "finalizeMove",
        args: [gameId, playerAddress, isInvalid, decrypted.decryptionProof],
      });

      queryClient.invalidateQueries({ queryKey: ["readContract"] });
      return { result, isInvalid };
    },
    [contractAddress, decrypt, writeContractAsync, queryClient],
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
  const { writeContractAsync, isPending, error } = useWriteContract();
  const { decrypt, isDecrypting, error: decryptError } = usePublicDecrypt();
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
      const result = await writeContractAsync({
        address: contractAddress,
        abi: SIMPHANTOE_ABI,
        functionName: "finalizeGameState",
        args: [gameId, winner, collision, decrypted.decryptionProof],
      });

      queryClient.invalidateQueries({ queryKey: ["readContract"] });
      return { result, winner, collision };
    },
    [contractAddress, decrypt, writeContractAsync, queryClient],
  );

  return {
    finalizeGameState,
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
    type: "submitted" | "invalid" | "made" | "processed" | "collision" | "updated" | "joined";
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

  return { lastEvent, clearEvent: () => setLastEvent(null) };
}

// Main hook for managing the current player's game state
export function useCurrentPlayerGameState(gameId: bigint | undefined) {
  const { address: playerAddress } = useAccount();
  const { data: game, isLoading: gameLoading, refetch: refetchGame } = useGame(gameId);
  const { data: moves, isLoading: movesLoading, refetch: refetchMoves } = useMoves(gameId);
  const { data: canSubmit } = useCanSubmitMove(gameId, playerAddress);
  const { isLoading: fheLoading } = useFHE();

  // Local move tracking (player's own moves that haven't been revealed yet)
  const [myLocalMoves, setMyLocalMoves] = useState<LocalMove[]>([]);
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
    } else if (game.isFinished) {
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
  const gameState = useCurrentPlayerGameState(gameId);
  const { submitMove, isPending: isSubmitting, isEncrypting } = useSubmitMove();
  const { finalizeMove, isPending: isFinalizing, isDecrypting: isDecryptingMove } = useFinalizeMove();
  const { finalizeGameState, isPending: isFinalizingState, isDecrypting: isDecryptingState } = useFinalizeGameState();
  const { lastEvent, clearEvent } = useGameEvents(gameId);

  const [fheStatus, setFheStatus] = useState<{ type: string; message: string } | null>(null);
  const [showCollision, setShowCollision] = useState(false);
  const [showGameOver, setShowGameOver] = useState(false);
  const [lastWinner, setLastWinner] = useState<Winner>(Winner.None);

  // Track if we need to auto-finalize
  const needsFinalizeMoveRef = useRef(false);
  const needsFinalizeGameRef = useRef(false);

  // Handle submitting a move
  const handleSubmitMove = useCallback(async () => {
    console.log("useGameFlow.handleSubmitMove called", { gameId, currentRoundMove: gameState.currentRoundMove });
    // Note: gameId can be 0n which is falsy, so check for undefined explicitly
    if (gameId === undefined || !gameState.currentRoundMove) {
      console.log("handleSubmitMove early return - no gameId or currentRoundMove");
      return;
    }

    const { x, y } = gameState.currentRoundMove;
    console.log("Submitting move at coordinates:", { x, y });

    try {
      setFheStatus({ type: "encrypt", message: "Encrypting move..." });
      console.log("Calling submitMove...");
      await submitMove(gameId, x, y);
      console.log("submitMove completed successfully");
      setFheStatus({ type: "submit", message: "Move submitted!" });
      needsFinalizeMoveRef.current = true;
    } catch (error) {
      console.error("Failed to submit move:", error);
      setFheStatus(null);
      gameState.clearCurrentRoundMove();
    }
  }, [gameId, gameState, submitMove]);

  // Auto-finalize move when submitted
  useEffect(() => {
    async function autoFinalizeMove() {
      if (!needsFinalizeMoveRef.current) return;
      if (gameId === undefined || !gameState.playerAddress || !gameState.myMove) return;
      if (!gameState.myMoveSubmitted || gameState.myMoveMade) return;

      const isInvalidHandle = gameState.myMove.isInvalid;
      if (!isInvalidHandle || isInvalidHandle === "0x0000000000000000000000000000000000000000000000000000000000000000")
        return;

      needsFinalizeMoveRef.current = false;

      try {
        setFheStatus({ type: "decrypt", message: "Validating move..." });
        const { isInvalid } = await finalizeMove(gameId, gameState.playerAddress, isInvalidHandle);

        if (isInvalid) {
          setFheStatus({ type: "error", message: "Move was invalid!" });
          gameState.clearCurrentRoundMove();
        } else {
          setFheStatus({ type: "success", message: "Move accepted!" });
        }
      } catch (error) {
        console.error("Failed to finalize move:", error);
        setFheStatus(null);
      }
    }

    autoFinalizeMove();
  }, [gameId, gameState, finalizeMove]);

  // Auto-finalize game state when moves are processed
  useEffect(() => {
    async function autoFinalizeGame() {
      if (gameId === undefined || !gameState.game) return;
      if (!gameState.myMoveMade || !gameState.opponentMoveMade) return;
      if (gameState.game.isFinished) return;

      const winnerHandle = gameState.game.winner;
      const collisionHandle = gameState.game.collision;

      if (!winnerHandle || winnerHandle === "0x0000000000000000000000000000000000000000000000000000000000000000")
        return;
      if (needsFinalizeGameRef.current) return;

      needsFinalizeGameRef.current = true;

      try {
        setFheStatus({ type: "decrypt", message: "Decrypting result..." });
        const { winner, collision } = await finalizeGameState(gameId, winnerHandle, collisionHandle);

        if (collision) {
          setShowCollision(true);
          gameState.clearCurrentRoundMove();
          setFheStatus({ type: "collision", message: "Moves collided!" });
        } else {
          gameState.commitLocalMove();
          if (winner !== Winner.None) {
            setLastWinner(winner);
            setShowGameOver(true);
          }
          setFheStatus(null);
        }
        needsFinalizeGameRef.current = false;
      } catch (error) {
        console.error("Failed to finalize game state:", error);
        setFheStatus(null);
        needsFinalizeGameRef.current = false;
      }
    }

    autoFinalizeGame();
  }, [gameId, gameState, finalizeGameState]);

  // Handle events
  useEffect(() => {
    if (!lastEvent) return;

    switch (lastEvent.type) {
      case "collision":
        setShowCollision(true);
        gameState.clearCurrentRoundMove();
        break;
      case "updated":
        const data = lastEvent.data as { winner: number };
        if (data.winner !== Winner.None) {
          setLastWinner(data.winner);
          setShowGameOver(true);
        }
        break;
      case "joined":
        gameState.refetchGame();
        break;
    }

    clearEvent();
  }, [lastEvent, clearEvent, gameState]);

  return {
    ...gameState,

    // Actions
    handleSubmitMove,

    // FHE status
    fheStatus,
    isEncrypting,
    isSubmitting,
    isDecryptingMove,
    isFinalizing,
    isDecryptingState,
    isFinalizingState,

    // UI state
    showCollision,
    setShowCollision,
    showGameOver,
    setShowGameOver,
    lastWinner,
  };
}
