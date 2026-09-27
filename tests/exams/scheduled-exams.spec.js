const { test, expect } = require('@playwright/test')
const { graphqlRequest } = require('../helpers/graphql')
const { signupStudent } = require('../helpers/auth')
const { fixture } = require('../helpers/fixtures')

// Program-scheduled exams need an exam that exists and is published in the target environment, so they run only
// when QA sets its id in config.json (environments.<env>.fixtures); otherwise they skip.

const MCQ_EXAM_QUERY = `query McqExam($id: String!) { mcqExam(id: $id) { id title is_active is_published exam_duration } }`
const MODEL_TEST_QUERY = `query ModelTest($id: String!) { modelTest(id: $id) { id academic_program_id batch_id exam_date } }`

test.describe('Scheduled exams (fixture-driven)', { tag: '@mutating' }, () => {
  let student

  test.beforeAll(async ({ request }) => {
    student = await signupStudent(request)
  })

  test('opens the configured MCQ exam', async ({ request }) => {
    const id = fixture('mcqExamId')
    test.skip(!id, 'Set environments.<env>.fixtures.mcqExamId in config.json')

    const { res, body } = await graphqlRequest(request, { query: MCQ_EXAM_QUERY, variables: { id }, token: student.tokens.access_token })

    expect(res.status(), JSON.stringify(body)).toBe(200)
    expect(body.data.mcqExam.id).toBe(id)
    expect(body.data.mcqExam.is_active).toBe(true)
    expect(body.data.mcqExam.is_published).toBe(true)
  })

  test('opens the configured model test', async ({ request }) => {
    const id = fixture('modelTestId')
    test.skip(!id, 'Set environments.<env>.fixtures.modelTestId in config.json')

    const { res, body } = await graphqlRequest(request, { query: MODEL_TEST_QUERY, variables: { id }, token: student.tokens.access_token })

    expect(res.status(), JSON.stringify(body)).toBe(200)
    expect(body.data.modelTest.id).toBe(id)
    expect(body.data.modelTest.academic_program_id).toBeTruthy()
  })
})
