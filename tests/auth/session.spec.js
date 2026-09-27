const { test, expect } = require('@playwright/test')
const { graphqlRequest } = require('../helpers/graphql')
const { postJson, signupStudent } = require('../helpers/auth')

// Token lifecycle: POST /auth/v2/token/refresh { token } and POST /auth/v2/logout (Bearer).
// Refreshing or logging out blacklists the previous tokens in Redis (services/token, services/auth Logout).

const PROFILE_QUERY = `query Me($type: String!) { profile(type: $type) { id } }`

test.describe.serial('Session lifecycle: refresh -> logout', { tag: '@mutating' }, () => {
  let student
  let refreshed

  test.beforeAll(async ({ request }) => {
    student = await signupStudent(request)
  })

  test('refresh issues a new token pair', { tag: ['@smoke', '@mutating'] }, async ({ request }) => {
    const { res, body } = await postJson(request, '/auth/v2/token/refresh', { token: student.tokens.refresh_token })

    expect(res.status()).toBe(200)
    expect(body.tokens.user_id).toBe(student.userId)
    expect(body.tokens.access_token).toBeTruthy()
    expect(body.tokens.access_token).not.toBe(student.tokens.access_token)
    refreshed = body.tokens
  })

  test('the new access token works', async ({ request }) => {
    const { res, body } = await graphqlRequest(request, { query: PROFILE_QUERY, variables: { type: 'student' }, token: refreshed.access_token })

    expect(res.status()).toBe(200)
    expect(body.data.profile.id).toBe(student.userId)
  })

  test('the pre-refresh access token is revoked', async ({ request }) => {
    const { res } = await graphqlRequest(request, { query: PROFILE_QUERY, variables: { type: 'student' }, token: student.tokens.access_token })

    expect(res.status()).toBe(401)
  })

  test('logout succeeds', { tag: '@mutating' }, async ({ request }) => {
    const { res, body } = await postJson(request, '/auth/v2/logout', {}, refreshed.access_token)

    expect(res.status()).toBe(200)
    expect(body.message).toBe('logged out successful')
  })

  test('the access token is rejected after logout', async ({ request }) => {
    const { res } = await graphqlRequest(request, { query: PROFILE_QUERY, variables: { type: 'student' }, token: refreshed.access_token })

    expect(res.status()).toBe(401)
  })

  test('the refresh token is rejected after logout', async ({ request }) => {
    const { res, body } = await postJson(request, '/auth/v2/token/refresh', { token: refreshed.refresh_token })

    expect(res.status()).toBe(401)
    expect(body.error).toBe('refresh token blacklisted')
  })
})

test.describe('Session negatives', () => {
  test('refresh without a token is rejected', async ({ request }) => {
    const { res, body } = await postJson(request, '/auth/v2/token/refresh', {})

    expect(res.status()).toBe(401)
    expect(body.message).toBe('no token found')
  })

  test('refresh with a malformed token is rejected', async ({ request }) => {
    const { res } = await postJson(request, '/auth/v2/token/refresh', { token: 'not-a-jwt' })

    expect(res.status()).toBe(401)
  })

  test('logout without a token is rejected', async ({ request }) => {
    const { res } = await postJson(request, '/auth/v2/logout', {})

    expect(res.status()).toBe(401)
  })
})
