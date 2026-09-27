const { resolveTarget } = require('./env')

// IDs QA sets per environment in config.json for flows whose data can't be discovered through the API.
function fixture(name) {
  const value = resolveTarget().fixtures[name]
  return value && String(value).trim() ? String(value).trim() : null
}

module.exports = { fixture }
