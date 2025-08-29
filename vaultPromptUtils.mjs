/**
 * Fetch all secret names and their tags from the Key Vault
 */
export async function getVaultSecretsWithTags(vaultUrl, credential) {
  const client = new SecretClient(vaultUrl, credential);
  const secrets = [];
  for await (const secretProperties of client.listPropertiesOfSecrets()) {
    secrets.push({ name: secretProperties.name, tags: secretProperties.tags || {} });
  }
  return secrets;
}

/**
 * Build groupings from secrets based on their 'group' tag
 */
export function buildGroupingsFromTags(secrets) {
  const groupings = Object.create(null);
  for (const secret of secrets) {
    const group = secret.tags.group;
    if (group) {
      if (!Array.isArray(groupings[group])) groupings[group] = [];
      groupings[group].push(secret.name);
    }
  }
  return groupings;
}
import { SecretClient } from '@azure/keyvault-secrets';
import inquirer from 'inquirer';

/**
 * Fetch all secret names from the Key Vault
 */
export async function getVaultSecretNames(vaultUrl, credential) {
  const client = new SecretClient(vaultUrl, credential);
  const secretNames = [];
  for await (const secretProperties of client.listPropertiesOfSecrets()) {
    secretNames.push(secretProperties.name);
  }
  return secretNames;
}

/**
 * Prompt user for values for each secret in the vault
 */
export async function promptForVaultSecrets({ vaultUrl, credential }) {
  const client = new SecretClient(vaultUrl, credential);
  const secrets = await getVaultSecretsWithTags(vaultUrl, credential);
  if (secrets.length === 0) {
    console.log('No secrets found in Key Vault.');
    return {};
  }
  const groupings = buildGroupingsFromTags(secrets);
  const answers = {};
  // Prompt for each group
  for (const [group, secretNames] of Object.entries(groupings)) {
    // For the group, check if any secret is a JSON object and build choices from the first JSON object found
    let choices;
    let secretValue;
    let validGroupSecrets = [];
    let invalidGroupSecrets = [];
    // Find the intersection of keys for all JSON objects in the group
    let keySets = [];
    let jsonGroupSecrets = [];
    let parsedSecrets = {};
    for (const name of secretNames) {
      try {
        const secret = await client.getSecret(name);
        secretValue = secret.value;
        const parsed = JSON.parse(secretValue);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          keySets.push(new Set(Object.keys(parsed)));
          jsonGroupSecrets.push(name);
          parsedSecrets[name] = parsed;
        } else {
          invalidGroupSecrets.push(name);
        }
      } catch {
        invalidGroupSecrets.push(name);
      }
    }
    // Find the most common key set among JSON secrets
    const keySetCounts = {};
    const keySetMap = {};
    for (const name of jsonGroupSecrets) {
      const keys = Object.keys(parsedSecrets[name] || {});
      const keyStr = keys.sort().join('||');
      keySetCounts[keyStr] = (keySetCounts[keyStr] || 0) + 1;
      keySetMap[name] = keyStr;
    }
    // Find the most common key set
    let majorityKeyStr = null;
    let maxCount = 0;
    for (const [keyStr, count] of Object.entries(keySetCounts)) {
      if (count > maxCount) {
        maxCount = count;
        majorityKeyStr = keyStr;
      }
    }
    const majorityKeys = majorityKeyStr ? majorityKeyStr.split('||') : [];
    // validGroupSecrets: only those whose key set matches the majority
    validGroupSecrets = jsonGroupSecrets.filter(name => keySetMap[name] === majorityKeyStr);
    // invalidGroupSecrets: all others
    invalidGroupSecrets = secretNames.filter(name => !validGroupSecrets.includes(name));
    // If no valid group secrets, treat all as invalid
    if (majorityKeys.length === 0 || validGroupSecrets.length === 0) {
      invalidGroupSecrets = [...secretNames];
      validGroupSecrets = [];
      choices = [];
    } else {
      choices = majorityKeys;
    }
    let selectedKey;
    if (choices && choices.length > 0 && validGroupSecrets.length > 0) {
      // Only prompt ONCE for the group, not for each secret
      const { selected } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selected',
          message: `Choose value for group '${group}' (applies to: ${validGroupSecrets.join(', ')})`,
          choices
        }
      ]);
      selectedKey = selected;
      // Apply the selected value to all valid group secrets
      for (const name of validGroupSecrets) {
        try {
          answers[name] = parsedSecrets[name][selectedKey];
        } catch {
          answers[name] = '';
        }
      }
    }
    // For each invalid/ejected secret, prompt individually for their own keys
    for (const name of invalidGroupSecrets) {
      let secretValue;
      let choices;
      let parsed;
      try {
        const secret = await client.getSecret(name);
        secretValue = secret.value;
        parsed = JSON.parse(secretValue);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          choices = Object.keys(parsed);
        }
      } catch {}
      if (choices && choices.length > 0) {
        const { selected } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selected',
            message: `Choose value for secret '${name}' (group: ${group})`,
            choices
          }
        ]);
        try {
          answers[name] = parsed[selected];
        } catch {
          answers[name] = '';
        }
      } else {
        const { value } = await inquirer.prompt([
          {
            type: 'input',
            name: 'value',
            message: `Enter value for secret '${name}' (group: ${group})`
          }
        ]);
        answers[name] = value;
      }
    }
  }
  // Prompt for ungrouped secrets
  const ungrouped = secrets.filter(s => !s.tags.group).map(s => s.name);
  for (const name of ungrouped) {
    let secretValue;
    let choices;
    try {
      const secret = await client.getSecret(name);
      secretValue = secret.value;
      const parsed = JSON.parse(secretValue);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        choices = Object.keys(parsed);
      }
    } catch {}
    if (choices && choices.length > 0) {
      const { selected } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selected',
          message: `Choose value for secret '${name}':`,
          choices
        }
      ]);
      try {
        const parsed = JSON.parse(secretValue);
        answers[name] = parsed[selected];
      } catch {
        answers[name] = '';
      }
    } else {
      const { value } = await inquirer.prompt([
        {
          type: 'input',
          name: 'value',
          message: `Enter value for secret '${name}':`
        }
      ]);
      answers[name] = value;
    }
  }
  return answers;
}
