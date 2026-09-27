const path = require('path')
const config = require(path.join(__dirname, '..', '..', 'config.json'))

const ALLOWED_HOSTS = {
  local: ['localhost', '127.0.0.1'],
  dev: ['api.shikho.dev'],
  stage: ['api.shikho.net'],
}

const FORBIDDEN_HOSTS = ['api.shikho.com', 'shikho.com', 'www.shikho.com']

// TEST_ENV (set by the npm scripts) picks the environment; otherwise config.json "activeEnv".
function resolveTarget() {
  const testEnv = process.env.TEST_ENV || config.activeEnv
  const env = config.environments[testEnv]
  if (!env || !ALLOWED_HOSTS[testEnv]) {
    throw new Error(`Environment "${testEnv}" is not supported. Use one of: ${Object.keys(ALLOWED_HOSTS).join(', ')}`)
  }

  const host = new URL(env.baseURL).hostname
  if (FORBIDDEN_HOSTS.includes(host)) {
    throw new Error(`Refusing to run against production (${host}). This suite creates real accounts and orders.`)
  }
  if (!ALLOWED_HOSTS[testEnv].includes(host)) {
    throw new Error(`baseURL host "${host}" does not belong to "${testEnv}" (expected ${ALLOWED_HOSTS[testEnv].join(' / ')})`)
  }

  return { testEnv, ...env, fixtures: env.fixtures || {} }
}

module.exports = { config, resolveTarget }
