import { SecretClient } from '@azure/keyvault-secrets';

/**
 * Utility to normalize and format secret names for Key Vault lookup
 * Example: EXAMPLE_CLIENT_ID=A -> EXAMPLE-CLIENT-ID-A
 */
export function buildSecretName(key, value) {
  // Replace underscores with dashes, preserve case, append value if present
  let base = key.replace(/_/g, '-');
  if (value) {
    return `${base}-${String(value)}`;
  }
  return base;
}

/**
 * Query Key Vault for secrets based on user answers
 * answers: { [key]: value }
 * Returns: { [key]: secretValue }
 */
export async function fetchSecretsFromVault({ answers, vaultUrl, credential, config }) {
  const client = new SecretClient(vaultUrl, credential);
  const result = {};
  const useJsonLogic = config && typeof config.JSON_LOGIC === 'boolean' ? config.JSON_LOGIC : false;
  // Prepare all queries for parallel execution
  const queries = Object.entries(answers).map(([key, value]) => async () => {
    if (useJsonLogic) {
      const unifiedSecretName = buildSecretName(key);
      // console.log(`[DEBUG] JSON_LOGIC enabled. Searching for unified secret: key='${key}', value='${value}', secretName='${unifiedSecretName}'`);
      try {
        const secret = await client.getSecret(unifiedSecretName);
        let jsonObj;
        try {
          jsonObj = JSON.parse(secret.value);
        } catch (jsonErr) {
          // console.error(`Error parsing JSON for secret '${unifiedSecretName}': ${jsonErr.message}`);
          return [key, `[INVALID JSON: ${unifiedSecretName}]`];
        }
        if (jsonObj && Object.prototype.hasOwnProperty.call(jsonObj, value)) {
          return [key, jsonObj[value]];
        } else {
          // console.error(`Warning: Key '${value}' not found in JSON for secret '${unifiedSecretName}'.`);
          return [key, `[NOT FOUND: ${unifiedSecretName} -> ${value}]`];
        }
      } catch (err) {
        // console.error(`Warning: Unified secret '${unifiedSecretName}' not found in Key Vault.`);
        return [key, `[NOT FOUND: ${unifiedSecretName}]`];
      }
    } else {
      const secretName = buildSecretName(key, value);
      // console.log(`[DEBUG] Searching for secret: key='${key}', value='${value}', secretName='${secretName}'`);
      try {
        const secret = await client.getSecret(secretName);
        return [key, secret.value];
      } catch (err) {
        // console.error(`Warning: Secret '${secretName}' not found in Key Vault.`);
        return [key, `[NOT FOUND: ${secretName}]`];
      }
    }
  });
  // Run all queries in parallel
  const results = await Promise.all(queries.map(fn => fn()));
  for (const [key, value] of results) {
    result[key] = value;
  }
  return result;
}
