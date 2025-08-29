/**
 * Shared logic for env file creation and modification
 */
async function promptAndWriteEnv({ config, envFilePath, currentEnv = {}, skipEvaluation = false }) {
  // Normalize keys for matching
  function normalizeKey(key) {
    return key.trim().toUpperCase();
  }
  const keys = Object.keys(currentEnv).length > 0 ? Object.keys(currentEnv) : Object.keys(config.PROPERTIES || {});
  let updatedEnv = { ...currentEnv };
  let groupedKeys = new Set();
  let answers = {};
  // Build a list of queries (groups and individuals)
  let queries = [];
  let propertyKeys = Object.keys(config.PROPERTIES || {});
  let groupNames = config.GROUPINGS ? Object.keys(config.GROUPINGS) : [];
  let allGroupedKeys = new Set();
  if (config.GROUPINGS) {
    for (const groupName of groupNames) {
      const groupObj = config.GROUPINGS[groupName];
      queries.push({ type: 'group', name: groupName, keys: groupObj.KEYS, values: groupObj.VALUES });
      for (const key of groupObj.KEYS) {
        allGroupedKeys.add(key);
      }
    }
  }
  // Add ungrouped keys
  for (const key of propertyKeys) {
    if (!allGroupedKeys.has(key) && !(Array.isArray(config.PROPERTIES[key]) && config.PROPERTIES[key].length === 0)) {
      queries.push({ type: 'individual', name: key });
    }
  }
  // Build choices for the multi-select prompt
  let updateChoices = queries.map(q => q.type === 'group'
    ? { name: `[GROUP] ${q.name}`, value: `GROUP:${q.name}` }
    : { name: q.name, value: q.name });
  let keysToUpdate = [];
  if (!skipEvaluation && Object.keys(currentEnv).length > 0) {
    // Interactive update: let user select which queries to run
    if (updateChoices.length === 0) {
      keysToUpdate = [];
    } else {
      const promptRes = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'keysToUpdate',
          message: 'Select groups/keys to update:',
          choices: updateChoices
        }
      ]);
      keysToUpdate = promptRes.keysToUpdate;
    }
  } else {
    // Full recreation: run all queries
    keysToUpdate = updateChoices.map(c => c.value);
  }
  // Now run through the selected queries
  if (keysToUpdate.length === 0) {
    // nothing to update
  } else {
    for (let i = 0; i < keysToUpdate.length; i++) {
      const item = keysToUpdate[i];
      if (item.startsWith('GROUP:')) {
        const groupName = item.replace('GROUP:', '');
        const groupQuery = queries.find(q => q.type === 'group' && q.name === groupName);
        if (!groupQuery) continue;
        const { groupValue } = await inquirer.prompt([
          {
            type: 'list',
            name: 'groupValue',
            message: `Choose value for group ${groupName}:`,
            choices: groupQuery.values,
            default: currentEnv[groupQuery.keys[0]]
          }
        ]);
        for (const key of groupQuery.keys) {
          updatedEnv[key] = groupValue;
          answers[key] = groupValue;
          groupedKeys.add(key);
        }
      } else {
        // Individual key query
        let promptOptions = {
          type: 'input',
          name: 'newValue',
          message: `Enter new value for ${item}:`,
          default: currentEnv[item]
        };
        if (config.PROPERTIES && Array.isArray(config.PROPERTIES[item])) {
          promptOptions = {
            type: 'list',
            name: 'newValue',
            message: `Choose new value for ${item}:`,
            choices: config.PROPERTIES[item],
            default: currentEnv[item]
          };
        }
        const { newValue } = await inquirer.prompt([promptOptions]);
        updatedEnv[item] = newValue;
        answers[item] = newValue;
      }
      // ...no need to reprint instructions after each prompt...
    }
  }
  // Write updated env file
  let envContent = '';
  for (const key of keys) {
    // Always export the value set by groupings if present
    if (groupedKeys.has(key)) {
      envContent += `${key}=${updatedEnv[key]}\n`;
      continue;
    }
    // Otherwise, export the updated value (if set), or keep the current value
    envContent += `${key}=${updatedEnv[key] ?? currentEnv[key] ?? ''}\n`;
  }
  // Also write any grouped keys not in keys
  if (config.GROUPINGS) {
    for (const groupObj of Object.values(config.GROUPINGS)) {
      for (const key of groupObj.KEYS) {
        if (!keys.includes(key)) {
          envContent += `${key}=${answers[key] ?? ''}\n`;
        }
      }
    }
  }
  fs.writeFileSync(envFilePath, envContent);
  console.log(`${envFilePath} updated with selected changes.`);
}
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
  let config = {};
  try {
    const configPath = process.argv.find(arg => arg.startsWith('--config='));
    if (configPath) {
      const configFile = configPath.split('=')[1];
      config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    }
  } catch {}
  if (Object.keys(currentEnv).length === 0) {
    console.log('No existing values found in env file.');
    return;
  }
  await promptAndWriteEnv({ config, envFilePath, currentEnv, skipEvaluation: false });
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
    fs.writeFileSync(envFile, envContent);
    console.log(`${envFile} file created with values from config.`);
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
