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
  let answers = {};
  // Build dynamic queries for discovered secrets/groups
  const { buildQueries, promptForValue } = await import('./promptUtils.mjs');
  // Build a config-like object from Key Vault secrets (in-memory only, not exported)
  const dynamicConfig = { PROPERTIES: {}, GROUPINGS: {} };
  for (const [group, secretNames] of Object.entries(groupings)) {
    // ...existing code for grouping and key shape analysis...
    let parsedSecrets = {};
    let keySets = {};
    for (const name of secretNames) {
      try {
        const secret = await client.getSecret(name);
        const parsed = JSON.parse(secret.value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          parsedSecrets[name] = parsed;
          keySets[name] = Object.keys(parsed);
        }
      } catch {}
    }
    // ...existing code for majority key set and prompt message...
    const keySetCounts = {};
    const keySetMap = {};
    for (const name of Object.keys(keySets)) {
      const keys = keySets[name];
      const keyStr = keys.sort().join('||');
      keySetCounts[keyStr] = (keySetCounts[keyStr] || 0) + 1;
      keySetMap[name] = keyStr;
    }
    let majorityKeyStr = null;
    let maxCount = 0;
    for (const [keyStr, count] of Object.entries(keySetCounts)) {
      if (count > maxCount) {
        maxCount = count;
        majorityKeyStr = keyStr;
      }
    }
    const majorityKeys = majorityKeyStr ? majorityKeyStr.split('||') : [];
    const validGroupSecrets = Object.keys(keySetMap).filter(name => keySetMap[name] === majorityKeyStr);
    if (validGroupSecrets.length > 0 && majorityKeys.length > 0) {
      dynamicConfig.GROUPINGS[group] = {
        KEYS: validGroupSecrets,
        VALUES: majorityKeys,
        PROMPT_MESSAGE: `Choose value for group '${group}' (applies to: ${validGroupSecrets.join(', ')})`
      };
      for (const name of validGroupSecrets) {
        dynamicConfig.PROPERTIES[name] = majorityKeys;
      }
    }
    // Eject secrets with different key sets
    const invalidGroupSecrets = secretNames.filter(name => !validGroupSecrets.includes(name));
    for (const name of invalidGroupSecrets) {
      try {
        const secret = await client.getSecret(name);
        const parsed = JSON.parse(secret.value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          dynamicConfig.PROPERTIES[name] = Object.keys(parsed);
        } else {
          dynamicConfig.PROPERTIES[name] = [];
        }
      } catch {
        dynamicConfig.PROPERTIES[name] = [];
      }
    }
  }
  // Add ungrouped secrets (in-memory only)
  const ungrouped = secrets.filter(s => !s.tags.group).map(s => s.name);
  for (const name of ungrouped) {
    try {
      const secret = await client.getSecret(name);
      const parsed = JSON.parse(secret.value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        dynamicConfig.PROPERTIES[name] = Object.keys(parsed);
      } else {
        dynamicConfig.PROPERTIES[name] = [];
      }
    } catch {
      dynamicConfig.PROPERTIES[name] = [];
    }
  }
  // Use shared prompt logic
  const queriesMap = buildQueries(dynamicConfig);
  // answers already declared above
  for (const item of Array.from(queriesMap.keys())) {
    // Use custom prompt message for group items if present
    let promptMessage;
    if (item.startsWith('GROUP:')) {
      const groupName = item.replace('GROUP:', '');
      const groupObj = dynamicConfig.GROUPINGS[groupName];
      if (groupObj && groupObj.PROMPT_MESSAGE) {
        promptMessage = groupObj.PROMPT_MESSAGE;
      }
    }
    const result = await promptForValue(item, queriesMap, {}, dynamicConfig, promptMessage);
    Object.assign(answers, result);
  }

  // Now, for each answer, fetch the actual value from Key Vault if it's a JSON secret
  let finalAnswers = {};
  for (const [name, selected] of Object.entries(answers)) {
    try {
      const secret = await client.getSecret(name);
      const secretValue = secret.value;
      const parsed = JSON.parse(secretValue);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && selected in parsed) {
        finalAnswers[name] = parsed[selected];
      } else {
        finalAnswers[name] = selected;
      }
    } catch {
      finalAnswers[name] = selected;
    }
  }
  return finalAnswers;
}
