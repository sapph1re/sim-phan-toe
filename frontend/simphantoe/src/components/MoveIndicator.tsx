import { GamePhase } from '../lib/contracts'

interface MoveIndicatorProps {
  myMoveSubmitted: boolean
  myMoveMade: boolean
  opponentMoveSubmitted: boolean
  opponentMoveMade: boolean
  isPlayer1: boolean
  waitingForOpponent: boolean
  gamePhase: GamePhase
}

export function MoveIndicator({ 
  myMoveSubmitted,
  myMoveMade,
  opponentMoveSubmitted,
  opponentMoveMade,
  isPlayer1,
  waitingForOpponent,
  gamePhase
}: MoveIndicatorProps) {
  if (waitingForOpponent) {
    return (
      <div className="glass p-4 text-center">
        <div className="flex items-center justify-center gap-3">
          <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse" />
          <span className="text-yellow-500 font-display">Waiting for an opponent to join...</span>
        </div>
      </div>
    )
  }

  const getMyStatus = () => {
    if (myMoveMade) return { text: 'Move Finalized ✓', color: 'text-green-500' }
    if (myMoveSubmitted) return { text: 'Validating...', color: 'text-yellow-500' }
    return { text: 'Pick a cell...', color: 'text-gray-300' }
  }

  const getOpponentStatus = () => {
    if (opponentMoveMade) return { text: 'Move Finalized ✓', color: 'text-green-500' }
    if (opponentMoveSubmitted) return { text: 'Move Encrypted', color: 'text-cyber-purple' }
    return { text: 'Thinking...', color: 'text-gray-400' }
  }

  const myStatus = getMyStatus()
  const opponentStatus = getOpponentStatus()

  // Calculate progress
  const steps = [myMoveSubmitted, myMoveMade, opponentMoveSubmitted, opponentMoveMade]
  const completedSteps = steps.filter(Boolean).length
  const progressPercent = (completedSteps / 4) * 100

  return (
    <div className="glass p-4">
      <div className="flex items-center justify-between">
        {/* Your status */}
        <div className="flex items-center gap-3">
          <div className={`
            w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-bold relative
            ${isPlayer1 ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-cyber-cyan/20 text-cyber-cyan'}
          `}>
            {isPlayer1 ? '✕' : '○'}
            {myMoveSubmitted && !myMoveMade && (
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-yellow-500 flex items-center justify-center">
                <svg className="w-2.5 h-2.5 text-black animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}
            {myMoveMade && (
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            )}
          </div>
          <div>
            <p className="text-sm text-gray-500">You</p>
            <p className={`font-semibold ${myStatus.color}`}>
              {myStatus.text}
            </p>
          </div>
        </div>

        {/* VS with encryption indicator */}
        <div className="flex flex-col items-center">
          <div className="font-display text-2xl text-gray-600">VS</div>
          <div className="fhe-indicator mt-1">
            <svg className="w-3 h-3 lock-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Encrypted
          </div>
        </div>

        {/* Opponent status */}
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm text-gray-500 text-right">Opponent</p>
            <p className={`font-semibold text-right ${opponentStatus.color}`}>
              {opponentStatus.text}
            </p>
          </div>
          <div className={`
            w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-bold relative
            ${!isPlayer1 ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-cyber-cyan/20 text-cyber-cyan'}
          `}>
            {/* Opponent symbol is hidden behind encryption */}
            <span className="opacity-30">{!isPlayer1 ? '✕' : '○'}</span>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-500 lock-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            {opponentMoveSubmitted && !opponentMoveMade && (
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-cyber-purple flex items-center justify-center">
                <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
            )}
            {opponentMoveMade && (
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-2 bg-white/5 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-500 bg-gradient-to-r from-cyber-purple via-cyber-pink to-cyber-cyan`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <p className="text-center text-xs text-gray-500 mt-2">
        {gamePhase === GamePhase.ProcessingMoves 
          ? 'Both moves ready! Processing...' 
          : `${completedSteps}/4 steps complete`
        }
      </p>
    </div>
  )
}

// Collision notification overlay
export function CollisionNotification({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="glass border-yellow-500/30 p-8 max-w-md text-center animate-bounce-in">
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-yellow-500/20 flex items-center justify-center">
          <svg className="w-10 h-10 text-yellow-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
          </svg>
        </div>
        <h3 className="font-display text-2xl font-bold text-yellow-500 mb-2">Collision!</h3>
        <p className="text-gray-400 mb-6">
          Both players chose the same cell! Neither move counts. 
          The encrypted coordinates matched — try a different cell this time.
        </p>
        <button onClick={onDismiss} className="btn-primary">
          Continue
        </button>
      </div>
    </div>
  )
}

// Game over overlay
export function GameOverNotification({ 
  winner, 
  isPlayer1, 
  onNewGame, 
  onBackToLobby,
  onClose,
  boardRevealed = false,
  onRevealBoard
}: { 
  winner: 'player1' | 'player2' | 'draw'
  isPlayer1: boolean
  onNewGame: () => void
  onBackToLobby: () => void
  onClose?: () => void
  boardRevealed?: boolean
  onRevealBoard?: () => void
}) {
  const didWin = (winner === 'player1' && isPlayer1) || (winner === 'player2' && !isPlayer1)
  const isDraw = winner === 'draw'

  // Handle click on backdrop
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && onClose) {
      onClose()
    }
  }

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div className={`glass p-8 max-w-md text-center animate-bounce-in relative ${
        isDraw ? 'border-gray-500/30' : didWin ? 'border-green-500/30' : 'border-red-500/30'
      }`}>
        {/* Close button */}
        {onClose && (
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}

        <div className={`w-24 h-24 mx-auto mb-4 rounded-full flex items-center justify-center ${
          isDraw ? 'bg-gray-500/20' : didWin ? 'bg-green-500/20' : 'bg-red-500/20'
        }`}>
          {isDraw ? (
            <span className="text-4xl">🤝</span>
          ) : didWin ? (
            <span className="text-4xl">🏆</span>
          ) : (
            <span className="text-4xl">👻</span>
          )}
        </div>
        
        <h3 className={`font-display text-3xl font-bold mb-2 ${
          isDraw ? 'text-gray-400' : didWin ? 'text-green-500' : 'text-red-500'
        }`}>
          {isDraw ? "It's a Draw!" : didWin ? 'You Won!' : 'You Lost'}
        </h3>
        
        <p className="text-gray-400 mb-4">
          {isDraw 
            ? 'Both players achieved victory simultaneously — a phantom draw!'
            : didWin 
              ? 'You outmaneuvered your opponent in the fog of war!'
              : 'The phantom got you this time. Try again!'}
        </p>

        {/* Board reveal status */}
        <div className="glass-darker p-3 mb-6 text-xs text-gray-500">
          {boardRevealed ? (
            <p className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              The board has been revealed — check out all the moves!
            </p>
          ) : (
            <div>
              <p className="flex items-center justify-center gap-2 mb-2">
                <svg className="w-4 h-4 text-cyber-purple" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                </svg>
                The board can now be decrypted and revealed!
              </p>
              {onRevealBoard && (
                <button 
                  onClick={onRevealBoard}
                  className="text-cyber-purple hover:text-cyber-pink transition-colors underline"
                >
                  Click to reveal the full board
                </button>
              )}
            </div>
          )}
        </div>
        
        <div className="flex gap-3 justify-center flex-wrap">
          {onClose && boardRevealed && (
            <button onClick={onClose} className="btn-secondary flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              View Board
            </button>
          )}
          <button onClick={onBackToLobby} className="btn-secondary">
            Back to Lobby
          </button>
          <button onClick={onNewGame} className="btn-primary">
            New Game
          </button>
        </div>
      </div>
    </div>
  )
}
