import { getCurrentUserEmail, promptKeyVaultSecretsAndWriteEnv } from './index.mjs';

(async () => {
  const email = await getCurrentUserEmail();
  console.log('Current user email:', email);
  await promptKeyVaultSecretsAndWriteEnv();
})();
