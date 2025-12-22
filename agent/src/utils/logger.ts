// Structured logging utility for the SimPhanToe agent

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const COLORS = {
  debug: "\x1b[36m", // Cyan
  info: "\x1b[32m", // Green
  warn: "\x1b[33m", // Yellow
  error: "\x1b[31m", // Red
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bright: "\x1b[1m",
};

class Logger {
  private minLevel: LogLevel;
  private context?: string;

  constructor(context?: string) {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
    this.minLevel = envLevel && LOG_LEVELS[envLevel] !== undefined ? envLevel : "info";
    this.context = context;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(level: LogLevel, message: string, data?: Record<string, unknown>): string {
    const timestamp = `${COLORS.dim}${this.formatTimestamp()}${COLORS.reset}`;
    const levelColor = COLORS[level];
    const levelTag = `${levelColor}${COLORS.bright}[${level.toUpperCase()}]${COLORS.reset}`;
    const contextTag = this.context ? `${COLORS.dim}[${this.context}]${COLORS.reset} ` : "";

    let output = `${timestamp} ${levelTag} ${contextTag}${message}`;

    if (data && Object.keys(data).length > 0) {
      output += `\n${COLORS.dim}${JSON.stringify(data, null, 2)}${COLORS.reset}`;
    }

    return output;
  }

  debug(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog("debug")) {
      console.log(this.formatMessage("debug", message, data));
    }
  }

  info(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog("info")) {
      console.log(this.formatMessage("info", message, data));
    }
  }

  warn(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", message, data));
    }
  }

  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    if (this.shouldLog("error")) {
      const errorData = { ...data };
      if (error instanceof Error) {
        errorData.errorMessage = error.message;
        errorData.errorStack = error.stack;
      } else if (error !== undefined) {
        errorData.error = String(error);
      }
      console.error(this.formatMessage("error", message, errorData));
    }
  }

  child(context: string): Logger {
    const childLogger = new Logger(`${this.context ? `${this.context}:` : ""}${context}`);
    childLogger.minLevel = this.minLevel;
    return childLogger;
  }
}

// Default logger instance
export const logger = new Logger("Agent");

// Create a logger with context
export function createLogger(context: string): Logger {
  return new Logger(context);
}

export { Logger };

