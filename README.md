# hec-assemble-env

Azure credential and Key Vault utilities for Node.js. Includes:
- Get Azure credentials
- Fetch current user email via Microsoft Graph
- Interactively prompt for Key Vault secrets and write to env file
- CLI entry point


## Usage

### CLI
```sh
npm start
```

### Programmatic
```js
import { getAzureCredentials, getCurrentUserEmail, promptKeyVaultSecretsAndWriteEnv } from 'hec-assemble-env';
```

## Configuration

You can use this tool with a fully fleshed out `azure-key.json` config file, or let it dynamically prompt for secrets from Azure Key Vault if config is missing.

### Example `azure-key.json` (generic values)
```json
{
  "AZURE_SERVER": "https://your-keyvault-name.vault.azure.net/",
  "FILE_OUTPUT_NAME": ".env",
  "JSON_LOGIC": true,
  "PROPERTIES": {
    "EXAMPLE_CLIENT_ID": ["A", "B"],
    "EXAMPLE_CLIENT_SECRET": ["A", "B"],
  },
  "GROUPINGS": {
    "EXAMPLE_GROUP": {
      "VALUES": ["A", "B"],
      "KEYS": [
        "EXAMPLE_CLIENT_ID",
        "EXAMPLE_CLIENT_SECRET"
      ]
    }
  }
}
```

### Config Properties Explained

- **AZURE_SERVER**: The URL of your Azure Key Vault instance.
- **FILE_OUTPUT_NAME**: The name of the output .env file to write.
- **JSON_LOGIC**: If true, enables logic to fetch and parse JSON secrets from Key Vault.
- **PROPERTIES**: An object mapping environment variable names to allowed values (for enum selection in prompts). Empty arrays mean free text input.
- **GROUPINGS**: Defines groups of related keys that can be prompted together. Each group has:
  - `VALUES`: The allowed values for the group (used for enum selection).
  - `KEYS`: The environment variable names included in the group.

**Recommended:** For most users, omitting `PROPERTIES` and `GROUPINGS` from your config (or omitting the config file entirely) is preferred. This enables fully dynamic, tag-driven, and shape-driven flows:

- The CLI will automatically discover secrets and groupings from your Azure Key Vault, using tags and the structure of your secrets.
- You will be prompted interactively for all required values, with grouping and key selection handled for you.
- This approach is more flexible and future-proof, and requires less manual config maintenance.


## Azure Key Vault Secret Setup

To take full advantage of dynamic grouping and key selection, set up your secrets in Azure Key Vault as follows:

- **Secret Value as JSON Object:**
  - Store secrets as JSON objects, e.g.:
    ```json
    {
      "A": "value-for-A",
      "B": "value-for-B"
    }
    ```
  - This allows the CLI to prompt for a key (e.g., "A" or "B") and use the corresponding value.

- **Group Tag:**
  - Add a `group` tag to secrets that should be prompted together.
  - In Azure Portal, when creating or editing a secret, add a tag named `group` with a value (e.g., `example-group`, `another-group`, etc.).
  - Secrets with the same group tag and matching JSON shape will be grouped in prompts.

**Example:**

| Secret Name                | Value (JSON)                        | Tags           |
|---------------------------|-------------------------------------|----------------|
| EXAMPLE-CLIENT-ID         | { "A": "idA", "B": "idB" }           | group: example-group|
| EXAMPLE-CLIENT-SECRET     | { "A": "secretA", "B": "secretB" }   | group: example-group|
| EXAMPLE-ENV-TYPE          | { "A": "dev", "B": "prod" }           | group: example-group|

This setup enables the CLI to prompt once for the group, letting you select "A" or "B" and apply the value to all grouped secrets.
