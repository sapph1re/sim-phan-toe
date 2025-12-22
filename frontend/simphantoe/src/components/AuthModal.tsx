import { useState, useEffect, useCallback } from "react";
import { usePrivy, useConnectWallet } from "@privy-io/react-auth";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { isPrivyConfigured } from "../lib/privy";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Privy hooks - only available when Privy is configured
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const privyHooks = isPrivyConfigured ? usePrivy() : null;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const privyConnectWallet = isPrivyConfigured ? useConnectWallet() : null;
  const { openConnectModal } = useConnectModal();

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setEmail("");
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Handle email sign-in with Privy
  const handleEmailSignIn = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!privyHooks) {
      setError("Privy is not configured");
      return;
    }

    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Privy's login will send a magic link to the email
      await privyHooks.login({ 
        loginMethods: ["email"],
        prefill: { type: "email", value: email }
      });
      onClose();
    } catch (err) {
      console.error("Email sign-in error:", err);
      setError(err instanceof Error ? err.message : "Failed to sign in");
    } finally {
      setIsSubmitting(false);
    }
  }, [email, privyHooks, onClose]);

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

        {/* Email sign-in form (Primary option) */}
        {isPrivyConfigured && (
          <form onSubmit={handleEmailSignIn} className="mb-6">
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 bg-cyber-darker border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyber-purple focus:ring-1 focus:ring-cyber-purple transition-colors"
                disabled={isSubmitting}
                autoFocus
              />
              {isSubmitting && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-5 h-5 border-2 border-cyber-purple border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            
            {error && (
              <p className="mt-2 text-sm text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !email}
              className="w-full mt-4 px-6 py-3 bg-gradient-to-r from-cyber-purple to-cyber-pink text-white font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {isSubmitting ? "Signing in..." : "Continue with Email"}
            </button>
            
            <p className="text-xs text-gray-500 mt-3 text-center">
              We'll send you a magic link to sign in instantly
            </p>
          </form>
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

