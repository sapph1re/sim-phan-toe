import { useState, useMemo } from "react";
import { useAccount } from "wagmi";
import { formatEther, parseEther } from "viem";
import {
  useOpenGames,
  usePlayerGames,
  useStartGame,
  useJoinGame,
  useCancelGame,
  useGame,
  useGameCount,
  useUserBalance,
  MIN_GAS_RESERVE,
} from "../hooks/useSimPhanToe";
import { Winner, isGameFinished, isGameCancelled, isAgentAddress } from "../lib/contracts";

// Timeout options in seconds
const TIMEOUT_OPTIONS = [
  { label: "1 hour", value: 3600n },
  { label: "6 hours", value: 21600n },
  { label: "24 hours", value: 86400n },
  { label: "3 days", value: 259200n },
  { label: "7 days", value: 604800n },
];

interface GameLobbyProps {
  onSelectGame: (gameId: bigint, joining?: boolean) => void;
}

export function GameLobby({ onSelectGame }: GameLobbyProps) {
  const { address } = useAccount();
  const { data: openGames, isLoading: openLoading } = useOpenGames();
  const { data: playerGames, isLoading: playerLoading } = usePlayerGames(address);
  const { data: gameCount } = useGameCount();
  const { startGame, isPending: startPending } = useStartGame();
  const { joinGame, isPending: joinPending } = useJoinGame();
  const { cancelGame, isPending: cancelPending } = useCancelGame();

  // User balance for validation (only needed for staked games)
  const { balance, displayBalance, maxStake, canAffordStake } = useUserBalance();

  // New game form state
  const [showNewGameForm, setShowNewGameForm] = useState(false);
  const [stakeInput, setStakeInput] = useState("");
  const [selectedTimeout, setSelectedTimeout] = useState(TIMEOUT_OPTIONS[2].value); // Default 24h
  const [isCreatingGame, setIsCreatingGame] = useState(false); // Local state for immediate UI feedback

  // Parse stake input and calculate validation (only for staked games)
  const stakeWei = useMemo(() => {
    try {
      return stakeInput ? parseEther(stakeInput) : 0n;
    } catch {
      return 0n;
    }
  }, [stakeInput]);

  // Only validate balance for staked games (free games are sponsored)
  const isStakedGame = stakeWei > 0n;
  const canAffordCurrentStake = !isStakedGame || canAffordStake(stakeWei);
  const isStakeValid = stakeWei >= 0n && canAffordCurrentStake;
  const showStakeWarning = isStakedGame && !canAffordCurrentStake;

  const handleStartGame = async () => {
    setIsCreatingGame(true); // Show overlay immediately
    try {
      const stake = stakeInput ? parseEther(stakeInput) : 0n;
      await startGame(selectedTimeout, stake);
      setShowNewGameForm(false);
      setStakeInput("");
    } catch (error) {
      console.error("Failed to start game:", error);
    } finally {
      setIsCreatingGame(false);
    }
  };

  const handleJoinGame = async (gameId: bigint, stake: bigint) => {
    try {
      await joinGame(gameId, stake);
      onSelectGame(gameId, true); // true = joining (transaction pending confirmation)
    } catch (error) {
      console.error("Failed to join game:", error);
    }
  };

  const handleCancelGame = async (gameId: bigint) => {
    try {
      await cancelGame(gameId);
    } catch (error) {
      console.error("Failed to cancel game:", error);
    }
  };

  // Filter out games created by current player from open games
  const joinableGames =
    openGames?.filter((id) => {
      return !playerGames?.includes(id);
    }) ?? [];

  // Show creating game overlay (use local state for immediate feedback)
  if (isCreatingGame || startPending) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="glass p-8 text-center max-w-md">
            <div className="w-20 h-20 mx-auto mb-6 relative">
              <div className="absolute inset-0 border-4 border-cyber-purple/30 border-t-cyber-purple rounded-full animate-spin" />
              <div
                className="absolute inset-2 border-4 border-cyber-pink/30 border-b-cyber-pink rounded-full animate-spin"
                style={{ animationDirection: "reverse", animationDuration: "1.5s" }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-cyber-purple"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
            </div>
            <h2 className="font-display text-2xl font-bold mb-3">
              <span className="text-cyber-purple">Creating</span> Phantom Game
            </h2>
            <p className="text-gray-400 mb-4">Setting up your encrypted game on the blockchain...</p>
            <div className="glass-darker p-3 text-xs text-gray-500">
              <p className="flex items-center justify-center gap-2">
                <svg
                  className="w-4 h-4 text-yellow-500 animate-pulse"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Waiting for transaction confirmation...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="text-center">
        <h2 className="font-display text-3xl font-bold mb-2">
          <span className="text-cyber-purple">Phantom</span> Lobby
        </h2>
        <p className="text-gray-500">Start a new encrypted game or join an existing one</p>
        {gameCount !== undefined && (
          <p className="text-sm text-gray-600 mt-1">
            Total games played: <span className="text-cyber-cyan font-semibold">{gameCount.toString()}</span>
          </p>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex justify-center">
        {!showNewGameForm ? (
          <button
            onClick={() => setShowNewGameForm(true)}
            disabled={isCreatingGame || startPending}
            className="btn-primary text-lg px-8 py-4 flex items-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              <line x1="12" y1="15" x2="12" y2="17" />
            </svg>
            Start Encrypted Game
          </button>
        ) : (
          <div className="card w-full max-w-md">
            <h3 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-cyber-purple"></span>
              New Phantom Game
            </h3>

            {/* Stake Input */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-gray-400">
                  Stake Amount (ETH)
                  <span className="text-gray-600 ml-2">Optional</span>
                </label>
                <span className="text-xs text-gray-500">
                  Balance: <span className="text-cyber-cyan">{displayBalance}</span>
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="0.0"
                  value={stakeInput}
                  onChange={(e) => setStakeInput(e.target.value)}
                  className={`w-full bg-cyber-darker border rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none ${
                    showStakeWarning
                      ? "border-red-500 focus:border-red-500"
                      : "border-gray-700 focus:border-cyber-purple"
                  }`}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">ETH</span>
              </div>
              {showStakeWarning ? (
                <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  Insufficient balance. Max stake: {formatEther(maxStake)} ETH
                </p>
              ) : (
                <p className="text-xs text-gray-600 mt-1">
                  {isStakedGame
                    ? "Opponent must match this stake to join. Winner takes all!"
                    : "Leave at 0 for a free game (gas sponsored)."}
                </p>
              )}
            </div>

            {/* Timeout Selection */}
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">Move Timeout</label>
              <div className="grid grid-cols-3 gap-2">
                {TIMEOUT_OPTIONS.map((option) => (
                  <button
                    key={option.value.toString()}
                    onClick={() => setSelectedTimeout(option.value)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedTimeout === option.value
                        ? "bg-cyber-purple text-white"
                        : "bg-cyber-darker border border-gray-700 text-gray-400 hover:border-cyber-purple/50"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-1">Time limit for each move. Timeout = opponent wins.</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={() => setShowNewGameForm(false)} className="flex-1 btn-secondary py-3">
                Cancel
              </button>
              <button
                onClick={handleStartGame}
                disabled={isCreatingGame || startPending || !isStakeValid}
                className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
              >
                {isCreatingGame || startPending ? (
                  <LoadingSpinner />
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    {isStakedGame ? `Create (${stakeInput} ETH)` : "Create Game"}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Your Games */}
        <div className="card">
          <h3 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-cyber-purple"></span>
            Your Games
            {playerGames && playerGames.length > 0 && (
              <span className="text-sm font-normal text-gray-500">({playerGames.length})</span>
            )}
          </h3>

          {playerLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : playerGames && playerGames.length > 0 ? (
            <div className="space-y-3">
              {playerGames.map((gameId) => (
                <PlayerGameCard
                  key={gameId.toString()}
                  gameId={gameId}
                  playerAddress={address}
                  onSelect={() => onSelectGame(gameId)}
                  onCancel={handleCancelGame}
                  isCancelling={cancelPending}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <svg
                className="w-12 h-12 mx-auto mb-3 opacity-50"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <p>No active phantom games</p>
              <p className="text-sm">Start a new encrypted game above!</p>
            </div>
          )}
        </div>

        {/* Open Games */}
        <div className="card">
          <h3 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-cyber-cyan"></span>
            Open Games
            {joinableGames.length > 0 && (
              <span className="text-sm font-normal text-gray-500">({joinableGames.length})</span>
            )}
          </h3>

          {openLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : joinableGames.length > 0 ? (
            <div className="space-y-3">
              {joinableGames.map((gameId) => (
                <OpenGameCard
                  key={gameId.toString()}
                  gameId={gameId}
                  onJoin={(stake) => handleJoinGame(gameId, stake)}
                  isJoining={joinPending}
                  userBalance={balance}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <p>No open games</p>
              <p className="text-sm">Be the first to start one!</p>
            </div>
          )}
        </div>
      </div>

      {/* How to Play - Phantom Edition */}
      <div className="card mt-8">
        <h3 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-cyber-pink"></span>
          How to Play
          <span className="fhe-indicator ml-2">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            FHE Encrypted
          </span>
        </h3>
        <div className="grid md:grid-cols-3 gap-6 text-sm">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-lg bg-cyber-purple/20 flex items-center justify-center text-cyber-purple font-display font-bold">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h4 className="font-semibold">Encrypted Moves</h4>
            <p className="text-gray-500">
              Your move is encrypted with FHE before submission. Not even the blockchain can see where you played!
            </p>
          </div>
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-lg bg-cyber-pink/20 flex items-center justify-center text-cyber-pink font-display font-bold">
              👻
            </div>
            <h4 className="font-semibold">Phantom Board</h4>
            <p className="text-gray-500">
              You only see your own moves. Opponent's positions remain hidden until the game ends!
            </p>
          </div>
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-lg bg-cyber-cyan/20 flex items-center justify-center text-cyber-cyan font-display font-bold">
              ⚡
            </div>
            <h4 className="font-semibold">Simultaneous Play</h4>
            <p className="text-gray-500">
              Both players submit at the same time. Collisions cancel both moves — pure strategy!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerGameCard({
  gameId,
  playerAddress,
  onSelect,
  onCancel,
  isCancelling,
}: {
  gameId: bigint;
  playerAddress?: `0x${string}`;
  onSelect: () => void;
  onCancel: (gameId: bigint) => void;
  isCancelling: boolean;
}) {
  const { data: game } = useGame(gameId);

  if (!game) return null;

  const isWaiting = game.player2 === "0x0000000000000000000000000000000000000000";
  const isFinished = isGameFinished(game);
  const isCancelled = isGameCancelled(game);
  const isPlayer1 = playerAddress === game.player1;
  const hasStake = game.stake > 0n;

  // Check if opponent is the agent
  const opponentAddress = isPlayer1 ? game.player2 : game.player1;
  const opponentIsAgent = isAgentAddress(opponentAddress);

  // Determine win/loss status for finished games
  let gameResult: "won" | "lost" | "draw" | "cancelled" | null = null;
  if (isCancelled) {
    gameResult = "cancelled";
  } else if (isFinished && game.winner !== Winner.None) {
    if (game.winner === Winner.Draw) {
      gameResult = "draw";
    } else if ((game.winner === Winner.Player1 && isPlayer1) || (game.winner === Winner.Player2 && !isPlayer1)) {
      gameResult = "won";
    } else {
      gameResult = "lost";
    }
  }

  let status = "";
  let statusColor = "";
  let statusIcon = null;

  if (isCancelled) {
    status = "Cancelled";
    statusColor = "text-gray-500";
    statusIcon = "✕";
  } else if (isWaiting) {
    status = "Waiting for opponent...";
    statusColor = "text-yellow-500";
  } else if (isFinished) {
    if (gameResult === "won") {
      status = "Victory!";
      statusColor = "text-green-500";
      statusIcon = "🏆";
    } else if (gameResult === "lost") {
      status = "Defeat";
      statusColor = "text-red-500";
      statusIcon = "👻";
    } else {
      status = "Draw";
      statusColor = "text-gray-400";
      statusIcon = "🤝";
    }
  } else {
    status = "In Progress";
    statusColor = "text-cyber-cyan";
  }

  // Format timeout for display
  const formatTimeout = (seconds: bigint) => {
    const hours = Number(seconds) / 3600;
    if (hours >= 24) return `${Math.round(hours / 24)}d`;
    return `${Math.round(hours)}h`;
  };

  return (
    <div
      className={`w-full glass-darker p-4 flex items-center justify-between hover:border-cyber-purple/30 transition-all group ${
        isFinished
          ? gameResult === "won"
            ? "border-l-4 border-l-green-500/50"
            : gameResult === "lost"
              ? "border-l-4 border-l-red-500/50"
              : ""
          : ""
      }`}
    >
      <button onClick={onSelect} className="flex items-center gap-3 flex-1 text-left">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center font-display font-bold relative ${
            gameResult === "won"
              ? "bg-gradient-to-br from-green-500/20 to-emerald-500/20 text-green-500"
              : gameResult === "lost"
                ? "bg-gradient-to-br from-red-500/20 to-orange-500/20 text-red-500"
                : gameResult === "cancelled"
                  ? "bg-gray-500/20 text-gray-500"
                  : "bg-gradient-to-br from-cyber-purple/20 to-cyber-pink/20 text-cyber-purple"
          }`}
        >
          {statusIcon || `#${gameId.toString()}`}
          {!isFinished && !isCancelled && (
            <div className="absolute -top-1 -right-1">
              <svg
                className="w-4 h-4 text-cyber-purple/50"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
          )}
        </div>
        <div>
          <p className="font-semibold flex items-center gap-2">
            Phantom Game #{gameId.toString()}
            {opponentIsAgent && !isWaiting && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-cyber-blue/20 text-cyber-blue font-normal">
                🤖 vs Agent
              </span>
            )}
          </p>
          <p className={`text-sm ${statusColor}`}>{status}</p>
          {/* Show stake and timeout badges */}
          <div className="flex items-center gap-2 mt-1">
            {hasStake && (
              <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-500">
                {formatEther(game.stake)} ETH
              </span>
            )}
            <span className="relative group/timeout">
              <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400">
                ⏱ {formatTimeout(game.moveTimeout)}
              </span>
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs text-white bg-gray-900 border border-gray-700 rounded shadow-lg opacity-0 group-hover/timeout:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                Move timeout
              </span>
            </span>
          </div>
        </div>
      </button>

      <div className="flex items-center gap-2">
        {/* Cancel button for player1's waiting games (not shown if already cancelled) */}
        {isWaiting && isPlayer1 && !isCancelled && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCancel(gameId);
            }}
            disabled={isCancelling}
            className="px-3 py-1.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
          >
            {isCancelling ? <LoadingSpinner /> : "Cancel"}
          </button>
        )}
        <svg
          className="w-5 h-5 text-gray-500 group-hover:text-cyber-purple transition-colors"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}

function OpenGameCard({
  gameId,
  onJoin,
  isJoining,
  userBalance,
}: {
  gameId: bigint;
  onJoin: (stake: bigint) => void;
  isJoining: boolean;
  userBalance: bigint;
}) {
  const { data: game } = useGame(gameId);

  if (!game) return null;

  const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const hasStake = game.stake > 0n;
  const creatorIsAgent = isAgentAddress(game.player1);

  // Only check balance for staked games (free games are sponsored)
  const requiredAmount = game.stake + MIN_GAS_RESERVE;
  const canAffordToJoin = !hasStake || userBalance >= requiredAmount;
  const shortfall = requiredAmount - userBalance;

  // Format timeout for display
  const formatTimeout = (seconds: bigint) => {
    const hours = Number(seconds) / 3600;
    if (hours >= 24) return `${Math.round(hours / 24)} days`;
    return `${Math.round(hours)} hours`;
  };

  return (
    <div className="glass-darker p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center font-display font-bold relative ${
              creatorIsAgent
                ? "bg-gradient-to-br from-cyber-blue/20 to-indigo-500/20 text-cyber-blue"
                : "bg-gradient-to-br from-cyber-cyan/20 to-cyber-blue/20 text-cyber-cyan"
            }`}
          >
            {creatorIsAgent ? "🤖" : `#${gameId.toString()}`}
            <div className="absolute -top-1 -right-1">
              <svg
                className="w-4 h-4 text-cyber-cyan/50 lock-pulse"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
          </div>
          <div>
            <p className="font-semibold flex items-center gap-2">
              Phantom Game #{gameId.toString()}
              {creatorIsAgent && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-cyber-blue/20 text-cyber-blue font-normal">
                  🤖 Agent
                </span>
              )}
            </p>
            <p className="text-sm text-gray-500">Created by {shortenAddress(game.player1)}</p>
          </div>
        </div>
      </div>

      {/* Game details */}
      <div className="flex items-center gap-3 mb-3 text-sm">
        {hasStake ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-yellow-500/20 text-yellow-400">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v12M8 10h8M8 14h8" />
            </svg>
            {formatEther(game.stake)} ETH stake
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-500/20 text-green-400">
            Free game
          </div>
        )}
        <div className="relative group/timeout">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-700 text-gray-400">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {formatTimeout(game.moveTimeout)}
          </div>
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs text-white bg-gray-900 border border-gray-700 rounded shadow-lg opacity-0 group-hover/timeout:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Move timeout
          </span>
        </div>
      </div>

      {/* Insufficient funds warning (only for staked games) */}
      {hasStake && !canAffordToJoin && (
        <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-400 flex items-center gap-1.5">
            <svg
              className="w-3.5 h-3.5 flex-shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Need {formatEther(shortfall)} more ETH ({formatEther(game.stake)} stake + gas)
          </p>
        </div>
      )}

      <button
        onClick={() => onJoin(game.stake)}
        disabled={isJoining || !canAffordToJoin}
        className={`w-full text-sm py-2.5 flex items-center justify-center gap-2 ${
          canAffordToJoin ? "btn-secondary" : "btn-secondary opacity-50 cursor-not-allowed"
        }`}
      >
        {isJoining ? (
          <LoadingSpinner />
        ) : !canAffordToJoin ? (
          "Insufficient Balance"
        ) : hasStake ? (
          <>Join with {formatEther(game.stake)} ETH</>
        ) : (
          "Join Game"
        )}
      </button>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );
}
