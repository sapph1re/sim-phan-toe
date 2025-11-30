import { Cell } from '../lib/contracts'

interface GameBoardProps {
  board: readonly (readonly number[])[]
  selectedCell: { x: number; y: number } | null
  onCellClick: (x: number, y: number) => void
  disabled?: boolean
  isPlayer1: boolean
  collisionCell?: { x: number; y: number } | null
  lastMoves?: { player1?: { x: number; y: number }; player2?: { x: number; y: number } }
}

export function GameBoard({ 
  board, 
  selectedCell, 
  onCellClick, 
  disabled = false,
  isPlayer1,
  collisionCell,
  lastMoves
}: GameBoardProps) {
  return (
    <div className="relative w-full max-w-md">
      {/* Glow effect behind the board */}
      <div className="absolute inset-0 blur-3xl opacity-20">
        <div className="w-full h-full bg-gradient-to-br from-cyber-purple via-cyber-pink to-cyber-cyan rounded-3xl" />
      </div>
      
      {/* The board */}
      <div className="relative glass p-6 rounded-3xl">
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].flatMap((x) =>
            [0, 1, 2].map((y) => {
              const cellValue = board[x][y]
              const isSelected = selectedCell?.x === x && selectedCell?.y === y
              const isEmpty = cellValue === Cell.Empty
              const isCollision = collisionCell?.x === x && collisionCell?.y === y
              const isLastMoveP1 = lastMoves?.player1?.x === x && lastMoves?.player1?.y === y
              const isLastMoveP2 = lastMoves?.player2?.x === x && lastMoves?.player2?.y === y
              const canClick = !disabled && isEmpty && !isSelected

              return (
                <button
                  key={`${x}-${y}`}
                  onClick={() => canClick && onCellClick(x, y)}
                  disabled={!canClick}
                  className={`
                    aspect-square min-w-[80px] min-h-[80px] rounded-xl 
                    flex items-center justify-center
                    text-5xl font-display font-bold
                    transition-all duration-300 ease-out
                    ${isEmpty && !isSelected ? 'bg-white/5 hover:bg-white/10' : ''}
                    ${isSelected ? 'bg-gradient-to-br from-cyber-purple/30 to-cyber-pink/30 border-2 border-cyber-purple animate-pulse-slow' : 'border border-white/10'}
                    ${cellValue === Cell.Player1 ? 'bg-cyber-purple/20 border-cyber-purple/50' : ''}
                    ${cellValue === Cell.Player2 ? 'bg-cyber-cyan/20 border-cyber-cyan/50' : ''}
                    ${isCollision ? 'animate-collision border-red-500/50 bg-red-500/10' : ''}
                    ${isLastMoveP1 && cellValue === Cell.Player1 ? 'animate-bounce-in' : ''}
                    ${isLastMoveP2 && cellValue === Cell.Player2 ? 'animate-bounce-in' : ''}
                    ${!canClick && isEmpty ? 'cursor-not-allowed' : 'cursor-pointer'}
                    ${canClick ? 'hover:scale-105 hover:border-cyber-purple/50' : ''}
                  `}
                >
                  {cellValue === Cell.Player1 && (
                    <span className="text-cyber-purple neon-text animate-fade-in">✕</span>
                  )}
                  {cellValue === Cell.Player2 && (
                    <span className="text-cyber-cyan neon-text animate-fade-in">○</span>
                  )}
                  {isSelected && isEmpty && (
                    <span className={`opacity-50 ${isPlayer1 ? 'text-cyber-purple' : 'text-cyber-cyan'}`}>
                      {isPlayer1 ? '✕' : '○'}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// Mini board for previews
export function MiniBoardPreview({ board }: { board: readonly (readonly number[])[] }) {
  return (
    <div className="grid grid-cols-3 gap-1 w-16 h-16">
      {[0, 1, 2].flatMap((x) =>
        [0, 1, 2].map((y) => {
          const cellValue = board[x][y]
          return (
            <div
              key={`${x}-${y}`}
              className={`
                aspect-square rounded-sm flex items-center justify-center text-xs font-bold
                ${cellValue === Cell.Empty ? 'bg-white/5' : ''}
                ${cellValue === Cell.Player1 ? 'bg-cyber-purple/30 text-cyber-purple' : ''}
                ${cellValue === Cell.Player2 ? 'bg-cyber-cyan/30 text-cyber-cyan' : ''}
              `}
            >
              {cellValue === Cell.Player1 && '✕'}
              {cellValue === Cell.Player2 && '○'}
            </div>
          )
        })
      )}
    </div>
  )
}

