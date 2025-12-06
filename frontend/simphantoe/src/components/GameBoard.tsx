import { LocalMove, Cell } from '../lib/contracts'

interface GameBoardProps {
  // Player's own moves (known locally)
  myLocalMoves: LocalMove[]
  // Current round selection (not yet submitted)
  currentRoundMove: { x: number; y: number } | null
  // Cell selection handler
  onCellClick: (x: number, y: number) => void
  // Board disabled state
  disabled?: boolean
  // Is current player Player 1 (X) or Player 2 (O)
  isPlayer1: boolean
  // Collision cell (briefly shown when collision occurs)
  collisionCell?: { x: number; y: number } | null
  // Whether we're in a loading state
  isLoading?: boolean
  // Revealed board (after game ends)
  revealedBoard?: readonly (readonly number[])[] | null
  // Whether the board has been revealed
  isRevealed?: boolean
}

export function GameBoard({ 
  myLocalMoves,
  currentRoundMove,
  onCellClick, 
  disabled = false,
  isPlayer1,
  collisionCell,
  isLoading = false,
  revealedBoard,
  isRevealed = false
}: GameBoardProps) {
  // Build a set of cells the player has claimed
  const myCells = new Set(myLocalMoves.map(m => `${m.x}-${m.y}`))
  
  // Check if a cell is mine
  const isMyCellAt = (x: number, y: number) => myCells.has(`${x}-${y}`)
  
  // Check if this is the current selection
  const isSelected = (x: number, y: number) => 
    currentRoundMove?.x === x && currentRoundMove?.y === y
  
  // Check if this cell had a collision
  const isCollision = (x: number, y: number) => 
    collisionCell?.x === x && collisionCell?.y === y

  // Get revealed cell value
  const getRevealedCell = (x: number, y: number): Cell | null => {
    if (!isRevealed || !revealedBoard) return null
    return revealedBoard[y]?.[x] as Cell ?? null
  }

  // Can click on a cell?
  const canClickCell = (x: number, y: number) => {
    if (disabled || isLoading || isRevealed) return false
    if (isMyCellAt(x, y)) return false // Already claimed by me
    if (isSelected(x, y)) return false // Already selected
    return true
  }

  return (
    <div className="relative w-full max-w-md">
      {/* Glow effect behind the board */}
      <div className="absolute inset-0 blur-3xl opacity-20">
        <div className="w-full h-full bg-gradient-to-br from-cyber-purple via-cyber-pink to-cyber-cyan rounded-3xl" />
      </div>
      
      {/* The board */}
      <div className="relative glass p-6 rounded-3xl">
        {/* FHE indicator */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 fhe-indicator">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          {isRevealed ? 'Revealed Board' : 'Phantom Board'}
        </div>

        <div className="grid grid-cols-4 gap-2 mt-2">
          {[0, 1, 2, 3].flatMap((y) =>
            [0, 1, 2, 3].map((x) => {
              const isMyCell = isMyCellAt(x, y)
              const isCurrentSelection = isSelected(x, y)
              const isCollisionCell = isCollision(x, y)
              const canClick = canClickCell(x, y)
              const revealedCell = getRevealedCell(x, y)

              return (
                <button
                  key={`${x}-${y}`}
                  onClick={() => canClick && onCellClick(x, y)}
                  disabled={!canClick}
                  className={`
                    aspect-square min-w-[60px] min-h-[60px] rounded-xl 
                    flex items-center justify-center
                    text-4xl font-display font-bold
                    transition-all duration-300 ease-out
                    ${isRevealed && revealedCell !== null && revealedCell !== Cell.Empty
                      ? revealedCell === Cell.Player1
                        ? 'bg-cyber-purple/20 border-2 border-cyber-purple/50'
                        : 'bg-cyber-cyan/20 border-2 border-cyber-cyan/50'
                      : isMyCell 
                        ? isPlayer1 
                          ? 'bg-cyber-purple/20 border-2 border-cyber-purple/50' 
                          : 'bg-cyber-cyan/20 border-2 border-cyber-cyan/50'
                        : isCurrentSelection
                          ? 'bg-gradient-to-br from-cyber-purple/30 to-cyber-pink/30 border-2 border-cyber-purple animate-pulse-slow'
                          : 'phantom-cell'
                    }
                    ${isCollisionCell ? 'animate-collision border-yellow-500/50 bg-yellow-500/10' : ''}
                    ${!canClick ? 'cursor-not-allowed' : 'cursor-pointer'}
                    ${canClick ? 'hover:scale-105 hover:border-cyber-purple/50 hover:bg-white/10' : ''}
                  `}
                >
                  {/* Revealed cell */}
                  {isRevealed && revealedCell !== null && revealedCell !== Cell.Empty && (
                    <span className={`${revealedCell === Cell.Player1 ? 'text-cyber-purple' : 'text-cyber-cyan'} neon-text animate-fade-in`}>
                      {revealedCell === Cell.Player1 ? '✕' : '○'}
                    </span>
                  )}
                  
                  {/* My confirmed move (during game) */}
                  {!isRevealed && isMyCell && (
                    <span className={`${isPlayer1 ? 'text-cyber-purple' : 'text-cyber-cyan'} neon-text animate-fade-in`}>
                      {isPlayer1 ? '✕' : '○'}
                    </span>
                  )}
                  
                  {/* Current selection (preview) */}
                  {!isRevealed && isCurrentSelection && !isMyCell && (
                    <span className={`opacity-50 ${isPlayer1 ? 'text-cyber-purple' : 'text-cyber-cyan'}`}>
                      {isPlayer1 ? '✕' : '○'}
                    </span>
                  )}
                  
                  {/* Phantom/hidden cell - show lock icon (only when not revealed) */}
                  {!isRevealed && !isMyCell && !isCurrentSelection && (
                    <div className="flex items-center justify-center text-gray-600 lock-pulse">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="5" y="11" width="14" height="10" rx="2" ry="2" />
                        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      </svg>
                    </div>
                  )}
                  
                  {/* Empty revealed cell */}
                  {isRevealed && (revealedCell === null || revealedCell === Cell.Empty) && (
                    <div className="w-full h-full" />
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-cyber-darker/80 backdrop-blur-sm rounded-3xl flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 text-cyber-purple animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm text-gray-400">Processing...</span>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex justify-center gap-4 text-xs text-gray-500 flex-wrap">
        <div className="flex items-center gap-2">
          <div className={`w-4 h-4 rounded ${isPlayer1 ? 'bg-cyber-purple/30 border border-cyber-purple/50' : 'bg-cyber-cyan/30 border border-cyber-cyan/50'}`} />
          <span>{isRevealed ? 'Player 1' : 'Your moves'}</span>
        </div>
        {isRevealed ? (
          <div className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded ${!isPlayer1 ? 'bg-cyber-purple/30 border border-cyber-purple/50' : 'bg-cyber-cyan/30 border border-cyber-cyan/50'}`} />
            <span>Player 2</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded phantom-cell flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="5" y="11" width="14" height="10" rx="2" ry="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            </div>
            <span>Hidden cells</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Mini board for previews (shows only player's known moves or revealed board)
export function MiniBoardPreview({ 
  myLocalMoves, 
  isPlayer1,
  revealedBoard,
  isRevealed = false
}: { 
  myLocalMoves: LocalMove[]
  isPlayer1: boolean
  revealedBoard?: readonly (readonly number[])[] | null
  isRevealed?: boolean
}) {
  const myCells = new Set(myLocalMoves.map(m => `${m.x}-${m.y}`))
  
  return (
    <div className="grid grid-cols-4 gap-0.5 w-16 h-16">
      {[0, 1, 2, 3].flatMap((y) =>
        [0, 1, 2, 3].map((x) => {
          const isMyCell = myCells.has(`${x}-${y}`)
          const revealedCell = isRevealed && revealedBoard ? (revealedBoard[y]?.[x] as Cell ?? Cell.Empty) : Cell.Empty
          const showRevealed = isRevealed && revealedCell !== Cell.Empty
          
          return (
            <div
              key={`${x}-${y}`}
              className={`
                aspect-square rounded-sm flex items-center justify-center text-[8px] font-bold
                ${showRevealed
                  ? revealedCell === Cell.Player1 
                    ? 'bg-cyber-purple/30 text-cyber-purple' 
                    : 'bg-cyber-cyan/30 text-cyber-cyan'
                  : isMyCell 
                    ? isPlayer1 
                      ? 'bg-cyber-purple/30 text-cyber-purple' 
                      : 'bg-cyber-cyan/30 text-cyber-cyan'
                    : 'bg-gray-800/50 text-gray-600'
                }
              `}
            >
              {showRevealed ? (
                revealedCell === Cell.Player1 ? '✕' : '○'
              ) : isMyCell ? (
                isPlayer1 ? '✕' : '○'
              ) : (
                <svg className="w-1.5 h-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="11" width="14" height="10" rx="2" ry="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
