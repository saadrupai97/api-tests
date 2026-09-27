const { test, expect } = require('@playwright/test')
const { graphqlRequest } = require('../helpers/graphql')
const { postJson } = require('../helpers/auth')
const { randomBdPhone } = require('../helpers/testData')

// Only inputs the gateway rejects before touching users or sending SMS (invalid phone format, missing token).

const PROFILE_QUERY = `query Me($type: String!) { profile(type: $type) { id } }`
const INVALID_PHONE = '12345'

test.describe('Sanity: auth guards', { tag: '@sanity' }, () => {
  test('GraphQL without a token is rejected', async ({ request }) => {
    const { res } = await graphqlRequest(request, { query: PROFILE_QUERY, variables: { type: 'student' } })

    expect(res.status()).toBe(401)
  })

  test('GraphQL with a malformed token is rejected', async ({ request }) => {
    const { res } = await graphqlRequest(request, { query: PROFILE_QUERY, variables: { type: 'student' }, token: 'not-a-real-token' })

    expect(res.status()).toBe(401)
  })

  test('token refresh without a token is rejected', async ({ request }) => {
    const { res } = await postJson(request, '/auth/v2/token/refresh', {})

    expect(res.status()).toBe(401)
  })

  test('logout without a token is rejected', async ({ request }) => {
    const { res } = await postJson(request, '/auth/v2/logout', {})

    expect(res.status()).toBe(401)
  })

  for (const path of ['/auth/v2/send/sms', '/auth/v2/signup', '/auth/v2/login', '/auth/v2/verify/otp']) {
    test(`${path} rejects an invalid phone number`, async ({ request }) => {
      const { res, body } = await postJson(request, path, { phone: INVALID_PHONE, type: 'student', auth_type: 'signup', otp: '0000' })

      expect(res.status()).toBe(400)
      expect(body.tokens).toBeUndefined()
    })
  }

  test('user check reports an unknown number as not found', async ({ request }) => {
    const { res, body } = await postJson(request, '/auth/v2/user/check', { phone: randomBdPhone(), type: 'student' })

    expect(res.status()).toBe(200)
    expect(body.code).toBe(404)
  })
})
