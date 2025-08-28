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
  const { envFile = 'test.env' } = options;
  const { keyVaultName } = await inquirer.prompt([
    { type: 'input', name: 'keyVaultName', message: 'Enter your Azure Key Vault name:' }
  ]);
  const vaultUrl = `https://${keyVaultName}.vault.azure.net`;

  // Example input structure, can be passed in options
  const KEY_VAULT_INPUTS = options.inputs || [
    { key: 'environment', choices: ['dev', 'staging', 'prod'] },
    { key: 'secrets', choices: ['DB_PASSWORD', 'API_KEY', 'SERVICE_TOKEN'] }
  ];

  let answers = {};
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
  let envContent = '';
  for (const input of KEY_VAULT_INPUTS) {
    if (input.key !== 'secrets') {
      envContent += `${input.key.toUpperCase()}=${answers[input.key]}\n`;
    }
  }
  for (const name of answers.secrets) {
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
