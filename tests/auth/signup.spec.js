const { test, expect } = require('@playwright/test')
const { newStudentPayload } = require('../helpers/testData')
const { postJson, sendOtp, testOtp, signupStudent } = require('../helpers/auth')
const { config } = require('../helpers/env')

// Student signup = POST /auth/v2/send/sms (auth_type "signup") -> POST /auth/v2/signup with the OTP.
// gateway: controller/auth_controller.go Signup, services/auth/jwt_auth.go Signup (VerifyOTP + CreateProfile).

test.describe('Student signup (phone + OTP)', () => {
  test('signs up a new student and returns tokens + the created user', { tag: ['@smoke', '@mutating'] }, async ({ request }) => {
    const { phone, tokens, user } = await signupStudent(request)

    expect(tokens.user_id).toBeTruthy()
    expect(tokens.id_token).toBeTruthy()
    expect(tokens.refresh_token).toBeTruthy()
    expect(user.id).toBe(tokens.user_id)
    expect(user.phone).toBe(phone)
    expect(user.class.code).toBe(config.newStudent.class)
  })

  test('re-running signup for an existing number logs into the same account (no duplicate user)', { tag: '@mutating' }, async ({ request }) => {
    const first = await signupStudent(request)

    const { res, body } = await postJson(request, '/auth/v2/signup', {
      ...newStudentPayload({ phone: first.phone }),
      otp: testOtp(),
    })

    expect(res.status()).toBe(200)
    expect(body.tokens.user_id).toBe(first.userId)
  })

  test('rejects signup with a wrong OTP', { tag: '@mutating' }, async ({ request }) => {
    const payload = newStudentPayload()
    expect((await sendOtp(request, { phone: payload.phone, authType: 'signup' })).res.status()).toBe(200)

    const { res, body } = await postJson(request, '/auth/v2/signup', { ...payload, otp: '0000' })

    expect(res.status()).toBe(400)
    expect(body.tokens).toBeUndefined()
  })

  test('rejects signup for a number that never requested an OTP', async ({ request }) => {
    const { res, body } = await postJson(request, '/auth/v2/signup', { ...newStudentPayload(), otp: testOtp() })

    expect(res.status()).toBe(400)
    expect(body.error).toBe('User Not Found')
  })

  test('rejects a student signup without a class', { tag: '@mutating' }, async ({ request }) => {
    const payload = newStudentPayload({ profile: { first_name: config.newStudent.firstName } })
    expect((await sendOtp(request, { phone: payload.phone, authType: 'signup' })).res.status()).toBe(200)

    const { res, body } = await postJson(request, '/auth/v2/signup', { ...payload, otp: testOtp() })

    expect(res.status()).toBe(400)
    expect(body.error).toBe('Class is nil')
  })

  test('rejects an invalid phone number', async ({ request }) => {
    const { res, body } = await postJson(request, '/auth/v2/signup', { ...newStudentPayload({ phone: '12345' }), otp: testOtp() })

    expect(res.status()).toBe(400)
    expect(body.error).toBe('Invalid Auth Request')
  })
})
