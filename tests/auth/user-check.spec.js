const { test, expect } = require('@playwright/test')
const { randomBdPhone } = require('../helpers/testData')
const { postJson, signupStudent } = require('../helpers/auth')

// POST /auth/v2/user/check (also /auth/user_exist) -> UserExistV2. The app calls it to choose signup vs login.
// Note: "not found" answers come back as HTTP 200 with code 404 in the body.

test.describe('User existence check', () => {
  test('reports an existing student with a profile', { tag: ['@smoke', '@mutating'] }, async ({ request }) => {
    const student = await signupStudent(request)

    const { res, body } = await postJson(request, '/auth/v2/user/check', { phone: student.phone, type: 'student' })

    expect(res.status()).toBe(200)
    expect(body.code).toBe(200)
    expect(body.message).toBe('user and profile found')
    expect(body.pin_exist).toBe(false)
    expect(body.has_fixed_otp).toBe(false)
  })

  test('reports an unknown number as not found', async ({ request }) => {
    const { res, body } = await postJson(request, '/auth/v2/user/check', { phone: randomBdPhone(), type: 'student' })

    expect(res.status()).toBe(200)
    expect(body.code).toBe(404)
    expect(body.message).toBe('user not found')
  })

  test('the legacy /auth/user_exist route answers the same way', async ({ request }) => {
    const { res, body } = await postJson(request, '/auth/user_exist', { phone: randomBdPhone(), type: 'student' })

    expect(res.status()).toBe(200)
    expect(body.message).toBe('user not found')
  })

  test('rejects an invalid phone number', async ({ request }) => {
    const { res, body } = await postJson(request, '/auth/v2/user/check', { phone: '12345', type: 'student' })

    expect(res.status()).toBe(400)
    expect(body.error).toBe('Invalid Auth Request')
  })
})
