import { useEffect, useCallback } from "react";
import { usePrivy, useConnectWallet } from "@privy-io/react-auth";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { isPrivyConfigured } from "../lib/privy";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  // Privy hooks - only available when Privy is configured
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const privyHooks = isPrivyConfigured ? usePrivy() : null;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const privyConnectWallet = isPrivyConfigured ? useConnectWallet() : null;
  const { openConnectModal } = useConnectModal();

  // Handle email sign-in with Privy
  // Note: Privy's login() always shows their own modal for security reasons
  // We close our modal and let Privy handle the email entry
  const handleEmailSignIn = useCallback(() => {
    if (!privyHooks) {
      console.error("Privy is not configured");
      return;
    }

    // Check if Privy is ready before attempting login
    if (!privyHooks.ready) {
      console.warn("Privy is not ready yet, waiting...");
      // Wait a bit and try again
      setTimeout(() => {
        if (privyHooks.ready) {
          onClose();
          setTimeout(() => {
            privyHooks.login({ loginMethods: ["email"] });
          }, 100);
        } else {
          console.error("Privy failed to initialize. Check browser console for iframe errors.");
        }
      }, 500);
      return;
    }

    // Close our modal first
    onClose();
    
    // Small delay to ensure our modal closes before Privy's opens
    setTimeout(() => {
      try {
        // Privy's login() will show their own modal for email entry
        privyHooks.login({ loginMethods: ["email"] });
      } catch (error) {
        console.error("Failed to open Privy login modal:", error);
      }
    }, 100);
  }, [privyHooks, onClose]);

  // Handle external wallet connection
  // Uses Privy's wallet connection when configured, otherwise RainbowKit
  const handleConnectWallet = useCallback(() => {
    onClose();
    
    if (isPrivyConfigured && privyConnectWallet) {
      // Use Privy's connectWallet which properly integrates with their wagmi provider
      privyConnectWallet.connectWallet();
    } else {
      // Fallback to RainbowKit when Privy is not configured
      setTimeout(() => {
        openConnectModal?.();
      }, 100);
    }
  }, [onClose, privyConnectWallet, openConnectModal]);

  // Handle backdrop click to close
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div className="glass w-full max-w-md mx-4 p-6 md:p-8 relative animate-slide-up">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-cyber-purple to-cyber-pink p-[2px]">
            <div className="w-full h-full rounded-xl bg-cyber-darker flex items-center justify-center">
              <svg className="w-8 h-8 text-cyber-purple" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
            </div>
          </div>
          <h2 className="font-display text-2xl font-bold text-white">Sign In</h2>
          <p className="text-gray-400 text-sm mt-2">
            Sign in to start playing phantom tic-tac-toe
          </p>
        </div>

        {/* Email sign-in button (Primary option) */}
        {isPrivyConfigured && (
          <div className="mb-6">
            <button
              onClick={handleEmailSignIn}
              className="w-full px-6 py-3 bg-gradient-to-r from-cyber-purple to-cyber-pink text-white font-semibold rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              Continue with Email
            </button>
            
            <p className="text-xs text-gray-500 mt-3 text-center">
              We'll send you a magic link to sign in instantly
            </p>
          </div>
        )}

        {/* Divider */}
        {isPrivyConfigured && (
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-cyber-dark text-gray-500">or</span>
            </div>
          </div>
        )}

        {/* External wallet option (Secondary) */}
        <button
          onClick={handleConnectWallet}
          className="w-full px-6 py-3 bg-transparent border border-white/20 text-gray-300 font-medium rounded-lg hover:bg-white/5 hover:border-white/30 hover:text-white transition-all flex items-center justify-center gap-3"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M22 10H2" />
          </svg>
          Connect External Wallet
        </button>

        <p className="text-xs text-gray-500 mt-3 text-center">
          Use MetaMask, Rabby, or other browser wallets
        </p>
      </div>
    </div>
  );
}

