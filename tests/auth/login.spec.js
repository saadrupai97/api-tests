const { test, expect } = require('@playwright/test')
const { randomBdPhone } = require('../helpers/testData')
const { sendOtp, loginWithOtp, signupStudent } = require('../helpers/auth')

// Student login is OTP-based: POST /auth/v2/send/sms (auth_type "login") -> POST /auth/v2/login { phone, otp }.
// Passwords are only used by teacher/employee accounts (services/auth/jwt_auth.go Login).

test.describe('Student login (phone + OTP)', { tag: '@mutating' }, () => {
  let student

  test.beforeAll(async ({ request }) => {
    student = await signupStudent(request)
  })

  test('logs in an existing student with a fresh login OTP', { tag: ['@smoke', '@mutating'] }, async ({ request }) => {
    const otp = await sendOtp(request, { phone: student.phone, authType: 'login' })
    // A signup OTP was just sent to this number, so the per-number cooldown may apply; the stored OTP stays valid.
    expect([200, 429]).toContain(otp.res.status())

    const { res, body } = await loginWithOtp(request, { phone: student.phone })

    expect(res.status()).toBe(200)
    expect(body.tokens.user_id).toBe(student.userId)
    expect(body.tokens.access_token).toBeTruthy()
    expect(body.tokens.refresh_token).toBeTruthy()
  })

  test('sets the browser auth cookies on login', { tag: '@mutating' }, async ({ request }) => {
    const { res } = await loginWithOtp(request, { phone: student.phone })

    expect(res.status()).toBe(200)
    const cookies = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value)
    for (const name of ['idToken', 'accessToken', 'refreshToken']) {
      expect(cookies.some((c) => c.startsWith(`${name}=`))).toBe(true)
    }
  })

  test('rejects a wrong OTP', async ({ request }) => {
    const { res, body } = await loginWithOtp(request, { phone: student.phone, otp: '0000' })

    expect(res.status()).toBe(400)
    expect(body.error).toBe('invalid credential')
    expect(body.tokens).toBeUndefined()
  })

  test('rejects login for a number that has no account', async ({ request }) => {
    const { res, body } = await loginWithOtp(request, { phone: randomBdPhone() })

    expect(res.status()).toBe(400)
    expect(body.tokens).toBeUndefined()
  })

  test('refuses to send a login OTP to a number that has no account', async ({ request }) => {
    const { res, body } = await sendOtp(request, { phone: randomBdPhone(), authType: 'login' })

    expect(res.status()).toBe(400)
    expect(body.error).toBe('user not found')
  })
})
