import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { useState } from 'react'
import { GameLobby } from './GameLobby'
import { GameView } from './GameView'
import { useContractAddress } from '../hooks/useSimTacToe'

export function Layout() {
  const { isConnected } = useAccount()
  const { isConfigured } = useContractAddress()
  const [activeGameId, setActiveGameId] = useState<bigint | null>(null)

  return (
    <div className="min-h-screen grid-overlay">
      {/* Header */}
      <header className="border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyber-purple to-cyber-pink flex items-center justify-center">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
                <line x1="15" y1="3" x2="15" y2="21" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="3" y1="15" x2="21" y2="15" />
              </svg>
            </div>
            <div>
              <h1 className="font-display font-bold text-xl tracking-wider">
                <span className="text-cyber-purple">SIM</span>
                <span className="text-cyber-pink">TAC</span>
                <span className="text-cyber-cyan">TOE</span>
              </h1>
              <p className="text-xs text-gray-500 tracking-widest">SIMULTANEOUS TIC-TAC-TOE</p>
            </div>
          </div>
          <ConnectButton />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {!isConnected ? (
          <WelcomeScreen />
        ) : !isConfigured ? (
          <ContractNotConfigured />
        ) : activeGameId !== null ? (
          <GameView 
            gameId={activeGameId} 
            onBack={() => setActiveGameId(null)} 
          />
        ) : (
          <GameLobby onSelectGame={(id) => setActiveGameId(id)} />
        )}
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 border-t border-white/5 bg-cyber-darker/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between text-xs text-gray-500">
          <span>Built with FHEVM</span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Localhost Network
          </span>
        </div>
      </footer>
    </div>
  )
}

function WelcomeScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="glass p-12 max-w-xl animate-fade-in">
        <div className="w-24 h-24 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-cyber-purple to-cyber-pink p-[2px]">
          <div className="w-full h-full rounded-2xl bg-cyber-darker flex items-center justify-center">
            <svg className="w-12 h-12 text-cyber-purple" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <line x1="15" y1="3" x2="15" y2="21" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
            </svg>
          </div>
        </div>
        
        <h2 className="font-display text-3xl font-bold mb-4">
          Welcome to <span className="text-cyber-purple">SimTacToe</span>
        </h2>
        
        <p className="text-gray-400 mb-8 leading-relaxed">
          A twist on the classic game where both players make their moves 
          <span className="text-cyber-cyan font-semibold"> simultaneously</span>. 
          No more first-mover advantage — pure strategy and prediction.
        </p>

        <div className="space-y-4 text-sm text-gray-500 mb-8">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-cyber-purple/20 flex items-center justify-center text-cyber-purple">1</span>
            <span>Connect your wallet to get started</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-cyber-pink/20 flex items-center justify-center text-cyber-pink">2</span>
            <span>Create a game or join an existing one</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-cyber-cyan/20 flex items-center justify-center text-cyber-cyan">3</span>
            <span>Both players pick a cell, then reveal!</span>
          </div>
        </div>

        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    </div>
  )
}

function ContractNotConfigured() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="glass p-12 max-w-xl animate-fade-in border-yellow-500/30">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-yellow-500/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        
        <h2 className="font-display text-2xl font-bold mb-4 text-yellow-500">
          Contract Not Configured
        </h2>
        
        <p className="text-gray-400 mb-6">
          The SimTacToe contract address has not been set. Please deploy the contract and configure the address.
        </p>

        <div className="glass-darker p-4 text-left text-sm font-mono">
          <p className="text-gray-500 mb-2"># Deploy the contract:</p>
          <p className="text-cyber-cyan">npx hardhat deploy --network localhost</p>
          <p className="text-gray-500 mt-4 mb-2"># Then create .env file:</p>
          <p className="text-cyber-cyan">VITE_SIMTACTOE_ADDRESS=0x...</p>
        </div>
      </div>
    </div>
  )
}

