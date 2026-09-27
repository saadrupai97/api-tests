const { test, expect } = require('@playwright/test')
const { graphqlRequest } = require('../helpers/graphql')
const { loginExistingStudent, postJson } = require('../helpers/auth')
const { config } = require('../helpers/env')

// Runs the logged-in read flows as a real QA account from config.json "existingStudent" (phone + otp), so QA can
// check a specific user's data (subscriptions, programs, quiz history). Skips when no phone is configured.

const PROFILE_QUERY = `query Me($type: String!) { profile(type: $type) { id first_name } }`
const SUBSCRIPTIONS_QUERY = `query Subs($user_id: String) { courseSubscriptions(user_id: $user_id) { data { id expired course { id name } } meta { count } } }`
const ENROLLED_QUERY = `query Enrolled($user_id: String) { userEnrolledProgramList(user_id: $user_id) { data { id is_on_free_trial } } }`
const HISTORY_QUERY = `{ getPracticeQuizHistory(page_number: 1, page_size: 20) { data { session_id obtained_score } meta { count } } }`

test.describe.serial('Existing QA account', { tag: '@existing-account' }, () => {
  let student

  test.beforeAll(async ({ request }) => {
    test.skip(!config.existingStudent.phone, 'Set existingStudent.phone (and otp) in config.json to run as a specific user')
    student = await loginExistingStudent(request)
  })

  const gql = (request, query, variables) => graphqlRequest(request, { query, variables, token: student.tokens.access_token })

  test('logs in and loads the profile', { tag: '@smoke' }, async ({ request }) => {
    const { res, body } = await gql(request, PROFILE_QUERY, { type: 'student' })

    expect(res.status()).toBe(200)
    expect(body.data.profile.id).toBe(student.userId)
  })

  test('loads the course subscriptions', async ({ request }) => {
    const { res, body } = await gql(request, SUBSCRIPTIONS_QUERY, { user_id: student.userId })

    expect(res.status()).toBe(200)
    expect(Array.isArray(body.data.courseSubscriptions.data)).toBe(true)
  })

  test('loads the enrolled programs', async ({ request }) => {
    const { res, body } = await gql(request, ENROLLED_QUERY, { user_id: student.userId })

    expect(res.status()).toBe(200)
    expect(Array.isArray(body.data.userEnrolledProgramList.data || [])).toBe(true)
  })

  test('loads the practice quiz history', async ({ request }) => {
    const { res, body } = await gql(request, HISTORY_QUERY)

    expect(res.status()).toBe(200)
    expect(typeof body.data.getPracticeQuizHistory.meta.count).toBe('number')
  })

  test('refreshes the session', async ({ request }) => {
    const { res, body } = await postJson(request, '/auth/v2/token/refresh', { token: student.tokens.refresh_token })

    expect(res.status()).toBe(200)
    expect(body.tokens.user_id).toBe(student.userId)
  })
})
