import { SecretClient } from '@azure/keyvault-secrets';

/**
 * Utility to normalize and format secret names for Key Vault lookup
 * Example: ADMIN_COMMERCE_API_CLIENT_ID=002 -> ADMIN-COMMERCE-API-CLIENT-ID-002
 */
export function buildSecretName(key, value) {
  // Replace underscores with dashes, append value if present, and lowercase everything
  let base = key.replace(/_/g, '-').toLowerCase();
  if (value) {
    return `${base}-${String(value).toLowerCase()}`;
  }
  return base;
}

/**
 * Query Key Vault for secrets based on user answers
 * answers: { [key]: value }
 * Returns: { [key]: secretValue }
 */
export async function fetchSecretsFromVault({ answers, vaultUrl, credential }) {
  const client = new SecretClient(vaultUrl, credential);
  const result = {};
  for (const [key, value] of Object.entries(answers)) {
    const secretName = buildSecretName(key, value);
    try {
      const secret = await client.getSecret(secretName);
      result[key] = secret.value;
    } catch (err) {
      // Print warning and set short message in .env value, including what was searched for
      console.error(`\u001b[33mWarning: Secret '${secretName}' not found in Key Vault.\u001b[0m`);
      result[key] = `[NOT FOUND: ${secretName}]`;
    }
  }
  return result;
}
