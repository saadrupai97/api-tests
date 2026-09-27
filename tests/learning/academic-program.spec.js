const { test, expect } = require('@playwright/test')
const { graphqlRequest } = require('../helpers/graphql')
const { signupStudent } = require('../helpers/auth')

// Academic program (batch) journey for a student:
//   "academicPrograms" -> "academicProgram" -> mutation "generateFreeTrialEnrolment" (resolver/mutation/free_trial.go)
//   -> "userEnrolledProgramList" -> "programPhasesByStudent" -> "studentUpcomingLessons" / "studentSpecificLessons" -> "lesson".
// "enrollAcademicProgramTrial" is deprecated and not used by the app any more.

const PROGRAMS_QUERY = `
  query Programs($page_number: Int, $page_size: Int) {
    academicPrograms(page_number: $page_number, page_size: $page_size) {
      data { id headline is_active expired classes }
      meta { count }
    }
  }
`

const PROGRAM_QUERY = `query Program($id: String) { academicProgram(id: $id) { id headline is_active } }`

const FREE_TRIAL_MUTATION = `mutation FreeTrial($program_id: String!) { generateFreeTrialEnrolment(program_id: $program_id) { message } }`

const ENROLLED_QUERY = `query Enrolled($user_id: String) { userEnrolledProgramList(user_id: $user_id) { data { id is_on_free_trial } } }`

const PHASES_QUERY = `query Phases($program_id: String) { programPhasesByStudent(program_id: $program_id) { data { id } } }`

const UPCOMING_LESSONS_QUERY = `
  query Upcoming($program_id: String!) {
    studentUpcomingLessons(program_id: $program_id) { data { id title content_type } meta { count } }
  }
`

const LESSONS_QUERY = `
  query Lessons($program_id: String!) {
    studentSpecificLessons(program_id: $program_id) { data { id title content_type subject_id chapter_id } meta { count } }
  }
`

const LESSON_QUERY = `query Lesson($id: String!) { lesson(id: $id) { id title content_type } }`

test.describe.serial('Academic program: browse -> free trial -> lessons', { tag: '@mutating' }, () => {
  let student
  let programs = []
  let trialProgram
  let lessons = []

  const gql = (request, query, variables) => graphqlRequest(request, { query, variables, token: student.tokens.access_token })

  test.beforeAll(async ({ request }) => {
    student = await signupStudent(request)
  })

  test('lists academic programs', { tag: '@smoke' }, async ({ request }) => {
    const { res, body } = await gql(request, PROGRAMS_QUERY, { page_number: 1, page_size: 50 })

    expect(res.status()).toBe(200)
    expect(typeof body.data.academicPrograms.meta.count).toBe('number')
    programs = body.data.academicPrograms.data.filter((p) => p.is_active && !p.expired && p.classes && p.classes.length)
  })

  test('opens a program detail', async ({ request }) => {
    test.skip(programs.length === 0, 'No active program in this environment')

    const { res, body } = await gql(request, PROGRAM_QUERY, { id: programs[0].id })

    expect(res.status()).toBe(200)
    expect(body.data.academicProgram.id).toBe(programs[0].id)
  })

  test('a new student is not enrolled in any program', async ({ request }) => {
    const { res, body } = await gql(request, ENROLLED_QUERY, { user_id: student.userId })

    expect(res.status()).toBe(200)
    expect(body.data.userEnrolledProgramList.data || []).toHaveLength(0)
  })

  test('starts a free trial on a trial-enabled program', { tag: ['@smoke', '@mutating'] }, async ({ request }) => {
    test.skip(programs.length === 0, 'No active program in this environment')

    for (const program of programs) {
      const { res, body } = await gql(request, FREE_TRIAL_MUTATION, { program_id: program.id })
      if (res.status() === 200) {
        expect(body.data.generateFreeTrialEnrolment.message).toBe('success')
        trialProgram = program
        break
      }
      // Programs without trials are expected; anything else is a real failure.
      expect(body.message).toBe('trial is not enabled for this program')
    }

    test.skip(!trialProgram, 'None of the listed programs has a free trial enabled')
  })

  test('the trial appears in the enrolled program list', async ({ request }) => {
    test.skip(!trialProgram, 'No trial enrolment from the previous step')

    const { res, body } = await gql(request, ENROLLED_QUERY, { user_id: student.userId })

    expect(res.status()).toBe(200)
    const enrolled = body.data.userEnrolledProgramList.data
    expect(enrolled.length).toBeGreaterThan(0)
    expect(enrolled.some((p) => p.is_on_free_trial)).toBe(true)
  })

  test('a second free trial on the same program is refused', { tag: '@mutating' }, async ({ request }) => {
    test.skip(!trialProgram, 'No trial enrolment from the previous step')

    const { res, body } = await gql(request, FREE_TRIAL_MUTATION, { program_id: trialProgram.id })

    expect(res.status()).toBe(400)
    expect(body.message).toBe('you are not eligible for free trial enrollment')
  })

  test('lists the program phases for the student', async ({ request }) => {
    test.skip(!trialProgram, 'No trial enrolment from the previous step')

    const { res, body } = await gql(request, PHASES_QUERY, { program_id: trialProgram.id })

    expect(res.status()).toBe(200)
    expect(Array.isArray(body.data.programPhasesByStudent.data)).toBe(true)
  })

  test('lists upcoming and all lessons for the program', async ({ request }) => {
    test.skip(!trialProgram, 'No trial enrolment from the previous step')

    const upcoming = await gql(request, UPCOMING_LESSONS_QUERY, { program_id: trialProgram.id })
    expect(upcoming.res.status()).toBe(200)
    expect(Array.isArray(upcoming.body.data.studentUpcomingLessons.data)).toBe(true)

    const all = await gql(request, LESSONS_QUERY, { program_id: trialProgram.id })
    expect(all.res.status()).toBe(200)
    lessons = all.body.data.studentSpecificLessons.data
  })

  test('opens a lesson', async ({ request }) => {
    test.skip(lessons.length === 0, 'The trial program has no lessons in this environment')

    const { res, body } = await gql(request, LESSON_QUERY, { id: lessons[0].id })

    expect(res.status()).toBe(200)
    expect(body.data.lesson.id).toBe(lessons[0].id)
    expect(body.data.lesson.content_type).toBe(lessons[0].content_type)
  })
})

test.describe('Academic program guards', () => {
  test('free trial without an Authorization header is rejected', async ({ request }) => {
    const { res } = await graphqlRequest(request, { query: FREE_TRIAL_MUTATION, variables: { program_id: '000000000000000000000000' } })

    expect(res.status()).toBe(401)
  })
})
