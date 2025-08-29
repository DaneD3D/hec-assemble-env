import { SecretClient } from '@azure/keyvault-secrets';
import inquirer from 'inquirer';

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
  const groupings = {};
  for (const secret of secrets) {
    const group = secret.tags.group;
    if (group) {
      if (!groupings[group]) groupings[group] = [];
      groupings[group].push(secret.name);
    }
  }
  return groupings;
}

/**
 * Prompt user for values for each secret, supporting group prompts
 */
export async function promptForVaultSecretsWithGroups({ vaultUrl, credential }) {
  const secrets = await getVaultSecretsWithTags(vaultUrl, credential);
  if (secrets.length === 0) {
    console.log('No secrets found in Key Vault.');
    return {};
  }
  const groupings = buildGroupingsFromTags(secrets);
  const answers = {};
  // Prompt for each group (skip group prompt if only one secret)
  for (const [group, secretNames] of Object.entries(groupings)) {
    if (secretNames.length === 1) {
      // Only one secret, prompt individually
      const name = secretNames[0];
      const isSensitive = /secret|key|token|password/i.test(name);
      const { value } = await inquirer.prompt([
        {
          type: isSensitive ? 'password' : 'input',
          name: 'value',
          message: `Enter value for secret '${name}':`,
          mask: isSensitive ? '*' : undefined
        }
      ]);
      answers[name] = value;
    } else {
      // Use password prompt for secrets likely to be sensitive
      const isSensitive = secretNames.some(name => /secret|key|token|password/i.test(name));
      const { groupValue } = await inquirer.prompt([
        {
          type: isSensitive ? 'password' : 'input',
          name: 'groupValue',
          message: `Enter value for group '${group}' (applies to: ${secretNames.join(', ')})`,
          mask: isSensitive ? '*' : undefined
        }
      ]);
      for (const name of secretNames) {
        answers[name] = groupValue;
      }
    }
  }
  // Prompt for ungrouped secrets
  const ungrouped = secrets.filter(s => !s.tags.group).map(s => s.name);
  if (ungrouped.length > 0) {
    const prompts = ungrouped.map(name => ({
      type: /secret|key|token|password/i.test(name) ? 'password' : 'input',
      name,
      message: `Enter value for secret '${name}':`,
      mask: /secret|key|token|password/i.test(name) ? '*' : undefined
    }));
    const ungroupedAnswers = await inquirer.prompt(prompts);
    Object.assign(answers, ungroupedAnswers);
  }

  return answers;
}
