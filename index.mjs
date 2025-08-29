/**
 * Reads and parses a .env file into an object
 */
function readEnvFile(envFilePath) {
  if (!fs.existsSync(envFilePath)) return {};
  const content = fs.readFileSync(envFilePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const env = {};
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const [key, ...rest] = line.split('=');
    env[key.trim()] = rest.join('=').trim();
  }
  return env;
}

/**
 * Allows user to select which env keys to update, and prompts for new values
 */
export async function updateEnvFileInteractively(envFilePath) {
  const currentEnv = readEnvFile(envFilePath);
  const keys = Object.keys(currentEnv);
  if (keys.length === 0) {
    console.log('No existing values found in env file.');
    return;
  }
  // Multi-select prompt for keys to update
  const { keysToUpdate } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'keysToUpdate',
      message: 'Select env keys to update (spacebar to select, arrows to move):',
      choices: keys
    }
  ]);
  let updatedEnv = { ...currentEnv };
  // Try to load config for enums
  let config = {};
  try {
    // Try to find config file in cwd
    const configPath = process.argv.find(arg => arg.startsWith('--config='));
    if (configPath) {
      const configFile = configPath.split('=')[1];
      config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    }
  } catch {}
  for (const key of keysToUpdate) {
    let promptOptions = {
      type: 'input',
      name: 'newValue',
      message: `Enter new value for ${key}:`,
      default: currentEnv[key]
    };
    if (config.PROPERTIES && Array.isArray(config.PROPERTIES[key])) {
      promptOptions = {
        type: 'list',
        name: 'newValue',
        message: `Choose new value for ${key}:`,
        choices: config.PROPERTIES[key],
        default: currentEnv[key]
      };
    }
    const { newValue } = await inquirer.prompt([promptOptions]);
    updatedEnv[key] = newValue;
  }
  // Write updated env file
  let envContent = '';
  for (const [key, value] of Object.entries(updatedEnv)) {
    envContent += `${key}=${value}\n`;
  }
  fs.writeFileSync(envFilePath, envContent);
  console.log(`${envFilePath} updated with selected changes.`);
}
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { Client } from '@microsoft/microsoft-graph-client';
import inquirer from 'inquirer';
import fs from 'fs';
import 'isomorphic-fetch';

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
  return user.mail || user.userPrincipalName;
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
    fs.writeFileSync(envFile, envContent);
    console.log(`${envFile} file created with values from config.`);
    return;
  }

  // Otherwise, run interactive prompt and Key Vault logic
  let keyVaultName = options.AZURE_SERVER;
  if (!keyVaultName) {
    const response = await inquirer.prompt([
      { type: 'input', name: 'keyVaultName', message: 'Enter your Azure Key Vault name:' }
    ]);
    keyVaultName = response.keyVaultName;
  }
  const vaultUrl = `https://${keyVaultName}.vault.azure.net`;

  // If PROPERTIES is present in options, prompt for each property value
  if (options.PROPERTIES) {
    let envContent = '';
    let answers = {};
    for (const [key, value] of Object.entries(options.PROPERTIES)) {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          continue;
        }
        // Prompt user to select from array
        const response = await inquirer.prompt([
          {
            type: 'list',
            name: key,
            message: `Choose value for ${key}:`,
            choices: value
          }
        ]);
        answers[key] = response[key];
        envContent += `${key}=${response[key]}\n`;
      } else {
        // Use the value directly
        answers[key] = value;
        envContent += `${key}=${value}\n`;
      }
    }
    fs.writeFileSync(envFile, envContent);
    console.log(`${envFile} file created with selected property values.`);
    return;
  }

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
      const response = await inquirer.prompt([
        {
          type: promptType,
          name: input.key,
          message: `Choose ${input.key}:`,
          choices: input.choices
        }
      ]);
      answers[input.key] = response[input.key];
    }

    const credential = getAzureCredentials();
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
    fs.writeFileSync(envFile, envContent);
    console.log(`${envFile} file created with retrieved secrets.`);
  }
}
