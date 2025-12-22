import { useState, useCallback, useRef, useEffect } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AuthModal } from "./AuthModal";
import { isPrivyConfigured } from "../lib/privy";

// Format address for display (0x1234...5678)
function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function AuthButton() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Wagmi hooks for wallet state
  const { address, isConnected } = useAccount();
  const { disconnect: wagmiDisconnect } = useDisconnect();

  // Privy hooks - only use when configured
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const privyHooks = isPrivyConfigured ? usePrivy() : null;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const walletsHooks = isPrivyConfigured ? useWallets() : null;

  const isPrivyAuthenticated = privyHooks?.authenticated ?? false;
  const privyUser = privyHooks?.user;
  const privyLogout = privyHooks?.logout;
  const privyWallets = walletsHooks?.wallets ?? [];

  // Get the active wallet address (could be Privy embedded or external)
  const activeAddress = address;

  // Determine auth state
  const isAuthenticated = isPrivyAuthenticated || isConnected;

  // Get user display info
  const getUserEmail = useCallback(() => {
    if (!privyUser) return null;
    const emailAccount = privyUser.linkedAccounts?.find(
      (account) => account.type === "email"
    );
    return emailAccount?.type === "email" ? (emailAccount as { address: string }).address : null;
  }, [privyUser]);

  // Check if using embedded wallet
  const isUsingEmbeddedWallet = useCallback(() => {
    if (!privyWallets.length) return false;
    return privyWallets.some(
      (wallet) => wallet.walletClientType === "privy"
    );
  }, [privyWallets]);

  // Handle sign out
  const handleSignOut = useCallback(async () => {
    setIsDropdownOpen(false);
    
    // If authenticated with Privy, logout from Privy
    if (isPrivyAuthenticated && privyLogout) {
      await privyLogout();
    }
    
    // Also disconnect wagmi if connected
    if (isConnected) {
      wagmiDisconnect();
    }
  }, [isPrivyAuthenticated, privyLogout, isConnected, wagmiDisconnect]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // If Privy is not configured, just show RainbowKit's ConnectButton
  if (!isPrivyConfigured) {
    return <ConnectButton />;
  }

  // Not authenticated - show Sign In button
  if (!isAuthenticated) {
    return (
      <>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-5 py-2.5 bg-gradient-to-r from-cyber-purple to-cyber-pink text-white font-semibold rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
          Sign In
        </button>
        <AuthModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </>
    );
  }

  // Authenticated - show address and dropdown
  const userEmail = getUserEmail();
  const isEmbedded = isUsingEmbeddedWallet();

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="flex items-center gap-3 px-4 py-2 bg-cyber-darker border border-white/10 rounded-lg hover:border-white/20 transition-colors"
      >
        {/* Wallet indicator */}
        <div className="flex items-center gap-2">
          {isEmbedded ? (
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyber-purple to-cyber-pink flex items-center justify-center">
              <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
          ) : (
            <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center">
              <svg className="w-3 h-3 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 10H2" />
              </svg>
            </div>
          )}
          
          {/* Address */}
          <span className="text-white font-medium">
            {activeAddress ? formatAddress(activeAddress) : "Connected"}
          </span>
        </div>

        {/* Dropdown arrow */}
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isDropdownOpen && (
        <div className="absolute right-0 mt-2 w-64 py-2 bg-cyber-darker border border-white/10 rounded-lg shadow-xl z-50 animate-fade-in">
          {/* User info section */}
          <div className="px-4 py-3 border-b border-white/10">
            {userEmail && (
              <p className="text-sm text-gray-400 truncate mb-1">
                {userEmail}
              </p>
            )}
            <p className="text-xs text-gray-500 font-mono">
              {activeAddress}
            </p>
            {isEmbedded && (
              <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 bg-cyber-purple/20 text-cyber-purple text-xs rounded">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Embedded Wallet
              </span>
            )}
          </div>

          {/* Copy address */}
          <button
            onClick={() => {
              if (activeAddress) {
                navigator.clipboard.writeText(activeAddress);
              }
            }}
            className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-white/5 flex items-center gap-3 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy Address
          </button>

          {/* Disconnect */}
          <button
            onClick={handleSignOut}
            className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-3 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

