const { test, expect } = require('@playwright/test')

// Post-deploy sanity: read-only, creates no data. Every spec in tests/sanity must stay that way.

test.describe('Sanity: gateway is up', { tag: '@sanity' }, () => {
  test('heartbeat answers', async ({ request }) => {
    const res = await request.get('/heartbeat', { failOnStatusCode: false })

    expect(res.status()).toBe(200)
    expect((await res.json()).message).toBe('Beating')
  })

  test('app config (/version) loads, maintenance is off and payment gateways are enabled', async ({ request }) => {
    const res = await request.get('/version', { failOnStatusCode: false })

    expect(res.status(), await res.text()).toBe(200)
    const body = await res.json()
    expect(body.build).toBeGreaterThan(0)
    expect(body.maintenance).toBe(false)
    expect(Array.isArray(body.enabled_pgws)).toBe(true)
    expect(body.enabled_pgws.length).toBeGreaterThan(0)
  })
})
