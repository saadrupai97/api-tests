const { test, expect } = require('@playwright/test')
const { graphqlRequest } = require('../helpers/graphql')
const { signupStudent } = require('../helpers/auth')
const { config } = require('../helpers/env')

// Practice MCQ quiz (custom quiz on chosen subject/chapter):
//   "subjects"(class) -> "chapters"(subject_code) -> mutation "startPracticeQuizMcqSession" (UserDefinedMcq)
//   -> "getMcqSession" -> mutation "submitPracticeQuizMcqSession" -> "getPracticeQuizHistory".
// gateway resolver/mutation/user_defined_mcq_quiz.go -> live-exam internal/usecase/user_defined_mcq.go.

const STUDENT_CLASS = config.newStudent.class

const SUBJECTS_QUERY = `query Subjects($class: ClassEnum) { subjects(class: $class) { code display } }`
const CHAPTERS_QUERY = `query Chapters($subject_code: String) { chapters(subject_code: $subject_code) { data { id name } } }`

const START_MUTATION = `
  mutation Start($subject_ids: [String], $chapter_ids: [String], $total_mcq_count: Int) {
    startPracticeQuizMcqSession(mcq_quiz_type: UserDefinedMcq, subject_ids: $subject_ids, chapter_ids: $chapter_ids, total_mcq_count: $total_mcq_count) {
      message
      session { id user_id is_started is_final_submitted quiz_type questions { id mcq_options { no } } }
    }
  }
`

const GET_SESSION_QUERY = `query Session($id: String!) { getMcqSession(session_id: $id) { session { id user_id is_final_submitted } } }`

const SUBMIT_MUTATION = `
  mutation Submit($id: String!, $question_answer: [UpdateQuizMcqSessionsQuestionAnswer]) {
    submitPracticeQuizMcqSession(id: $id, is_final_submitted: true, is_timeout: false, question_answer: $question_answer) {
      session { id is_final_submitted }
    }
  }
`

const HISTORY_QUERY = `
  query History {
    getPracticeQuizHistory(page_number: 1, page_size: 20) {
      data { session_id total_question total_correct total_incorrect obtained_score }
      meta { count }
    }
  }
`

function answersFor(session) {
  const now = new Date().toISOString()
  return session.questions.map((q) => ({ id: q.id, given_ans: q.mcq_options[0].no, start_time: now, submit_time: now }))
}

// Picks the first subject/chapter of the student's class that has questions; starting a quiz is the only way to know.
async function startFirstAvailableQuiz(request, token) {
  const gql = (query, variables) => graphqlRequest(request, { query, variables, token })

  const subjects = (await gql(SUBJECTS_QUERY, { class: STUDENT_CLASS })).body.data.subjects || []
  for (const subject of subjects) {
    const chapters = (await gql(CHAPTERS_QUERY, { subject_code: subject.code })).body.data?.chapters?.data || []
    for (const chapter of chapters) {
      const { res, body } = await gql(START_MUTATION, { subject_ids: [subject.code], chapter_ids: [chapter.id], total_mcq_count: 5 })
      if (res.status() === 200 && body.data.startPracticeQuizMcqSession.session) {
        return { subject, chapter, start: body.data.startPracticeQuizMcqSession }
      }
    }
  }
  return null
}

