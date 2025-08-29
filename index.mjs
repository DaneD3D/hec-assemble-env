import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { Client } from '@microsoft/microsoft-graph-client';
import inquirer from 'inquirer';
import fs from 'fs';
const fsp = fs.promises;
import 'isomorphic-fetch';
import { validateConfig, buildQueries, buildUpdateChoices, promptForValue } from './promptUtils.mjs';
import { fetchSecretsFromVault } from './vaultQueryUtils.mjs';

/**
 * Shared logic for env file creation and modification
 */
async function promptAndWriteEnv({ config, envFilePath, currentEnv = {}, skipEvaluation = false }) {
  // Validate config structure
  try {
    validateConfig(config);
  } catch (err) {
    if (err.message === 'Config missing PROPERTIES object.') {
      // Fallback: prompt for vault secrets dynamically
      const vaultUrl = config.AZURE_SERVER;
      const credential = getAzureCredentials();
      // Prefer group-aware prompt if available
      let answers;
      try {
        const { promptForVaultSecretsWithGroups } = await import('./vaultPromptGroupsUtils.mjs');
        answers = await promptForVaultSecretsWithGroups({ vaultUrl, credential });
      } catch {
        const { promptForVaultSecrets } = await import('./vaultPromptUtils.mjs');
        answers = await promptForVaultSecrets({ vaultUrl, credential });
      }
      let envContent = '';
      for (const [key, value] of Object.entries(answers)) {
        envContent += `${key}=${value}\n`;
      }
      await fsp.writeFile(envFilePath, envContent);
      console.log(`${envFilePath} created from Key Vault secrets.`);
      return;
    } else {
      console.error(`\u001b[31mConfig validation error: ${err.message}\u001b[0m`);
      throw err;
    }
  }
  const keys = Object.keys(currentEnv).length > 0 ? Object.keys(currentEnv) : Object.keys(config.PROPERTIES || {});
  let updatedEnv = { ...currentEnv };
  let groupedKeys = new Set();
  let answers = {};
  let queriesMap = buildQueries(config);
  let queries = Array.from(queriesMap.values());
  let updateChoices = buildUpdateChoices(queriesMap);
  let keysToUpdate = [];
  if (!skipEvaluation && Object.keys(currentEnv).length > 0) {
    if (updateChoices.length === 0) {
      keysToUpdate = [];
    } else {
      try {
        const promptRes = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'keysToUpdate',
            message: 'Select groups/keys to update:',
            choices: updateChoices
          }
        ]);
        keysToUpdate = promptRes.keysToUpdate;
      } catch (err) {
        console.error(`\u001b[31mPrompt error: ${err.message}\u001b[0m`);
        throw err;
      }
    }
  } else {
    keysToUpdate = updateChoices.map(c => c.value);
  }
  // Run through selected queries and collect answers
  if (keysToUpdate.length === 0) {
    // nothing to update
  } else {
    for (const item of keysToUpdate) {
      const result = await promptForValue(item, queriesMap, currentEnv, config);
      for (const [key, value] of Object.entries(result)) {
        updatedEnv[key] = value;
        answers[key] = value;
        if (item.startsWith('GROUP:')) groupedKeys.add(key);
      }
    }
  }

  // Query Azure Key Vault for each key/value pair using vaultQueryUtils
  let vaultUrl = config.AZURE_SERVER;
  if (!vaultUrl) {
    console.error(`\u001b[31mNo Key Vault URL provided in config (AZURE_SERVER).\u001b[0m`);
    throw new Error('No Key Vault URL provided.');
  }
  const credential = getAzureCredentials();
  const secrets = await fetchSecretsFromVault({ answers, vaultUrl, credential, config });
  let envContent = '';
  // Get all keys from config.PROPERTIES (ensures all keys are present)
  const allConfigKeys = Object.keys(config.PROPERTIES || {});
  for (const key of allConfigKeys) {
    if (Object.keys(secrets).includes(key)) {
      envContent += `${key}=${secrets[key]}\n`;
    } else if (currentEnv[key] !== undefined) {
      envContent += `${key}=${currentEnv[key]}\n`;
    } else {
      envContent += `${key}=\n`;
    }
  }
  try {
    await fsp.writeFile(envFilePath, envContent);
    console.log(`${envFilePath} updated with secrets from Azure Key Vault.`);
  } catch (err) {
    console.error(`\u001b[31mFailed to write env file: ${err.message}\u001b[0m`);
    throw err;
  }
}
/**
 * Reads and parses a .env file into an object
 */
