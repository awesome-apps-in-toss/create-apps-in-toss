#!/usr/bin/env node
import { run } from '../src/scaffold.js';

run(process.argv.slice(2)).catch((err) => {
  console.error('\n[create-apps-in-toss] ❌', err?.message || err);
  process.exit(1);
});
