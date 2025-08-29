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
  for (const [key, value] of Object.entries(answers)) {
    if (useJsonLogic) {
      // Fetch unified secret and parse JSON
      const unifiedSecretName = buildSecretName(key);
      console.log(`[DEBUG] JSON_LOGIC enabled. Searching for unified secret: key='${key}', value='${value}', secretName='${unifiedSecretName}'`);
      try {
        const secret = await client.getSecret(unifiedSecretName);
        let jsonObj;
        try {
          jsonObj = JSON.parse(secret.value);
        } catch (jsonErr) {
          console.error(`\u001b[31mError parsing JSON for secret '${unifiedSecretName}': ${jsonErr.message}\u001b[0m`);
          result[key] = `[INVALID JSON: ${unifiedSecretName}]`;
          continue;
        }
        if (jsonObj && Object.prototype.hasOwnProperty.call(jsonObj, value)) {
          result[key] = jsonObj[value];
        } else {
          console.error(`\u001b[33mWarning: Key '${value}' not found in JSON for secret '${unifiedSecretName}'.\u001b[0m`);
          result[key] = `[NOT FOUND: ${unifiedSecretName} -> ${value}]`;
        }
      } catch (err) {
        console.error(`\u001b[33mWarning: Unified secret '${unifiedSecretName}' not found in Key Vault.\u001b[0m`);
        result[key] = `[NOT FOUND: ${unifiedSecretName}]`;
      }
    } else {
      // ...existing code for individual secrets...
      const secretName = buildSecretName(key, value);
      console.log(`[DEBUG] Searching for secret: key='${key}', value='${value}', secretName='${secretName}'`);
      try {
        const secret = await client.getSecret(secretName);
        result[key] = secret.value;
      } catch (err) {
        // Print warning and set short message in .env value, including what was searched for
        console.error(`\u001b[33mWarning: Secret '${secretName}' not found in Key Vault.\u001b[0m`);
        result[key] = `[NOT FOUND: ${secretName}]`;
      }
    }
  }
  return result;
}
