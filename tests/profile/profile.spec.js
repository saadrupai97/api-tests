const { test, expect } = require('@playwright/test')
const { graphqlRequest } = require('../helpers/graphql')
const { signupStudent } = require('../helpers/auth')
const { config } = require('../helpers/env')

// POST /graphql (auth required) -> query "profile" resolves to GetLoggedInUserProfile.
// Requires Authorization: Bearer <access_token>; "type" arg is non-null (e.g. "student").

const PROFILE_QUERY = `
  query GetProfile($type: String!) {
    profile(type: $type) {
      id
      first_name
      total_points
    }
  }
`

test.describe('GraphQL query: profile', { tag: '@mutating' }, () => {
  let student

  test.beforeAll(async ({ request }) => {
    student = await signupStudent(request)
  })

  test('returns the logged-in student profile', { tag: ['@smoke', '@mutating'] }, async ({ request }) => {
    const { res, body } = await graphqlRequest(request, {
      query: PROFILE_QUERY,
      variables: { type: 'student' },
      token: student.tokens.access_token,
    })

    expect(res.status()).toBe(200)
    expect(body.errors).toBeUndefined()
    expect(body.data.profile.id).toBe(student.userId)
    expect(body.data.profile.first_name).toBe(config.newStudent.firstName)
    expect(body.data.profile.total_points).toBe(0)
  })

  test('rejects the request with no Authorization header', async ({ request }) => {
    const { res } = await graphqlRequest(request, { query: PROFILE_QUERY, variables: { type: 'student' } })

    expect(res.status()).toBe(401)
  })

  test('rejects the request with a malformed token', async ({ request }) => {
    const { res } = await graphqlRequest(request, {
      query: PROFILE_QUERY,
      variables: { type: 'student' },
      token: 'not-a-real-token',
    })

    expect(res.status()).toBe(401)
  })
})
