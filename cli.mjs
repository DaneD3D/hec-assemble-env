#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { getCurrentUserEmail, promptKeyVaultSecretsAndWriteEnv, updateEnvFileInteractively } from './index.mjs';

const args = process.argv.slice(2);
let options = {};

const configArg = args.find(arg => arg.startsWith('--config='));
if (configArg) {
  const configPath = configArg.split('=')[1];
  const configData = fs.readFileSync(path.resolve(configPath), 'utf-8');
  options = JSON.parse(configData);
}


const envFile = options.FILE_OUTPUT_NAME || options.envFile || '.env';
const recreateFlag = args.includes('-c');

(async () => {
  await getCurrentUserEmail();
  if (recreateFlag) {
    await promptKeyVaultSecretsAndWriteEnv(options);
  } else {
    await updateEnvFileInteractively(envFile);
  }
})();
