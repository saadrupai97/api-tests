const { test, expect } = require('@playwright/test')
const { graphqlRequest } = require('../helpers/graphql')
const { signupStudent } = require('../helpers/auth')

// "liveClasses" (resolver/queries/live_classes.go) feeds the student's live class list / calendar.

const LIVE_CLASSES_QUERY = `
  query LiveClasses($show_on_calendar: Boolean) {
    liveClasses(show_on_calendar: $show_on_calendar) {
      data { id }
      meta { count }
    }
  }
`

test.describe('Live classes', { tag: '@mutating' }, () => {
  let student

  test.beforeAll(async ({ request }) => {
    student = await signupStudent(request)
  })

  test('lists live classes for a student', { tag: ['@smoke', '@mutating'] }, async ({ request }) => {
    const { res, body } = await graphqlRequest(request, { query: LIVE_CLASSES_QUERY, token: student.tokens.access_token })

    expect(res.status()).toBe(200)
    expect(Array.isArray(body.data.liveClasses.data)).toBe(true)
    expect(typeof body.data.liveClasses.meta.count).toBe('number')
  })

  test('lists calendar live classes for a student', async ({ request }) => {
    const { res, body } = await graphqlRequest(request, {
      query: LIVE_CLASSES_QUERY,
      variables: { show_on_calendar: true },
      token: student.tokens.access_token,
    })

    expect(res.status()).toBe(200)
    expect(Array.isArray(body.data.liveClasses.data)).toBe(true)
  })

  test('rejects the request without an Authorization header', async ({ request }) => {
    const { res } = await graphqlRequest(request, { query: LIVE_CLASSES_QUERY })

    expect(res.status()).toBe(401)
  })
})
