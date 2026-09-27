const { test, expect } = require('@playwright/test')

// Public REST lookups used by receipt and pay-by-link pages:
//   GET /invoice_info/:invoice_id  (controller/invoice_info.go)
//   GET /payment/:order_id         (controller/pay_by_link.go ValidateOrder)

test.describe('Invoice + pay-by-link order lookups', () => {
  test('an unknown invoice id returns 404 "Invoice not found"', async ({ request }) => {
    const res = await request.get('/invoice_info/INV-QA-DOES-NOT-EXIST', { failOnStatusCode: false })

    expect(res.status()).toBe(404)
    expect((await res.json()).error).toBe('Invoice not found')
  })

  test('an unknown pay-by-link order is reported as invalid', async ({ request }) => {
    const res = await request.get('/payment/000000000000000000000000', { failOnStatusCode: false })

    expect(res.status()).toBe(404)
    const body = await res.json()
    expect(body.is_valid).toBe(false)
    expect(body.error).toBe('Invalid Payment link.')
  })
})
