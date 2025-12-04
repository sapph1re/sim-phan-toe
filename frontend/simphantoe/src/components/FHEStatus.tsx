interface FHEStatusProps {
  status: {
    type: string;
    message: string;
    errorDetails?: string;
    statusCode?: number;
    relayerMessage?: string;
  } | null;
  isEncrypting?: boolean;
  isDecrypting?: boolean;
  isSubmitting?: boolean;
  onRetry?: () => void;
  canRetry?: boolean;
}

export function FHEStatus({
  status,
  isEncrypting,
  isDecrypting,
  isSubmitting,
  onRetry,
  canRetry = false,
}: FHEStatusProps) {
  if (!status && !isEncrypting && !isDecrypting && !isSubmitting) return null;

  const getStatusConfig = () => {
    if (isEncrypting) {
      return {
        icon: "encrypt",
        color: "cyber-purple",
        bgColor: "from-cyber-purple/20 to-cyber-pink/20",
        message: "Encrypting your move...",
        step: "1/4",
        stepLabel: "Encryption",
      };
    }
    if (isSubmitting) {
      return {
        icon: "submit",
        color: "cyber-pink",
        bgColor: "from-cyber-pink/20 to-cyber-purple/20",
        message: "Submitting to blockchain...",
        step: "2/4",
        stepLabel: "Submission",
      };
    }
    if (isDecrypting) {
      return {
        icon: "decrypt",
        color: "cyber-cyan",
        bgColor: "from-cyber-cyan/20 to-cyber-blue/20",
        message: "Decrypting result...",
        step: "3/4",
        stepLabel: "Validation",
      };
    }
    if (status) {
      switch (status.type) {
        case "encrypt":
          return {
            icon: "encrypt",
            color: "cyber-purple",
            bgColor: "from-cyber-purple/20 to-cyber-pink/20",
            message: status.message,
            step: "1/4",
            stepLabel: "Encryption",
          };
        case "submit":
          return {
            icon: "submit",
            color: "cyber-pink",
            bgColor: "from-cyber-pink/20 to-cyber-purple/20",
            message: status.message,
            step: "2/4",
            stepLabel: "Submission",
          };
        case "decrypt":
          return {
            icon: "decrypt",
            color: "cyber-cyan",
            bgColor: "from-cyber-cyan/20 to-cyber-blue/20",
            message: status.message,
            step: "3/4",
            stepLabel: "Validation",
          };
        case "success":
          return {
            icon: "check",
            color: "green-500",
            bgColor: "from-green-500/20 to-green-600/20",
            message: status.message,
            step: "4/4",
            stepLabel: "Complete",
          };
        case "error":
          return {
            icon: "error",
            color: "red-500",
            bgColor: "from-red-500/20 to-red-600/20",
            message: status.message,
            errorDetails: status.errorDetails,
          };
        case "relayer_error":
          return {
            icon: "relayer",
            color: "orange-500",
            bgColor: "from-orange-500/20 to-red-500/20",
            message: status.message,
            errorDetails: status.errorDetails,
            statusCode: status.statusCode,
            relayerMessage: status.relayerMessage,
            isRelayerError: true,
          };
        case "collision":
          return {
            icon: "collision",
            color: "yellow-500",
            bgColor: "from-yellow-500/20 to-orange-500/20",
            message: status.message,
          };
        default:
          return {
            icon: "info",
            color: "gray-400",
            bgColor: "from-gray-500/20 to-gray-600/20",
            message: status.message,
          };
      }
    }
    return null;
  };

  const config = getStatusConfig();
  if (!config) return null;

  const isLoading = isEncrypting || isDecrypting || isSubmitting;
  const isError = status?.type === "error";
  const isRelayerError = status?.type === "relayer_error";

  return (
    <div className={`glass p-4 bg-gradient-to-r ${config.bgColor} border-l-4 border-l-${config.color}`}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`w-10 h-10 rounded-lg bg-${config.color}/20 flex items-center justify-center flex-shrink-0`}>
          {isLoading ? (
            <svg className={`w-5 h-5 text-${config.color} animate-spin`} viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : config.icon === "encrypt" ? (
            <svg
              className={`w-5 h-5 text-${config.color}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ) : config.icon === "decrypt" ? (
            <svg
              className={`w-5 h-5 text-${config.color}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
          ) : config.icon === "submit" ? (
            <svg
              className={`w-5 h-5 text-${config.color}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          ) : config.icon === "check" ? (
            <svg
              className={`w-5 h-5 text-${config.color}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : config.icon === "error" ? (
            <svg
              className={`w-5 h-5 text-${config.color}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          ) : config.icon === "collision" ? (
            <svg
              className={`w-5 h-5 text-${config.color}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
            </svg>
          ) : config.icon === "relayer" ? (
            <svg
              className={`w-5 h-5 text-${config.color}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          ) : (
            <svg
              className={`w-5 h-5 text-${config.color}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Step indicator */}
          {"step" in config && config.step && (
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-mono text-${config.color}`}>{config.step}</span>
              <span className="text-xs text-gray-500">{config.stepLabel}</span>
            </div>
          )}

          {/* Main message */}
          <p className={`font-semibold text-${config.color}`}>{config.message}</p>

          {/* Loading description */}
          {isLoading && (
            <p className="text-xs text-gray-500 mt-1">
              {isEncrypting && "Using FHE to encrypt your move coordinates..."}
              {isDecrypting && "Verifying encrypted data with the Zama relayer..."}
              {isSubmitting && "Broadcasting transaction to Sepolia..."}
            </p>
          )}

          {/* Relayer error details - displayed prominently */}
          {isRelayerError && (
            <div className="mt-2 space-y-2">
              {/* Status code badge */}
              {"statusCode" in config && config.statusCode && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-orange-500/20 border border-orange-500/40 text-orange-400 text-xs font-mono">
                    HTTP {config.statusCode}
                  </span>
                  <span className="text-xs text-gray-500">Zama Relayer Error</span>
                </div>
              )}
              {/* Relayer message - displayed in a scrollable box */}
              {"relayerMessage" in config && config.relayerMessage && (
                <div className="bg-gray-900/50 border border-gray-700/50 rounded-lg p-3 max-h-32 overflow-y-auto">
                  <p className="text-xs text-orange-300/90 font-mono break-all whitespace-pre-wrap">
                    {config.relayerMessage}
                  </p>
                </div>
              )}
              {/* Fallback to errorDetails if no relayer message */}
              {!("relayerMessage" in config && config.relayerMessage) && config.errorDetails && (
                <p className="text-xs text-orange-400/80 font-mono break-all">{config.errorDetails}</p>
              )}
              {/* Help text */}
              <p className="text-xs text-gray-500 mt-1">
                This is a Zama relayer infrastructure issue. Please wait a moment and try again.
              </p>
            </div>
          )}

          {/* Regular error details */}
          {isError && !isRelayerError && config.errorDetails && (
            <p className="text-xs text-red-400/80 mt-1 font-mono break-all">{config.errorDetails}</p>
          )}
        </div>

        {/* Retry button or loading indicator */}
        <div className="flex-shrink-0">
          {isLoading ? (
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full bg-${config.color} animate-bounce`}
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          ) : (isError || isRelayerError) && canRetry && onRetry ? (
            <button
              onClick={onRetry}
              className={`px-3 py-1.5 ${
                isRelayerError
                  ? "bg-orange-500/20 hover:bg-orange-500/30 border-orange-500/50 text-orange-400"
                  : "bg-red-500/20 hover:bg-red-500/30 border-red-500/50 text-red-400"
              } border rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 4v6h6" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              Retry
            </button>
          ) : null}
        </div>
      </div>

      {/* Progress bar for loading states */}
      {isLoading && (
        <div className="mt-3 h-1 bg-gray-700/50 rounded-full overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r from-${config.color} to-${config.color}/50 animate-pulse`}
            style={{ width: isEncrypting ? "25%" : isSubmitting ? "50%" : "75%" }}
          />
        </div>
      )}
    </div>
  );
}

// Compact inline FHE indicator
export function FHEIndicator({ isActive }: { isActive: boolean }) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-mono transition-all ${
        isActive
          ? "bg-cyber-purple/20 border border-cyber-purple/50 text-cyber-purple"
          : "bg-gray-800/50 border border-gray-700/30 text-gray-500"
      }`}
    >
      <svg
        className={`w-3 h-3 ${isActive ? "animate-pulse" : ""}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      FHE
    </div>
  );
}
