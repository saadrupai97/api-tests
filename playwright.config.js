const { defineConfig } = require('@playwright/test')
const { config, resolveTarget } = require('./tests/helpers/env')

const { baseURL } = resolveTarget()

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: config.run.retries,
  workers: config.run.workers,
  timeout: config.run.timeoutMs,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
      'User-Agent': config.http.userAgent,
    },
  },
})
