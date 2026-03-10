#!/usr/bin/env node
import { createProgram } from '../index.js';

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error(`pw-doctor: ${message}`);
  process.exit(2);
});

process.on('uncaughtException', (err) => {
  console.error(`pw-doctor: ${err.message}`);
  process.exit(2);
});

const program = createProgram();
program.parse();
