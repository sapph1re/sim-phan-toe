import { useState, useCallback, useEffect } from "react";
import { flushSync } from "react-dom";
import { GameBoard } from "./GameBoard";
import { MoveIndicator, CollisionNotification, GameOverNotification } from "./MoveIndicator";
import { FHEStatus } from "./FHEStatus";
import { useGameFlow, useStartGame } from "../hooks/useSimPhanToe";
import { Winner, isGameFinished } from "../lib/contracts";

interface GameViewProps {
  gameId: bigint;
  onBack: () => void;
  isJoining?: boolean;
  onJoinComplete?: () => void;
}

export function GameView({ gameId, onBack, isJoining, onJoinComplete }: GameViewProps) {
  const {
    game,
    isLoading,
    isPlayer,
    isPlayer1,
    waitingForOpponent,
    gamePhase,
    canSubmitMove,
    myMoveSubmitted,
    myMoveMade,
    opponentMoveSubmitted,
    opponentMoveMade,
    myLocalMoves,
    currentRoundMove,
    addLocalMove,
    handleSubmitMove,
    handleRetry,
    handleFinalizeGame,
    handleRevealBoard,
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
    showCollision,
    setShowCollision,
    showGameOver,
    setShowGameOver,
    lastWinner,
    boardRevealed: boardIsRevealed,
  } = useGameFlow(gameId);

  const { startGame } = useStartGame();
  const [collisionCell, setCollisionCell] = useState<{ x: number; y: number } | null>(null);
  const [isPendingSubmit, setIsPendingSubmit] = useState(false);

  const handleCellClick = useCallback(
    (x: number, y: number) => {
      if (!canSubmitMove || myMoveSubmitted) return;
      addLocalMove(x, y);
    },
    [canSubmitMove, myMoveSubmitted, addLocalMove],
  );

  const handleSubmit = async () => {
    if (!currentRoundMove || myMoveSubmitted) {
      return;
    }
    // Force React to immediately update the DOM
    flushSync(() => {
      setIsPendingSubmit(true);
    });
    // Yield to browser event loop to allow paint before heavy FHE work starts
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      await handleSubmitMove();
    } catch (error) {
      console.error("Failed to submit move:", error);
    } finally {
      setIsPendingSubmit(false);
    }
  };

  const handleNewGame = async () => {
    try {
      await startGame();
      onBack();
    } catch (error) {
      console.error("Failed to start new game:", error);
    }
  };

  const handleDismissCollision = () => {
    setShowCollision(false);
    setCollisionCell(null);
  };

  // Determine if any FHE operation is in progress
  const isFHEOperating =
    isPendingSubmit ||
    isEncrypting ||
    isSubmitting ||
    isDecryptingMove ||
    isFinalizing ||
    isDecryptingState ||
    isFinalizingState ||
    isRevealingBoard ||
    isDecryptingBoard;

  // When user becomes a player (join transaction confirmed), notify parent
  useEffect(() => {
    if (isPlayer && isJoining && onJoinComplete) {
      onJoinComplete();
    }
  }, [isPlayer, isJoining, onJoinComplete]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 border-4 border-cyber-purple/30 border-t-cyber-purple rounded-full animate-spin" />
          <p className="text-gray-500">Loading phantom game...</p>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="glass p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-500/20 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-gray-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4m0 4h.01" />
            </svg>
          </div>
          <h2 className="font-display text-2xl font-bold mb-4">Game Not Found</h2>
          <p className="text-gray-500 mb-6">This phantom game doesn't exist or has been removed.</p>
          <button onClick={onBack} className="btn-primary">
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  if (!isPlayer) {
    // Show "Joining game..." while the join transaction is being confirmed
    if (isJoining) {
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="glass p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 border-4 border-cyber-purple/30 border-t-cyber-purple rounded-full animate-spin" />
            <h2 className="font-display text-2xl font-bold mb-4">Joining Game...</h2>
            <p className="text-gray-500 mb-6">Waiting for your join transaction to be confirmed on the blockchain.</p>
          </div>
        </div>
      );
    }

    // Otherwise show spectator mode
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="glass p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-cyber-purple/20 flex items-center justify-center">
            👻
          </div>
          <h2 className="font-display text-2xl font-bold mb-4">Spectator Mode</h2>
          <p className="text-gray-500 mb-6">
            You are not a player in this phantom game. The board is encrypted — there's nothing to see!
          </p>
          <button onClick={onBack} className="btn-primary">
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  const isGameOver = isGameFinished(game);
  const winnerType = lastWinner === Winner.Player1 ? "player1" : lastWinner === Winner.Player2 ? "player2" : "draw";

  // Determine user's result for finished games
  const getUserResult = () => {
    if (!isGameOver || game.winner === Winner.None) return null;
    if (game.winner === Winner.Draw) return "draw";
    if ((game.winner === Winner.Player1 && isPlayer1) || (game.winner === Winner.Player2 && !isPlayer1)) {
      return "won";
    }
    return "lost";
  };
  const userResult = getUserResult();

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Lobby
        </button>
        <div className="flex items-center gap-3">
          <div className="fhe-indicator">
            <svg
              className={`w-3 h-3 ${isFHEOperating ? "animate-pulse" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            {isFHEOperating ? "Processing..." : boardIsRevealed ? "Revealed" : "Encrypted"}
          </div>
          <div className="font-display text-xl">
            <span className="text-gray-500">Phantom</span>
            <span className="text-cyber-purple ml-2">#{gameId.toString()}</span>
          </div>
        </div>
      </div>

      {/* Winner Banner for finished games */}
      {isGameOver && userResult && (
        <div
          className={`mb-6 p-4 rounded-xl text-center ${
            userResult === "won"
              ? "bg-green-500/20 border border-green-500/30"
              : userResult === "lost"
                ? "bg-red-500/20 border border-red-500/30"
                : "bg-gray-500/20 border border-gray-500/30"
          }`}
        >
          <div className="flex items-center justify-center gap-3">
            <span className="text-3xl">{userResult === "won" ? "🏆" : userResult === "lost" ? "👻" : "🤝"}</span>
            <div>
              <h3
                className={`font-display text-xl font-bold ${
                  userResult === "won" ? "text-green-500" : userResult === "lost" ? "text-red-500" : "text-gray-400"
                }`}
              >
                {userResult === "won" ? "Victory!" : userResult === "lost" ? "Defeat" : "It's a Draw!"}
              </h3>
              <p className="text-sm text-gray-500">
                {userResult === "won"
                  ? "You outmaneuvered your opponent in the fog of war!"
                  : userResult === "lost"
                    ? "The phantom got you this time."
                    : "Both players achieved victory simultaneously!"}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-8 items-start">
        {/* Game Board */}
        <div className="flex flex-col items-center">
          <GameBoard
            myLocalMoves={myLocalMoves}
            currentRoundMove={currentRoundMove}
            onCellClick={handleCellClick}
            disabled={waitingForOpponent || myMoveSubmitted || isGameOver || isFHEOperating}
            isPlayer1={isPlayer1}
            collisionCell={collisionCell}
            isLoading={isFHEOperating}
            revealedBoard={boardIsRevealed ? game.board : null}
            isRevealed={boardIsRevealed}
          />

          {/* Submit button */}
          {!waitingForOpponent && !isGameOver && (
            <div className="mt-6 w-full max-w-xs">
              <button
                onClick={handleSubmit}
                disabled={!currentRoundMove || myMoveSubmitted || isFHEOperating}
                className="w-full btn-primary py-4 text-lg flex items-center justify-center gap-2"
              >
                {isFHEOperating ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    {isSubmitting ? "Submitting..." : "Encrypting..."}
                  </>
                ) : myMoveSubmitted ? (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Move Encrypted ✓
                  </>
                ) : currentRoundMove ? (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Encrypt & Submit
                  </>
                ) : (
                  "Select a Cell"
                )}
              </button>
            </div>
          )}

          {/* Reveal Board button for finished games where board isn't revealed yet */}
          {isGameOver && !boardIsRevealed && !isRevealingBoard && !isDecryptingBoard && (
            <div className="mt-6 w-full max-w-xs">
              <button
                onClick={handleRevealBoard}
                className="w-full btn-secondary py-3 text-base flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Reveal Board
              </button>
            </div>
          )}
        </div>

        {/* Game Info Panel */}
        <div className="space-y-6">
          {/* FHE Status */}
          <FHEStatus
            status={fheStatus}
            isEncrypting={isEncrypting}
            isDecrypting={isDecryptingMove || isDecryptingState || isDecryptingBoard}
            isSubmitting={isSubmitting || isFinalizing || isFinalizingState || isRevealingBoard}
            canRetry={canRetry}
            onRetry={handleRetry}
          />

          {/* Finalize Game Button - shown when game is stuck */}
          {needsGameFinalization && !isDecryptingState && !isFinalizingState && (
            <div className="glass p-4 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-l-4 border-l-yellow-500">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-yellow-500"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-yellow-500">Game needs finalization</p>
                    <p className="text-xs text-gray-500">
                      Both moves were processed. Click to finalize the game result.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleFinalizeGame}
                  className="px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/50 text-yellow-400 rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  Finalize Game
                </button>
              </div>
            </div>
          )}

          {/* Move Status */}
          {!isGameOver && (
            <MoveIndicator
              myMoveSubmitted={myMoveSubmitted}
              myMoveMade={myMoveMade}
              opponentMoveSubmitted={opponentMoveSubmitted}
              opponentMoveMade={opponentMoveMade}
              isPlayer1={isPlayer1}
              waitingForOpponent={waitingForOpponent}
              gamePhase={gamePhase}
            />
          )}

          {/* Game Info */}
          <div className="card">
            <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
              Game Info
              <span className="fhe-indicator text-xs">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                FHE
              </span>
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Your Symbol</span>
                <span className={`font-bold ${isPlayer1 ? "text-cyber-purple" : "text-cyber-cyan"}`}>
                  {isPlayer1 ? "✕ (Player 1)" : "○ (Player 2)"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Game Status</span>
                <span
                  className={`font-semibold ${
                    isGameOver ? "text-gray-400" : waitingForOpponent ? "text-yellow-500" : "text-green-500"
                  }`}
                >
                  {isGameOver ? "Finished" : waitingForOpponent ? "Waiting for Player 2" : "In Progress"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Your Moves</span>
                <span>{myLocalMoves.length}/8 max</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Board State</span>
                <span className={boardIsRevealed ? "text-green-500" : "text-cyber-purple"}>
                  {boardIsRevealed ? (
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      Revealed
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      Encrypted
                    </span>
                  )}
                </span>
              </div>
              {isGameOver && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Winner</span>
                  <span
                    className={`font-semibold ${
                      game.winner === Winner.Draw
                        ? "text-gray-400"
                        : game.winner === Winner.Player1
                          ? "text-cyber-purple"
                          : "text-cyber-cyan"
                    }`}
                  >
                    {game.winner === Winner.Draw
                      ? "Draw"
                      : game.winner === Winner.Player1
                        ? "Player 1 ✕"
                        : "Player 2 ○"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Player Addresses */}
          <div className="card">
            <h3 className="font-display text-lg font-semibold mb-4">Players</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
                    isGameOver && game.winner === Winner.Player1
                      ? "bg-green-500/20 text-green-500"
                      : "bg-cyber-purple/20 text-cyber-purple"
                  }`}
                >
                  ✕
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500">
                    Player 1 {isPlayer1 && "(You)"}
                    {isGameOver && game.winner === Winner.Player1 && (
                      <span className="ml-2 text-green-500">Winner!</span>
                    )}
                  </p>
                  <p className="font-mono text-sm truncate">{game.player1}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold relative ${
                    isGameOver && game.winner === Winner.Player2
                      ? "bg-green-500/20 text-green-500"
                      : "bg-cyber-cyan/20 text-cyber-cyan"
                  }`}
                >
                  ○{/* Lock overlay for opponent (only when game not revealed) */}
                  {!boardIsRevealed &&
                    (!isPlayer1 || waitingForOpponent ? null : (
                      <div className="absolute inset-0 flex items-center justify-center bg-cyber-darker/50 rounded-lg">
                        <svg
                          className="w-4 h-4 text-gray-500"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </div>
                    ))}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500">
                    Player 2 {!isPlayer1 && isPlayer && "(You)"}
                    {isGameOver && game.winner === Winner.Player2 && (
                      <span className="ml-2 text-green-500">Winner!</span>
                    )}
                  </p>
                  <p className="font-mono text-sm truncate">{waitingForOpponent ? "Waiting..." : game.player2}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Phantom Tips */}
          {!isGameOver && !waitingForOpponent && (
            <div className="glass-darker p-4">
              <p className="text-xs text-gray-500">
                👻 <strong>Phantom Tip:</strong> You can only see your own moves. The opponent's board is completely
                hidden — use strategy and intuition!
              </p>
            </div>
          )}

          {/* Board revealed info */}
          {isGameOver && boardIsRevealed && (
            <div className="glass-darker p-4">
              <p className="text-xs text-gray-500">
                🔓 <strong>Board Revealed:</strong> The full board is now visible showing all moves from both players.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Overlays */}
      {showCollision && <CollisionNotification onDismiss={handleDismissCollision} />}

      {showGameOver && isGameOver && (
        <GameOverNotification
          winner={winnerType}
          isPlayer1={isPlayer1}
          onNewGame={handleNewGame}
          onBackToLobby={onBack}
          onClose={() => setShowGameOver(false)}
          boardRevealed={boardIsRevealed}
          onRevealBoard={!boardIsRevealed ? handleRevealBoard : undefined}
        />
      )}
    </div>
  );
}
