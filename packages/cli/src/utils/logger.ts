import chalk from 'chalk';
import { sanitizeForLog } from './error-sanitizer.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

let currentLevel: LogLevel = 'info';
let ciMode = false;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function setCIMode(enabled: boolean): void {
  ciMode = enabled;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

export const logger = {
  debug(msg: string): void {
    if (!shouldLog('debug')) return;
    const safe = sanitizeForLog(msg);
    if (!ciMode) console.debug(chalk.gray(`  ${safe}`));
  },

  info(msg: string): void {
    if (!shouldLog('info')) return;
    const safe = sanitizeForLog(msg);
    console.log(safe);
  },

  warn(msg: string): void {
    if (!shouldLog('warn')) return;
    const safe = sanitizeForLog(msg);
    console.warn(chalk.yellow(`⚠ ${safe}`));
  },

  error(msg: string): void {
    if (!shouldLog('error')) return;
    const safe = sanitizeForLog(msg);
    console.error(chalk.red(`✖ ${safe}`));
  },

  success(msg: string): void {
    if (!shouldLog('info')) return;
    const safe = sanitizeForLog(msg);
    console.log(chalk.green(`✔ ${safe}`));
  },
};
