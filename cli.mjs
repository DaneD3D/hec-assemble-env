#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { getCurrentUserEmail, promptKeyVaultSecretsAndWriteEnv } from './index.mjs';

const args = process.argv.slice(2);
let options = {};

const configArg = args.find(arg => arg.startsWith('--config='));
if (configArg) {
  const configPath = configArg.split('=')[1];
  const configData = fs.readFileSync(path.resolve(configPath), 'utf-8');
  options = JSON.parse(configData);
}

(async () => {
  const email = await getCurrentUserEmail();
  console.log('Current user email:', email);
  await promptKeyVaultSecretsAndWriteEnv(options);
})();