test.describe.serial('Practice MCQ quiz: start -> submit -> history', { tag: '@mutating' }, () => {
  let student
  let otherStudent
  let session

  test.beforeAll(async ({ request }) => {
    student = await signupStudent(request)
    otherStudent = await signupStudent(request)
  })

  test('starts a practice quiz on a subject/chapter of the student class', { tag: '@smoke' }, async ({ request }) => {
    const found = await startFirstAvailableQuiz(request, student.tokens.access_token)
    test.skip(!found, `No ${STUDENT_CLASS} chapter with MCQ questions in this environment`)

    expect(found.start.message).toBe('started successfully')
    session = found.start.session
    expect(session.user_id).toBe(student.userId)
    expect(session.is_started).toBe(true)
    expect(session.is_final_submitted).toBe(false)
    expect(session.questions.length).toBeGreaterThan(0)
    for (const q of session.questions) expect(q.mcq_options.length).toBeGreaterThan(1)
  })

  test('the owner can fetch the running session', async ({ request }) => {
    test.skip(!session, 'No quiz session from the previous step')

    const { res, body } = await graphqlRequest(request, { query: GET_SESSION_QUERY, variables: { id: session.id }, token: student.tokens.access_token })

    expect(res.status()).toBe(200)
    expect(body.data.getMcqSession.session.id).toBe(session.id)
    expect(body.data.getMcqSession.session.is_final_submitted).toBe(false)
  })

  test('another student cannot read this session', async ({ request }) => {
    test.skip(!session, 'No quiz session from the previous step')
    test.fail(true, 'KNOWN DEFECT (dev, 2026-09-27): live-exam GetMcqSession loads by id only and ignores the caller')

    const { body } = await graphqlRequest(request, { query: GET_SESSION_QUERY, variables: { id: session.id }, token: otherStudent.tokens.access_token })

    expect(body.data?.getMcqSession?.session).toBeFalsy()
  })

  test('submits the answers as final', { tag: '@smoke' }, async ({ request }) => {
    test.skip(!session, 'No quiz session from the previous step')

    const { res, body } = await graphqlRequest(request, {
      query: SUBMIT_MUTATION,
      variables: { id: session.id, question_answer: answersFor(session) },
      token: student.tokens.access_token,
    })

    expect(res.status(), JSON.stringify(body)).toBe(200)
    expect(body.data.submitPracticeQuizMcqSession.session.is_final_submitted).toBe(true)
  })

  test('the session is marked final-submitted', async ({ request }) => {
    test.skip(!session, 'No quiz session from the previous step')

    const { body } = await graphqlRequest(request, { query: GET_SESSION_QUERY, variables: { id: session.id }, token: student.tokens.access_token })

    expect(body.data.getMcqSession.session.is_final_submitted).toBe(true)
  })

  test('the result is in the student quiz history', { tag: '@smoke' }, async ({ request }) => {
    test.skip(!session, 'No quiz session from the previous step')

    const { res, body } = await graphqlRequest(request, { query: HISTORY_QUERY, token: student.tokens.access_token })

    expect(res.status()).toBe(200)
    const entry = body.data.getPracticeQuizHistory.data.find((h) => h.session_id === session.id)
    expect(entry).toBeTruthy()
    expect(entry.total_correct + entry.total_incorrect).toBeLessThanOrEqual(session.questions.length)
    expect(entry.obtained_score).toBeGreaterThanOrEqual(0)
  })

  test('the history counts the questions actually served', async ({ request }) => {
    test.skip(!session, 'No quiz session from the previous step')
    test.fail(true, 'KNOWN DEFECT (dev, 2026-09-27): total_question reports 10 even when fewer questions were served')

    const { body } = await graphqlRequest(request, { query: HISTORY_QUERY, token: student.tokens.access_token })
    const entry = body.data.getPracticeQuizHistory.data.find((h) => h.session_id === session.id)

    expect(entry.total_question).toBe(session.questions.length)
  })

  test('the quiz is not in another student history', async ({ request }) => {
    test.skip(!session, 'No quiz session from the previous step')

    const { body } = await graphqlRequest(request, { query: HISTORY_QUERY, token: otherStudent.tokens.access_token })

    expect(body.data.getPracticeQuizHistory.data.some((h) => h.session_id === session.id)).toBe(false)
  })

  test('another student cannot submit this session', async ({ request }) => {
    test.skip(!session, 'No quiz session from the previous step')
    test.fail(true, 'KNOWN DEFECT (dev, 2026-09-27): live-exam UserDefinedMcqSession.Submit has no ownership check')

    const { res } = await graphqlRequest(request, {
      query: SUBMIT_MUTATION,
      variables: { id: session.id, question_answer: answersFor(session) },
      token: otherStudent.tokens.access_token,
    })

    expect(res.status()).not.toBe(200)
  })
})

test.describe('Practice MCQ quiz guards', () => {
  test('starting a quiz without an Authorization header is rejected', async ({ request }) => {
    const { res } = await graphqlRequest(request, { query: START_MUTATION, variables: { subject_ids: ['0'], chapter_ids: ['0'], total_mcq_count: 5 } })

    expect(res.status()).toBe(401)
  })

  test('starting a quiz without chapters is rejected', { tag: '@mutating' }, async ({ request }) => {
    const student = await signupStudent(request)

    const { res, body } = await graphqlRequest(request, {
      query: START_MUTATION,
      variables: { subject_ids: ['0'], chapter_ids: [], total_mcq_count: 5 },
      token: student.tokens.access_token,
    })

    expect(res.status()).toBe(400)
    expect(body.data?.startPracticeQuizMcqSession?.session).toBeFalsy()
  })
})
