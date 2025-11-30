import { useAccount } from 'wagmi'
import { 
  useOpenGames, 
  usePlayerGames, 
  useStartGame, 
  useJoinGame,
  useGame
} from '../hooks/useSimPhanToe'

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
    return !playerGames?.includes(id)
  }) ?? []

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="text-center">
        <h2 className="font-display text-3xl font-bold mb-2">
          <span className="text-cyber-purple">Phantom</span> Lobby
        </h2>
        <p className="text-gray-500">Start a new encrypted game or join an existing one</p>
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
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                <line x1="12" y1="15" x2="12" y2="17" />
              </svg>
              Start Encrypted Game
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
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
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
              Your move is encrypted with FHE before submission. 
              Not even the blockchain can see where you played!
            </p>
          </div>
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-lg bg-cyber-pink/20 flex items-center justify-center text-cyber-pink font-display font-bold">
              👻
            </div>
            <h4 className="font-semibold">Phantom Board</h4>
            <p className="text-gray-500">
              You only see your own moves. Opponent's positions 
              remain hidden throughout the entire game!
            </p>
          </div>
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-lg bg-cyber-cyan/20 flex items-center justify-center text-cyber-cyan font-display font-bold">
              ⚡
            </div>
            <h4 className="font-semibold">Simultaneous Play</h4>
            <p className="text-gray-500">
              Both players submit at the same time. Collisions 
              cancel both moves — pure strategy!
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function PlayerGameCard({ gameId, onSelect }: { gameId: bigint; onSelect: () => void }) {
  const { data: game } = useGame(gameId)

  if (!game) return null

  const isWaiting = game.player2 === '0x0000000000000000000000000000000000000000'
  const isFinished = game.isFinished

  let status = ''
  let statusColor = ''

  if (isWaiting) {
    status = 'Waiting for opponent...'
    statusColor = 'text-yellow-500'
  } else if (isFinished) {
    status = 'Game Finished'
    statusColor = 'text-gray-400'
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
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyber-purple/20 to-cyber-pink/20 flex items-center justify-center font-display font-bold text-cyber-purple relative">
          #{gameId.toString()}
          <div className="absolute -top-1 -right-1">
            <svg className="w-4 h-4 text-cyber-purple/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
        </div>
        <div className="text-left">
          <p className="font-semibold">Phantom Game #{gameId.toString()}</p>
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
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyber-cyan/20 to-cyber-blue/20 flex items-center justify-center font-display font-bold text-cyber-cyan relative">
          #{gameId.toString()}
          <div className="absolute -top-1 -right-1">
            <svg className="w-4 h-4 text-cyber-cyan/50 lock-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
        </div>
        <div>
          <p className="font-semibold">Phantom Game #{gameId.toString()}</p>
          <p className="text-sm text-gray-500">
            Created by {shortenAddress(game.player1)}
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

