interface MoveIndicatorProps {
  myMoveSubmitted: boolean
  opponentMoveSubmitted: boolean
  isPlayer1: boolean
  waitingForOpponent: boolean
}

export function MoveIndicator({ 
  myMoveSubmitted, 
  opponentMoveSubmitted, 
  isPlayer1,
  waitingForOpponent
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

  return (
    <div className="glass p-4">
      <div className="flex items-center justify-between">
        {/* Your status */}
        <div className="flex items-center gap-3">
          <div className={`
            w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-bold
            ${isPlayer1 ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-cyber-cyan/20 text-cyber-cyan'}
          `}>
            {isPlayer1 ? '✕' : '○'}
          </div>
          <div>
            <p className="text-sm text-gray-500">You</p>
            <p className={`font-semibold ${myMoveSubmitted ? 'text-green-500' : 'text-gray-300'}`}>
              {myMoveSubmitted ? 'Move Submitted ✓' : 'Pick a cell...'}
            </p>
          </div>
        </div>

        {/* VS */}
        <div className="font-display text-2xl text-gray-600">VS</div>

        {/* Opponent status */}
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm text-gray-500 text-right">Opponent</p>
            <p className={`font-semibold text-right ${opponentMoveSubmitted ? 'text-green-500' : 'text-gray-300'}`}>
              {opponentMoveSubmitted ? 'Move Submitted ✓' : 'Thinking...'}
            </p>
          </div>
          <div className={`
            w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-bold
            ${!isPlayer1 ? 'bg-cyber-purple/20 text-cyber-purple' : 'bg-cyber-cyan/20 text-cyber-cyan'}
          `}>
            {!isPlayer1 ? '✕' : '○'}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-2 bg-white/5 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-500 ${
            myMoveSubmitted && opponentMoveSubmitted 
              ? 'w-full bg-gradient-to-r from-cyber-purple to-cyber-cyan' 
              : myMoveSubmitted || opponentMoveSubmitted
                ? 'w-1/2 bg-gradient-to-r from-cyber-purple to-cyber-pink'
                : 'w-0'
          }`}
        />
      </div>
      <p className="text-center text-xs text-gray-500 mt-2">
        {myMoveSubmitted && opponentMoveSubmitted 
          ? 'Both moves submitted! Revealing...' 
          : `${(myMoveSubmitted ? 1 : 0) + (opponentMoveSubmitted ? 1 : 0)}/2 moves submitted`
        }
      </p>
    </div>
  )
}

// Collision notification overlay
export function CollisionNotification({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="glass border-red-500/30 p-8 max-w-md text-center animate-bounce-in">
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
          <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="font-display text-2xl font-bold text-red-500 mb-2">Collision!</h3>
        <p className="text-gray-400 mb-6">
          Both players chose the same cell! Neither move counts. Try again with a different cell.
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
  onBackToLobby 
}: { 
  winner: 'player1' | 'player2' | 'draw'
  isPlayer1: boolean
  onNewGame: () => void
  onBackToLobby: () => void
}) {
  const didWin = (winner === 'player1' && isPlayer1) || (winner === 'player2' && !isPlayer1)
  const isDraw = winner === 'draw'

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className={`glass p-8 max-w-md text-center animate-bounce-in ${
        isDraw ? 'border-gray-500/30' : didWin ? 'border-green-500/30' : 'border-red-500/30'
      }`}>
        <div className={`w-24 h-24 mx-auto mb-4 rounded-full flex items-center justify-center ${
          isDraw ? 'bg-gray-500/20' : didWin ? 'bg-green-500/20' : 'bg-red-500/20'
        }`}>
          {isDraw ? (
            <span className="text-4xl">🤝</span>
          ) : didWin ? (
            <span className="text-4xl">🏆</span>
          ) : (
            <span className="text-4xl">😔</span>
          )}
        </div>
        
        <h3 className={`font-display text-3xl font-bold mb-2 ${
          isDraw ? 'text-gray-400' : didWin ? 'text-green-500' : 'text-red-500'
        }`}>
          {isDraw ? "It's a Draw!" : didWin ? 'You Won!' : 'You Lost'}
        </h3>
        
        <p className="text-gray-400 mb-6">
          {isDraw 
            ? 'Both players completed a line simultaneously, or the board is full!'
            : didWin 
              ? 'Congratulations! You outplayed your opponent.'
              : 'Better luck next time! Keep practicing.'}
        </p>
        
        <div className="flex gap-3 justify-center">
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