async function readEnvFile(envFilePath) {
  try {
    await fsp.access(envFilePath);
  } catch {
    return {};
  }
  try {
    const content = await fsp.readFile(envFilePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const env = {};
    for (const line of lines) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const [key, ...rest] = line.split('=');
      env[key.trim()] = rest.join('=').trim();
    }
    return env;
  } catch (err) {
    console.error(`\u001b[31mFailed to read env file: ${err.message}\u001b[0m`);
    return {};
  }
}

/**
 * Allows user to select which env keys to update, and prompts for new values
 */
export async function updateEnvFileInteractively(envFilePath) {
  let currentEnv = {};
  let config = {};
  try {
    currentEnv = await readEnvFile(envFilePath);
    const configPath = process.argv.find(arg => arg.startsWith('--config='));
    if (configPath) {
      const configFile = configPath.split('=')[1];
      const configContent = await fsp.readFile(configFile, 'utf-8');
      config = JSON.parse(configContent);
    }
  } catch (err) {
    console.error(`\u001b[31mError loading config or env: ${err.message}\u001b[0m`);
    throw err;
  }
  if (Object.keys(currentEnv).length === 0) {
    console.log('No existing values found in env file.');
    return;
  }
  await promptAndWriteEnv({ config, envFilePath, currentEnv, skipEvaluation: false });
}

export function getAzureCredentials() {
  return new DefaultAzureCredential();
}

export async function getCurrentUserEmail() {
  const credential = getAzureCredentials();
  const tokenResponse = await credential.getToken('https://graph.microsoft.com/.default');
  const client = Client.init({
    authProvider: (done) => {
      done(null, tokenResponse.token);
    }
  });
  const user = await client.api('/me').get();
  const email = user.mail || user.userPrincipalName;
  // Print in green with a space below (using console.log for reliability)
  console.log(`\u001b[32mCurrent user email: ${email}\u001b[0m\n`);
  return email;
}

export async function promptKeyVaultSecretsAndWriteEnv(options = {}) {
  // Accept FILE_OUTPUT_NAME from config as envFile
  const envFile = options.FILE_OUTPUT_NAME || options.envFile || '.env';
  // If propertyValues is present, skip all prompts and Key Vault logic
  if (options.propertyValues) {
    let envContent = '';
    for (const [key, value] of Object.entries(options.propertyValues)) {
      if (Array.isArray(value)) {
        value.forEach((v, idx) => {
          envContent += `${key}_${idx + 1}=${v}\n`;
        });
      } else {
        envContent += `${key}=${value}\n`;
      }
    }
    try {
      await fsp.writeFile(envFile, envContent);
      console.log(`${envFile} file created with values from config.`);
    } catch (err) {
      console.error(`\u001b[31mFailed to write env file: ${err.message}\u001b[0m`);
      throw err;
    }
    return;
  }

  // Otherwise, run interactive prompt and Key Vault logic
  let config = { ...options };
  await promptAndWriteEnv({ config, envFilePath: envFile, skipEvaluation: true });

  // Otherwise, use inputs if provided
  let KEY_VAULT_INPUTS = options.inputs;
  let answers = {};
  let envContent = '';
  if (KEY_VAULT_INPUTS) {
    for (const input of KEY_VAULT_INPUTS) {
      let promptType = 'input';
      if (input.choices && input.choices.length > 0) {
        promptType = input.key === 'secrets' ? 'checkbox' : 'list';
      }
      try {
        const response = await inquirer.prompt([
          {
            type: promptType,
            name: input.key,
            message: `Choose ${input.key}:`,
            choices: input.choices
          }
        ]);
        answers[input.key] = response[input.key];
      } catch (err) {
        console.error(`\u001b[31mPrompt error: ${err.message}\u001b[0m`);
        throw err;
      }
    }

    const credential = getAzureCredentials();
    // vaultUrl must be defined in options or config
    const vaultUrl = options.vaultUrl || config.AZURE_SERVER;
    if (!vaultUrl) {
      console.error(`\u001b[31mNo Key Vault URL provided.\u001b[0m`);
      throw new Error('No Key Vault URL provided.');
    }
    const client = new SecretClient(vaultUrl, credential);
    for (const input of KEY_VAULT_INPUTS) {
      if (input.key !== 'secrets') {
        envContent += `${input.key.toUpperCase()}=${answers[input.key]}\n`;
      }
    }
    for (const name of answers.secrets || []) {
      try {
        const secret = await client.getSecret(name);
        envContent += `${name}=${secret.value}\n`;
      } catch (err) {
        console.error(`Failed to fetch secret '${name}':`, err.message);
      }
    }
    try {
      await fsp.writeFile(envFile, envContent);
      console.log(`${envFile} file created with retrieved secrets.`);
    } catch (err) {
      console.error(`\u001b[31mFailed to write env file: ${err.message}\u001b[0m`);
      throw err;
    }
  }
}
