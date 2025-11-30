interface FHEStatusProps {
  status: {
    type: string
    message: string
  } | null
  isEncrypting?: boolean
  isDecrypting?: boolean
  isSubmitting?: boolean
}

export function FHEStatus({ status, isEncrypting, isDecrypting, isSubmitting }: FHEStatusProps) {
  if (!status && !isEncrypting && !isDecrypting && !isSubmitting) return null

  const getStatusConfig = () => {
    if (isEncrypting) {
      return {
        icon: 'encrypt',
        color: 'cyber-purple',
        bgColor: 'from-cyber-purple/20 to-cyber-pink/20',
        message: 'Encrypting your move...',
      }
    }
    if (isDecrypting) {
      return {
        icon: 'decrypt',
        color: 'cyber-cyan',
        bgColor: 'from-cyber-cyan/20 to-cyber-blue/20',
        message: 'Decrypting result...',
      }
    }
    if (isSubmitting) {
      return {
        icon: 'submit',
        color: 'cyber-pink',
        bgColor: 'from-cyber-pink/20 to-cyber-purple/20',
        message: 'Submitting to blockchain...',
      }
    }
    if (status) {
      switch (status.type) {
        case 'encrypt':
          return {
            icon: 'encrypt',
            color: 'cyber-purple',
            bgColor: 'from-cyber-purple/20 to-cyber-pink/20',
            message: status.message,
          }
        case 'decrypt':
          return {
            icon: 'decrypt',
            color: 'cyber-cyan',
            bgColor: 'from-cyber-cyan/20 to-cyber-blue/20',
            message: status.message,
          }
        case 'success':
          return {
            icon: 'check',
            color: 'green-500',
            bgColor: 'from-green-500/20 to-green-600/20',
            message: status.message,
          }
        case 'error':
          return {
            icon: 'error',
            color: 'red-500',
            bgColor: 'from-red-500/20 to-red-600/20',
            message: status.message,
          }
        case 'collision':
          return {
            icon: 'collision',
            color: 'yellow-500',
            bgColor: 'from-yellow-500/20 to-orange-500/20',
            message: status.message,
          }
        default:
          return {
            icon: 'info',
            color: 'gray-400',
            bgColor: 'from-gray-500/20 to-gray-600/20',
            message: status.message,
          }
      }
    }
    return null
  }

  const config = getStatusConfig()
  if (!config) return null

  const isLoading = isEncrypting || isDecrypting || isSubmitting

  return (
    <div className={`glass p-4 bg-gradient-to-r ${config.bgColor} border-${config.color}/30`}>
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className={`w-10 h-10 rounded-lg bg-${config.color}/20 flex items-center justify-center`}>
          {isLoading ? (
            <svg className={`w-5 h-5 text-${config.color} animate-spin`} viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : config.icon === 'encrypt' ? (
            <svg className={`w-5 h-5 text-${config.color}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ) : config.icon === 'decrypt' ? (
            <svg className={`w-5 h-5 text-${config.color}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
          ) : config.icon === 'check' ? (
            <svg className={`w-5 h-5 text-${config.color}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : config.icon === 'error' ? (
            <svg className={`w-5 h-5 text-${config.color}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          ) : config.icon === 'collision' ? (
            <svg className={`w-5 h-5 text-${config.color}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
            </svg>
          ) : (
            <svg className={`w-5 h-5 text-${config.color}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          )}
        </div>

        {/* Message */}
        <div className="flex-1">
          <p className={`font-semibold text-${config.color}`}>{config.message}</p>
          {isLoading && (
            <p className="text-xs text-gray-500 mt-0.5">
              {isEncrypting && 'Using FHE to encrypt your move coordinates...'}
              {isDecrypting && 'Verifying encrypted data with the network...'}
              {isSubmitting && 'Broadcasting transaction to the blockchain...'}
            </p>
          )}
        </div>

        {/* Animated encryption visualization */}
        {isLoading && (
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full bg-${config.color} animate-encrypt`}
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Compact inline FHE indicator
export function FHEIndicator({ isActive }: { isActive: boolean }) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-mono transition-all ${
      isActive 
        ? 'bg-cyber-purple/20 border border-cyber-purple/50 text-cyber-purple' 
        : 'bg-gray-800/50 border border-gray-700/30 text-gray-500'
    }`}>
      <svg 
        className={`w-3 h-3 ${isActive ? 'animate-pulse' : ''}`} 
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
  )
}

