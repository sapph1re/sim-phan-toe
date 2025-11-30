import { useState, useEffect, useCallback } from 'react'
import { GameBoard } from './GameBoard'
import { MoveIndicator, CollisionNotification, GameOverNotification } from './MoveIndicator'
import { 
  useCurrentPlayerGameState, 
  useMakeMove, 
  useGameEvents,
  useStartGame
} from '../hooks/useSimTacToe'
import { Winner, Cell } from '../lib/contracts'

interface GameViewProps {
  gameId: bigint
  onBack: () => void
}

export function GameView({ gameId, onBack }: GameViewProps) {
  const {
    game,
    isLoading,
    isPlayer,
    isPlayer1,
    waitingForOpponent,
    myMoveSubmitted,
    opponentMoveSubmitted,
    refetchGame,
  } = useCurrentPlayerGameState(gameId)

  const { makeMove, isPending: movePending } = useMakeMove()
  const { startGame } = useStartGame()
  const { lastEvent, clearEvent } = useGameEvents(gameId)

  const [selectedCell, setSelectedCell] = useState<{ x: number; y: number } | null>(null)
  const [showCollision, setShowCollision] = useState(false)
  const [showGameOver, setShowGameOver] = useState(false)
  const [collisionCell, setCollisionCell] = useState<{ x: number; y: number } | null>(null)

  // Handle events
  useEffect(() => {
    if (lastEvent?.type === 'collision') {
      const data = lastEvent.data as { x: number; y: number }
      setCollisionCell({ x: data.x, y: data.y })
      setShowCollision(true)
      setSelectedCell(null)
      setTimeout(() => setCollisionCell(null), 2000)
      clearEvent()
    } else if (lastEvent?.type === 'ended') {
      setShowGameOver(true)
      clearEvent()
    } else if (lastEvent?.type === 'move') {
      // Refresh game state when moves are made
      refetchGame()
      setSelectedCell(null)
      clearEvent()
    } else if (lastEvent?.type === 'joined') {
      refetchGame()
      clearEvent()
    }
  }, [lastEvent, clearEvent, refetchGame])

  // Reset selected cell when game updates with new moves
  useEffect(() => {
    if (!myMoveSubmitted) {
      setSelectedCell(null)
    }
  }, [myMoveSubmitted])

  const handleCellClick = useCallback((x: number, y: number) => {
    if (myMoveSubmitted || movePending) return
    setSelectedCell({ x, y })
  }, [myMoveSubmitted, movePending])

  const handleSubmitMove = async () => {
    if (!selectedCell || myMoveSubmitted) return
    try {
      await makeMove(gameId, selectedCell.x, selectedCell.y)
    } catch (error) {
      console.error('Failed to submit move:', error)
      setSelectedCell(null)
    }
  }

  const handleNewGame = async () => {
    try {
      await startGame()
      onBack()
    } catch (error) {
      console.error('Failed to start new game:', error)
    }
  }

  const handleDismissCollision = () => {
    setShowCollision(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 border-4 border-cyber-purple/30 border-t-cyber-purple rounded-full animate-spin" />
          <p className="text-gray-500">Loading game...</p>
        </div>
      </div>
    )
  }

  if (!game) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="glass p-8 text-center">
          <h2 className="font-display text-2xl font-bold mb-4">Game Not Found</h2>
          <p className="text-gray-500 mb-6">This game doesn't exist or has been removed.</p>
          <button onClick={onBack} className="btn-primary">
            Back to Lobby
          </button>
        </div>
      </div>
    )
  }

  if (!isPlayer) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="glass p-8 text-center">
          <h2 className="font-display text-2xl font-bold mb-4">Spectator Mode</h2>
          <p className="text-gray-500 mb-6">You are not a player in this game.</p>
          <button onClick={onBack} className="btn-primary">
            Back to Lobby
          </button>
        </div>
      </div>
    )
  }

  const isGameOver = game.winner !== Winner.None
  const winnerType = game.winner === Winner.Player1 
    ? 'player1' 
    : game.winner === Winner.Player2 
      ? 'player2' 
      : 'draw'

  // Create a proper board array for the component
  const boardArray = game.board.map(row => [...row])

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Lobby
        </button>
        <div className="font-display text-xl">
          <span className="text-gray-500">Game</span>
          <span className="text-cyber-purple ml-2">#{gameId.toString()}</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8 items-start">
        {/* Game Board */}
        <div className="flex flex-col items-center">
          <GameBoard
            board={boardArray}
            selectedCell={selectedCell}
            onCellClick={handleCellClick}
            disabled={waitingForOpponent || myMoveSubmitted || isGameOver}
            isPlayer1={isPlayer1}
            collisionCell={collisionCell}
          />
          
          {/* Submit button */}
          {!waitingForOpponent && !isGameOver && (
            <div className="mt-6 w-full max-w-xs">
              <button
                onClick={handleSubmitMove}
                disabled={!selectedCell || myMoveSubmitted || movePending}
                className="w-full btn-primary py-4 text-lg"
              >
                {movePending ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Submitting...
                  </span>
                ) : myMoveSubmitted ? (
                  'Move Submitted ✓'
                ) : selectedCell ? (
                  `Submit Move (${selectedCell.x}, ${selectedCell.y})`
                ) : (
                  'Select a Cell'
                )}
              </button>
            </div>
          )}
        </div>

        {/* Game Info Panel */}
        <div className="space-y-6">
          {/* Move Status */}
          <MoveIndicator
            myMoveSubmitted={myMoveSubmitted}
            opponentMoveSubmitted={opponentMoveSubmitted}
            isPlayer1={isPlayer1}
            waitingForOpponent={waitingForOpponent}
          />

          {/* Game Info */}
          <div className="card">
            <h3 className="font-display text-lg font-semibold mb-4">Game Info</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Your Symbol</span>
                <span className={`font-bold ${isPlayer1 ? 'text-cyber-purple' : 'text-cyber-cyan'}`}>
                  {isPlayer1 ? '✕ (Player 1)' : '○ (Player 2)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Game Status</span>
                <span className={`font-semibold ${
                  isGameOver 
                    ? 'text-gray-400' 
                    : waitingForOpponent 
                      ? 'text-yellow-500' 
                      : 'text-green-500'
                }`}>
                  {isGameOver 
                    ? 'Finished' 
                    : waitingForOpponent 
                      ? 'Waiting for Player 2' 
                      : 'In Progress'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Cells Filled</span>
                <span>
                  {boardArray.flat().filter(c => c !== Cell.Empty).length}/9
                </span>
              </div>
            </div>
          </div>

          {/* Player Addresses */}
          <div className="card">
            <h3 className="font-display text-lg font-semibold mb-4">Players</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyber-purple/20 flex items-center justify-center text-cyber-purple font-bold">
                  ✕
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500">Player 1 {isPlayer1 && '(You)'}</p>
                  <p className="font-mono text-sm truncate">{game.playerOne}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyber-cyan/20 flex items-center justify-center text-cyber-cyan font-bold">
                  ○
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500">Player 2 {!isPlayer1 && isPlayer && '(You)'}</p>
                  <p className="font-mono text-sm truncate">
                    {waitingForOpponent ? 'Waiting...' : game.playerTwo}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Tips */}
          {!isGameOver && !waitingForOpponent && (
            <div className="glass-darker p-4">
              <p className="text-xs text-gray-500">
                💡 <strong>Tip:</strong> Both players submit moves simultaneously. 
                If you both pick the same cell, neither move counts!
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Overlays */}
      {showCollision && (
        <CollisionNotification onDismiss={handleDismissCollision} />
      )}
      
      {showGameOver && isGameOver && (
        <GameOverNotification
          winner={winnerType}
          isPlayer1={isPlayer1}
          onNewGame={handleNewGame}
          onBackToLobby={onBack}
        />
      )}
    </div>
  )
}

