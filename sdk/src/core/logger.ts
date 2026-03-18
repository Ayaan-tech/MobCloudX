// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Logger
// ─────────────────────────────────────────────────────────────

const PREFIX = '[MobCloudX]';

class Logger {
  private enabled = false;

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  info(...args: unknown[]) {
    if (this.enabled) console.log(PREFIX, ...args);
  }

  warn(...args: unknown[]) {
    if (this.enabled) console.warn(PREFIX, '⚠️', ...args);
  }

  error(...args: unknown[]) {
    console.error(PREFIX, '❌', ...args);
  }

  debug(...args: unknown[]) {
    if (this.enabled) console.debug(PREFIX, '🔍', ...args);
  }
}

export const logger = new Logger();
