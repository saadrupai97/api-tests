const { test, expect } = require('@playwright/test')
const { graphqlRequest } = require('../helpers/graphql')
const { loginExistingStudent, existingStudentConfig } = require('../helpers/auth')

// Logs in the env's existingStudent with its configured OTP (no SMS is sent) and only reads.
// Use a dedicated QA account with a fixed OTP; logging in issues new tokens for it.

const PROFILE_QUERY = `query Me($type: String!) { profile(type: $type) { id } }`
const SUBSCRIPTIONS_QUERY = `query Subs($user_id: String) { courseSubscriptions(user_id: $user_id) { data { id } meta { count } } }`
const ENROLLED_QUERY = `query Enrolled($user_id: String) { userEnrolledProgramList(user_id: $user_id) { data { id } } }`
const HISTORY_QUERY = `{ getPracticeQuizHistory(page_number: 1, page_size: 5) { meta { count } } }`

test.describe.serial('Sanity: QA account can log in and load its data', { tag: ['@sanity', '@existing-account'] }, () => {
  let student

  test.beforeAll(async ({ request }) => {
    test.skip(!existingStudentConfig().phone, 'Set environments.<env>.existingStudent.phone + otp in config.json')
    student = await loginExistingStudent(request)
  })

  const gql = (request, query, variables) => graphqlRequest(request, { query, variables, token: student.tokens.access_token })

  test('profile loads', async ({ request }) => {
    const { res, body } = await gql(request, PROFILE_QUERY, { type: 'student' })

    expect(res.status()).toBe(200)
    expect(body.data.profile.id).toBe(student.userId)
  })

  test('course subscriptions load', async ({ request }) => {
    const { res, body } = await gql(request, SUBSCRIPTIONS_QUERY, { user_id: student.userId })

    expect(res.status()).toBe(200)
    expect(Array.isArray(body.data.courseSubscriptions.data)).toBe(true)
  })

  test('enrolled programs load', async ({ request }) => {
    const { res } = await gql(request, ENROLLED_QUERY, { user_id: student.userId })

    expect(res.status()).toBe(200)
  })

  test('practice quiz history loads', async ({ request }) => {
    const { res, body } = await gql(request, HISTORY_QUERY)

    expect(res.status()).toBe(200)
    expect(typeof body.data.getPracticeQuizHistory.meta.count).toBe('number')
  })
})
