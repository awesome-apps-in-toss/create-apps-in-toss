#!/usr/bin/env node
import { run } from '../src/scaffold.js';
import { adopt } from '../src/adopt.js';

const argv = process.argv.slice(2);
const subcommand = argv[0];

if (subcommand === 'adopt') {
  adopt(argv.slice(1)).catch((err) => {
    console.error('\n[create-apps-in-toss] ❌', err?.message || err);
    process.exit(1);
  });
} else {
  run(argv).catch((err) => {
    console.error('\n[create-apps-in-toss] ❌', err?.message || err);
    process.exit(1);
  });
}
