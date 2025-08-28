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
