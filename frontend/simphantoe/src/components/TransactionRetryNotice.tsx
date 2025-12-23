import { useTransactionRetryStatus } from "../hooks/useSponsoredTransaction";

/**
 * Small, unobtrusive notification that appears when a Privy transaction
 * is being retried due to rate limits or temporary issues.
 *
 * Positioned fixed at the bottom of the screen to avoid disrupting gameplay.
 */
export function TransactionRetryNotice() {
  const retryStatus = useTransactionRetryStatus();

  if (!retryStatus || !retryStatus.isRetrying) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
      <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-full backdrop-blur-sm">
        {/* Spinning indicator */}
        <div className="w-4 h-4 border-2 border-amber-500/40 border-t-amber-500 rounded-full animate-spin" />
        
        {/* Status text */}
        <span className="text-sm text-amber-400">
          {retryStatus.message}
        </span>
        
        {/* Attempt counter */}
        <span className="text-xs text-amber-500/60 font-mono">
          {retryStatus.attempt}/{retryStatus.maxRetries}
        </span>
      </div>
    </div>
  );
}

