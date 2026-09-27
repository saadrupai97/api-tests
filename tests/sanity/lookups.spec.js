const { test, expect } = require('@playwright/test')

test.describe('Sanity: receipt + pay-by-link lookups', { tag: '@sanity' }, () => {
  test('an unknown invoice returns 404', async ({ request }) => {
    const res = await request.get('/invoice_info/INV-QA-DOES-NOT-EXIST', { failOnStatusCode: false })

    expect(res.status()).toBe(404)
    expect((await res.json()).error).toBe('Invoice not found')
  })

  test('an unknown pay-by-link order is reported as invalid', async ({ request }) => {
    const res = await request.get('/payment/000000000000000000000000', { failOnStatusCode: false })

    expect(res.status()).toBe(404)
    expect((await res.json()).is_valid).toBe(false)
  })
})
