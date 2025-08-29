import inquirer from 'inquirer';

/**
 * Validate config structure
 */
export function validateConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('Config must be an object.');
  if (!config.PROPERTIES || typeof config.PROPERTIES !== 'object') throw new Error('Config missing PROPERTIES object.');
  if (config.GROUPINGS && typeof config.GROUPINGS !== 'object') throw new Error('GROUPINGS must be an object if present.');
  if (config.FILE_OUTPUT_NAME && typeof config.FILE_OUTPUT_NAME !== 'string') throw new Error('FILE_OUTPUT_NAME must be a string.');
}

/**
 * Build queries for prompt logic
 */
export function buildQueries(config) {
  const queries = [];
  const propertyKeys = Object.keys(config.PROPERTIES || {});
  const groupNames = config.GROUPINGS ? Object.keys(config.GROUPINGS) : [];
  const allGroupedKeys = new Set();
  if (config.GROUPINGS) {
    for (const groupName of groupNames) {
      const groupObj = config.GROUPINGS[groupName];
      queries.push({ type: 'group', name: groupName, keys: groupObj.KEYS, values: groupObj.VALUES });
      for (const key of groupObj.KEYS) {
        allGroupedKeys.add(key);
      }
    }
  }
  for (const key of propertyKeys) {
    if (!allGroupedKeys.has(key) && !(Array.isArray(config.PROPERTIES[key]) && config.PROPERTIES[key].length === 0)) {
      queries.push({ type: 'individual', name: key });
    }
  }
  // Use Map for fast lookup
  return new Map(queries.map(q => [q.type === 'group' ? `GROUP:${q.name}` : q.name, q]));
}

/**
 * Build choices for multi-select prompt
 */
export function buildUpdateChoices(queries) {
  return Array.from(queries.values()).map(q => q.type === 'group'
    ? { name: `[GROUP] ${q.name}`, value: `GROUP:${q.name}` }
    : { name: q.name, value: q.name });
}

/**
 * Prompt for value (group or individual)
 */
export async function promptForValue(item, queriesMap, currentEnv, config) {
  try {
    if (item.startsWith('GROUP:')) {
      const groupName = item.replace('GROUP:', '');
      const groupQuery = queriesMap.get(item);
      if (!groupQuery) return {};
      const { groupValue } = await inquirer.prompt([
        {
          type: 'list',
          name: 'groupValue',
          message: `Choose value for group ${groupName}:`,
          choices: groupQuery.values,
          default: currentEnv[groupQuery.keys[0]]
        }
      ]);
      const result = {};
      for (const key of groupQuery.keys) {
        result[key] = groupValue;
      }
      return result;
    } else {
      let promptOptions = {
        type: 'input',
        name: 'newValue',
        message: `Enter new value for ${item}:`,
        default: currentEnv[item]
      };
      if (config.PROPERTIES && Array.isArray(config.PROPERTIES[item])) {
        promptOptions = {
          type: 'list',
          name: 'newValue',
          message: `Choose new value for ${item}:`,
          choices: config.PROPERTIES[item],
          default: currentEnv[item]
        };
      }
      const { newValue } = await inquirer.prompt([promptOptions]);
      return { [item]: newValue };
    }
  } catch (err) {
    console.error(`\u001b[31mPrompt error: ${err.message}\u001b[0m`);
    throw err;
  }
}
