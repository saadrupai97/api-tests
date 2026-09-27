const { test, expect } = require('@playwright/test')
const { randomBdPhone } = require('../helpers/testData')
const { postJson, sendOtp, verifyOtp } = require('../helpers/auth')
const { config } = require('../helpers/env')

// POST /auth/v2/send/sms and /auth/v2/verify/otp (controller/auth_controller.go SendSMS / VerifyOTP).
// Non-prod environments listed in OtpTestEnvironments issue the fixed OTP (config.json environments.<env>.otp) instead of an SMS.


test.describe('OTP send + verify', () => {
  test('sends a signup OTP and says when the next one is allowed', { tag: ['@smoke', '@mutating'] }, async ({ request }) => {
    const phone = randomBdPhone()

    const { res, body } = await sendOtp(request, { phone, authType: 'signup' })

    expect(res.status()).toBe(200)
    expect(body.message).toContain(`88${phone}`)
    expect(body.next_otp_in_seconds).toBeGreaterThan(0)
  })

  test('verifies the correct OTP', { tag: '@mutating' }, async ({ request }) => {
    const phone = randomBdPhone()
    expect((await sendOtp(request, { phone, authType: 'signup' })).res.status()).toBe(200)

    const { res, body } = await verifyOtp(request, { phone })

    expect(res.status()).toBe(200)
    expect(body.message).toBe('OTP Successfully Verified')
  })

  test('rejects a wrong OTP', { tag: '@mutating' }, async ({ request }) => {
    const phone = randomBdPhone()
    expect((await sendOtp(request, { phone, authType: 'signup' })).res.status()).toBe(200)

    const { res, body } = await verifyOtp(request, { phone, otp: '0000' })

    expect(res.status()).toBe(400)
    expect(body.error).toBe('invalid credential')
  })

  test('blocks a second OTP to the same number inside the cooldown window', { tag: '@mutating' }, async ({ request }) => {
    const phone = randomBdPhone()
    expect((await sendOtp(request, { phone, authType: 'signup' })).res.status()).toBe(200)

    const { res, body } = await sendOtp(request, { phone, authType: 'resend' })

    expect(res.status()).toBe(429)
    expect(body.next_otp_in_seconds).toBeGreaterThan(0)
  })

  test('rejects an unknown auth_type', async ({ request }) => {
    const { res, body } = await sendOtp(request, { phone: randomBdPhone(), authType: 'not-a-real-type' })

    expect(res.status()).toBe(400)
    expect(body.error).toBe('invalid Type Selected')
  })

  test('rejects an invalid phone number', async ({ request }) => {
    const { res, body } = await sendOtp(request, { phone: '12345', authType: 'signup' })

    expect(res.status()).toBe(400)
    expect(body.error).toBe('Invalid Auth Request')
  })

  test('rejects verify for an invalid phone number', async ({ request }) => {
    const { res } = await postJson(request, '/auth/v2/verify/otp', { phone: '12345', otp: '1234', type: 'student' })

    expect(res.status()).toBe(400)
  })
})

// Web clients are throttled per IP + User-Agent (burst > 2/min, > 10/hour); the Android app UA is exempt.
test.describe('OTP throttle for web clients', () => {
  test('returns 429 once a browser client exceeds the burst limit', { tag: '@mutating' }, async ({ playwright, baseURL }) => {
    const web = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { 'Content-Type': 'application/json', 'User-Agent': config.http.browserUserAgent },
    })

    const statuses = []
    for (let i = 0; i < 4; i++) {
      statuses.push((await sendOtp(web, { phone: randomBdPhone(), authType: 'signup' })).res.status())
    }
    await web.dispose()

    expect(statuses).toContain(429)
  })
})
