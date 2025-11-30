import { useAccount } from 'wagmi'
import { 
  useOpenGames, 
  usePlayerGames, 
  useStartGame, 
  useJoinGame,
  useGame
} from '../hooks/useSimTacToe'
import { Winner } from '../lib/contracts'

interface GameLobbyProps {
  onSelectGame: (gameId: bigint) => void
}

export function GameLobby({ onSelectGame }: GameLobbyProps) {
  const { address } = useAccount()
  const { data: openGames, isLoading: openLoading } = useOpenGames()
  const { data: playerGames, isLoading: playerLoading } = usePlayerGames(address)
  const { startGame, isPending: startPending } = useStartGame()
  const { joinGame, isPending: joinPending } = useJoinGame()

  const handleStartGame = async () => {
    try {
      await startGame()
    } catch (error) {
      console.error('Failed to start game:', error)
    }
  }

  const handleJoinGame = async (gameId: bigint) => {
    try {
      await joinGame(gameId)
      onSelectGame(gameId)
    } catch (error) {
      console.error('Failed to join game:', error)
    }
  }

  // Filter out games created by current player from open games
  const joinableGames = openGames?.filter(id => {
    // We'll need to check if this is not the current player's game
    return !playerGames?.includes(id)
  }) ?? []

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="text-center">
        <h2 className="font-display text-3xl font-bold mb-2">Game Lobby</h2>
        <p className="text-gray-500">Start a new game or join an existing one</p>
      </div>

      {/* Quick Actions */}
      <div className="flex justify-center">
        <button
          onClick={handleStartGame}
          disabled={startPending}
          className="btn-primary text-lg px-8 py-4 flex items-center gap-3"
        >
          {startPending ? (
            <>
              <LoadingSpinner />
              Creating Game...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Start New Game
            </>
          )}
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Your Games */}
        <div className="card">
          <h3 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-cyber-purple"></span>
            Your Games
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
                  onSelect={() => onSelectGame(gameId)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p>No active games</p>
              <p className="text-sm">Start a new game above!</p>
            </div>
          )}
        </div>

        {/* Open Games */}
        <div className="card">
          <h3 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-cyber-cyan"></span>
            Open Games
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
                  onJoin={() => handleJoinGame(gameId)}
                  isJoining={joinPending}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p>No open games</p>
              <p className="text-sm">Be the first to start one!</p>
            </div>
          )}
        </div>
      </div>

      {/* How to Play */}
      <div className="card mt-8">
        <h3 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-cyber-pink"></span>
          How to Play
        </h3>
        <div className="grid md:grid-cols-3 gap-6 text-sm">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-lg bg-cyber-purple/20 flex items-center justify-center text-cyber-purple font-display font-bold">
              1
            </div>
            <h4 className="font-semibold">Simultaneous Moves</h4>
            <p className="text-gray-500">
              Both players select their cell at the same time. Your opponent can't see your choice!
            </p>
          </div>
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-lg bg-cyber-pink/20 flex items-center justify-center text-cyber-pink font-display font-bold">
              2
            </div>
            <h4 className="font-semibold">Collision = No Move</h4>
            <p className="text-gray-500">
              If both players pick the same cell, neither move counts. Pick again!
            </p>
          </div>
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-lg bg-cyber-cyan/20 flex items-center justify-center text-cyber-cyan font-display font-bold">
              3
            </div>
            <h4 className="font-semibold">Win Conditions</h4>
            <p className="text-gray-500">
              Get three in a row, column, or diagonal. If both complete a line simultaneously, it's a draw!
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function PlayerGameCard({ gameId, onSelect }: { gameId: bigint; onSelect: () => void }) {
  const { address } = useAccount()
  const { data: game } = useGame(gameId)

  if (!game) return null

  const isWaiting = game.playerTwo === '0x0000000000000000000000000000000000000000'
  const isFinished = game.winner !== Winner.None
  const isPlayer1 = address === game.playerOne

  let status = ''
  let statusColor = ''

  if (isWaiting) {
    status = 'Waiting for opponent...'
    statusColor = 'text-yellow-500'
  } else if (isFinished) {
    if (game.winner === Winner.Draw) {
      status = 'Draw'
      statusColor = 'text-gray-400'
    } else if ((game.winner === Winner.Player1 && isPlayer1) || 
               (game.winner === Winner.Player2 && !isPlayer1)) {
      status = 'You Won!'
      statusColor = 'text-green-500'
    } else {
      status = 'You Lost'
      statusColor = 'text-red-500'
    }
  } else {
    status = 'In Progress'
    statusColor = 'text-cyber-cyan'
  }

  return (
    <button
      onClick={onSelect}
      className="w-full glass-darker p-4 flex items-center justify-between hover:border-cyber-purple/30 transition-all group"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyber-purple/20 to-cyber-pink/20 flex items-center justify-center font-display font-bold text-cyber-purple">
          #{gameId.toString()}
        </div>
        <div className="text-left">
          <p className="font-semibold">Game #{gameId.toString()}</p>
          <p className={`text-sm ${statusColor}`}>{status}</p>
        </div>
      </div>
      <svg className="w-5 h-5 text-gray-500 group-hover:text-cyber-purple transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  )
}

function OpenGameCard({ gameId, onJoin, isJoining }: { gameId: bigint; onJoin: () => void; isJoining: boolean }) {
  const { data: game } = useGame(gameId)

  if (!game) return null

  const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

  return (
    <div className="glass-darker p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyber-cyan/20 to-cyber-blue/20 flex items-center justify-center font-display font-bold text-cyber-cyan">
          #{gameId.toString()}
        </div>
        <div>
          <p className="font-semibold">Game #{gameId.toString()}</p>
          <p className="text-sm text-gray-500">
            Created by {shortenAddress(game.playerOne)}
          </p>
        </div>
      </div>
      <button
        onClick={onJoin}
        disabled={isJoining}
        className="btn-secondary text-sm px-4 py-2"
      >
        {isJoining ? <LoadingSpinner /> : 'Join Game'}
      </button>
    </div>
  )
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  )
}

