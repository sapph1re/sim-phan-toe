import { useReadContract, useWriteContract, useWatchContractEvent, useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { SIMTACTOE_ABI, SIMTACTOE_ADDRESS, type Game } from "../lib/contracts";

// Hook to get the contract address with validation
export function useContractAddress() {
  const address = SIMTACTOE_ADDRESS;
  const isValid = address && address.startsWith("0x") && address.length === 42;
  return { address: isValid ? address : undefined, isConfigured: isValid };
}

// Hook to get the total game count
export function useGameCount() {
  const { address } = useContractAddress();
  return useReadContract({
    address,
    abi: SIMTACTOE_ABI,
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
    abi: SIMTACTOE_ABI,
    functionName: "getGame",
    args: gameId !== undefined ? [gameId] : undefined,
    query: {
      enabled: !!address && gameId !== undefined,
      refetchInterval: 3000, // Poll every 3 seconds for updates
    },
  });
}

// Hook to get open games (waiting for player 2)
export function useOpenGames() {
  const { address } = useContractAddress();
  return useReadContract({
    address,
    abi: SIMTACTOE_ABI,
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
    abi: SIMTACTOE_ABI,
    functionName: "getGamesByPlayer",
    args: playerAddress ? [playerAddress] : undefined,
    query: {
      enabled: !!address && !!playerAddress,
      refetchInterval: 5000,
    },
  });
}

// Hook to check if a player has submitted a move
export function usePlayerMove(gameId: bigint | undefined, playerAddress: `0x${string}` | undefined) {
  const { address } = useContractAddress();
  return useReadContract({
    address,
    abi: SIMTACTOE_ABI,
    functionName: "nextMoves",
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
      abi: SIMTACTOE_ABI,
      functionName: "startGame",
    });
    // Invalidate queries to refresh game list
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
        abi: SIMTACTOE_ABI,
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

// Hook to make a move
export function useMakeMove() {
  const { address } = useContractAddress();
  const { writeContractAsync, isPending, isSuccess, error } = useWriteContract();
  const queryClient = useQueryClient();

  const makeMove = useCallback(
    async (gameId: bigint, x: number, y: number) => {
      if (!address) throw new Error("Contract not configured");
      const result = await writeContractAsync({
        address,
        abi: SIMTACTOE_ABI,
        functionName: "makeMove",
        args: [gameId, x, y],
      });
      queryClient.invalidateQueries({ queryKey: ["readContract"] });
      return result;
    },
    [address, writeContractAsync, queryClient],
  );

  return { makeMove, isPending, isSuccess, error };
}

// Hook to watch for game events
export function useGameEvents(gameId: bigint | undefined) {
  const { address } = useContractAddress();
  const queryClient = useQueryClient();
  const [lastEvent, setLastEvent] = useState<{
    type: "move" | "collision" | "ended" | "joined";
    data: unknown;
  } | null>(null);

  useWatchContractEvent({
    address,
    abi: SIMTACTOE_ABI,
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
    abi: SIMTACTOE_ABI,
    eventName: "MoveMade",
    onLogs: (logs) => {
      const relevant = logs.find((log) => log.args.gameId === gameId);
      if (relevant) {
        setLastEvent({ type: "move", data: relevant.args });
        queryClient.invalidateQueries({ queryKey: ["readContract"] });
      }
    },
    enabled: !!address && gameId !== undefined,
  });

  useWatchContractEvent({
    address,
    abi: SIMTACTOE_ABI,
    eventName: "MovesCollided",
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
    abi: SIMTACTOE_ABI,
    eventName: "GameEnded",
    onLogs: (logs) => {
      const relevant = logs.find((log) => log.args.gameId === gameId);
      if (relevant) {
        setLastEvent({ type: "ended", data: relevant.args });
        queryClient.invalidateQueries({ queryKey: ["readContract"] });
      }
    },
    enabled: !!address && gameId !== undefined,
  });

  return { lastEvent, clearEvent: () => setLastEvent(null) };
}

// Combined hook for the current player's game state
export function useCurrentPlayerGameState(gameId: bigint | undefined) {
  const { address: playerAddress } = useAccount();
  const { data: game, isLoading: gameLoading, refetch: refetchGame } = useGame(gameId);
  const { data: myMove, isLoading: moveLoading } = usePlayerMove(gameId, playerAddress);

  // Determine opponent address
  const opponentAddress = game ? (playerAddress === game.playerOne ? game.playerTwo : game.playerOne) : undefined;

  const { data: opponentMove } = usePlayerMove(gameId, opponentAddress as `0x${string}` | undefined);

  const isPlayer1 = playerAddress === game?.playerOne;
  const isPlayer2 = playerAddress === game?.playerTwo;
  const isPlayer = isPlayer1 || isPlayer2;
  const waitingForOpponent = game?.playerTwo === "0x0000000000000000000000000000000000000000";
  // nextMoves returns a tuple: [isMade, x, y]
  const myMoveSubmitted = myMove?.[0] ?? false;
  const opponentMoveSubmitted = opponentMove?.[0] ?? false;

  return {
    game: game as Game | undefined,
    isLoading: gameLoading || moveLoading,
    isPlayer,
    isPlayer1,
    isPlayer2,
    playerAddress,
    opponentAddress: opponentAddress as `0x${string}` | undefined,
    waitingForOpponent,
    myMoveSubmitted,
    opponentMoveSubmitted,
    refetchGame,
  };
}
