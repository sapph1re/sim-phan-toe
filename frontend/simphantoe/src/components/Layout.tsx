import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId } from "wagmi";
import { useState } from "react";
import { GameLobby } from "./GameLobby";
import { GameView } from "./GameView";
import { useContractAddress } from "../hooks/useSimPhanToe";
import { useFHE } from "../lib/fhe";

// Network names for display
const NETWORK_NAMES: Record<number, string> = {
  1: "Ethereum",
  11155111: "Sepolia",
};

export function Layout() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { isConfigured } = useContractAddress();
  const { isLoading: fheLoading, error: fheError, isSupported: fheSupported } = useFHE();
  const [activeGameId, setActiveGameId] = useState<bigint | null>(null);

  const networkName = NETWORK_NAMES[chainId] || `Chain ${chainId}`;
  const isOnSepolia = chainId === 11155111;

  return (
    <div className="min-h-screen grid-overlay flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyber-purple to-cyber-pink flex items-center justify-center relative">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
                <line x1="15" y1="3" x2="15" y2="21" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="3" y1="15" x2="21" y2="15" />
              </svg>
              {/* Ghost overlay */}
              <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/20 to-transparent opacity-50" />
            </div>
            <div>
              <h1 className="font-display font-bold text-xl tracking-wider">
                <span className="text-cyber-purple">SIM</span>
                <span className="text-gray-400">PHAN</span>
                <span className="text-cyber-cyan">TOE</span>
              </h1>
              <p className="text-xs text-gray-500 tracking-widest">PHANTOM TIC-TAC-TOE</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* FHE Status Badge */}
            {isConnected && (
              <div className={`fhe-indicator ${!fheSupported ? "opacity-50" : ""}`}>
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                {!fheSupported
                  ? "FHE Unavailable"
                  : fheLoading
                    ? "FHE Loading..."
                    : fheError
                      ? "FHE Error"
                      : "FHE Ready"}
              </div>
            )}
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Network Warning Banner */}
      {isConnected && !isOnSepolia && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-3">
          <div className="max-w-6xl mx-auto flex items-center gap-3 text-amber-400 text-sm">
            <svg
              className="w-5 h-5 flex-shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>
              <strong>FHE features require Sepolia testnet.</strong> You're on {networkName}. Switch to Sepolia in your
              wallet to enable encrypted moves.
            </span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto px-6 py-8 w-full">
        {!isConnected ? (
          <WelcomeScreen />
        ) : !isConfigured ? (
          <ContractNotConfigured />
        ) : activeGameId !== null ? (
          <GameView gameId={activeGameId} onBack={() => setActiveGameId(null)} />
        ) : (
          <GameLobby onSelectGame={(id) => setActiveGameId(id)} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-cyber-darker/80 backdrop-blur-sm mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between text-xs text-gray-500">
          <span className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-cyber-purple"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Built with FHEVM - Fully Homomorphic Encryption
          </span>
          <span className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full animate-pulse ${isOnSepolia ? "bg-green-500" : "bg-amber-500"}`}
            ></span>
            {networkName} {!isOnSepolia && "(FHE Disabled)"}
          </span>
        </div>
      </footer>
    </div>
  );
}

function WelcomeScreen() {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <div className="glass p-8 md:p-12 max-w-xl animate-fade-in">
        <div className="w-24 h-24 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-cyber-purple to-cyber-pink p-[2px] relative">
          <div className="w-full h-full rounded-2xl bg-cyber-darker flex items-center justify-center">
            <svg
              className="w-12 h-12 text-cyber-purple"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <line x1="15" y1="3" x2="15" y2="21" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
            </svg>
          </div>
          {/* Ghost effect */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-cyber-cyan/20 to-transparent animate-ghost-float" />
        </div>

        <h2 className="font-display text-3xl font-bold mb-4">
          Welcome to <span className="text-cyber-purple">SimPhanToe</span>
        </h2>

        <p className="text-gray-400 mb-8 leading-relaxed">
          A <span className="text-cyber-cyan font-semibold">phantom</span> twist on tic-tac-toe where your opponent's
          moves are <span className="text-cyber-purple font-semibold">encrypted</span> and hidden. Both players move
          simultaneously — predict, strategize, and outmaneuver in the fog of war!
        </p>

        <div className="space-y-4 text-sm text-gray-500 mb-8">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-cyber-purple/20 flex items-center justify-center text-cyber-purple">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <span>Your moves are encrypted with FHE</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-cyber-pink/20 flex items-center justify-center text-cyber-pink">
              ?
            </span>
            <span>Opponent moves stay hidden until game end</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-cyber-cyan/20 flex items-center justify-center text-cyber-cyan">
              ⚡
            </span>
            <span>Simultaneous moves — no waiting!</span>
          </div>
        </div>

        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    </div>
  );
}

function ContractNotConfigured() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="glass p-12 max-w-xl animate-fade-in border-yellow-500/30">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-yellow-500/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h2 className="font-display text-2xl font-bold mb-4 text-yellow-500">Contract Not Configured</h2>

        <p className="text-gray-400 mb-6">
          The SimPhanToe contract address has not been set. Please deploy the contract and configure the address.
        </p>

        <div className="glass-darker p-4 text-left text-sm font-mono">
          <p className="text-gray-500 mb-2"># Deploy the contract to Sepolia:</p>
          <p className="text-cyber-cyan">npx hardhat deploy --network sepolia</p>
          <p className="text-gray-500 mt-4 mb-2"># Then set in .env file:</p>
          <p className="text-cyber-cyan">VITE_SIMPHANTOE_ADDRESS=0x...</p>
        </div>
      </div>
    </div>
  );
}
