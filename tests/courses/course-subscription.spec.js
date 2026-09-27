const { test, expect } = require('@playwright/test')
const { graphqlRequest } = require('../helpers/graphql')
const { signupStudent } = require('../helpers/auth')

// Free course enrolment:
//   signup -> "courses" (is_free_course, active) -> mutation "subscribeToFreeCourse" -> "courseSubscriptions".
// Resolver: gateway/resolver/mutation/system_mutation_initiateFreeSubs.go (student role only, subject_ids are
// subject *codes*, success message "course subscription generated successfully").
// Paid courses go through initiatePayment instead (see paid-course-checkout.spec.js).

const COURSES_QUERY = `
  query Courses($where: GetCoursesWhereFilterArgumentObject) {
    courses(where: $where) {
      data { id name packages subjects { code } }
    }
  }
`

const SUBSCRIBE_TO_FREE_COURSE_MUTATION = `
  mutation SubscribeToFreeCourse($course_id: String!, $subject_ids: [String]!, $subscription_division: SubscriptionDivisionEnum) {
    subscribeToFreeCourse(course_id: $course_id, subject_ids: $subject_ids, subscription_division: $subscription_division) {
      message
    }
  }
`

const COURSE_SUBSCRIPTIONS_QUERY = `
  query MySubscriptions($user_id: String) {
    courseSubscriptions(user_id: $user_id) {
      data { id user_id expired type course { id } }
      meta { count }
    }
  }
`

const isLive = (course) => (course.packages || []).includes('Live')

function subscribeVariables(course) {
  return {
    course_id: course.id,
    subject_ids: course.subjects.map((s) => s.code),
    subscription_division: isLive(course) ? 'full' : null,
  }
}

async function findCourses(request, token, where) {
  const { res, body } = await graphqlRequest(request, { query: COURSES_QUERY, variables: { where }, token })
  expect(res.status()).toBe(200)
  return body.data.courses.data.filter((c) => c.subjects && c.subjects.length)
}

async function mySubscriptions(request, student) {
  const { res, body } = await graphqlRequest(request, {
    query: COURSE_SUBSCRIPTIONS_QUERY,
    variables: { user_id: student.userId },
    token: student.tokens.access_token,
  })
  expect(res.status()).toBe(200)
  return body.data.courseSubscriptions.data.filter((s) => s.course)
}

test.describe.serial('Free course enrolment', { tag: '@mutating' }, () => {
  let student
  let freeCourse

  test.beforeAll(async ({ request }) => {
    student = await signupStudent(request)
  })

  test('finds a free, active course', { tag: '@smoke' }, async ({ request }) => {
    const courses = await findCourses(request, student.tokens.access_token, { is_free_course: { eq: true }, active: { eq: true } })
    test.skip(courses.length === 0, 'No free, active course with subjects in this environment')

    // Recorded (non-Live) free courses are the main production path; Live ones need a subscription_division.
    freeCourse = courses.find((c) => !isLive(c)) || courses[0]
  })

  test('a new student has no course subscriptions', async ({ request }) => {
    expect(await mySubscriptions(request, student)).toHaveLength(0)
  })

  test('subscribes the student to the free course', { tag: ['@smoke', '@mutating'] }, async ({ request }) => {
    test.skip(!freeCourse, 'No free course found in the previous step')

    const { res, body } = await graphqlRequest(request, {
      query: SUBSCRIBE_TO_FREE_COURSE_MUTATION,
      variables: subscribeVariables(freeCourse),
      token: student.tokens.access_token,
    })

    expect(res.status(), JSON.stringify(body)).toBe(200)
    expect(body.data.subscribeToFreeCourse.message).toBe('course subscription generated successfully')
  })

  test('the subscription shows up as active in courseSubscriptions', async ({ request }) => {
    test.skip(!freeCourse, 'No free course found in the previous step')

    const subscriptions = await mySubscriptions(request, student)
    const match = subscriptions.find((s) => s.course.id === freeCourse.id)

    expect(match).toBeTruthy()
    expect(match.user_id).toBe(student.userId)
    expect(match.expired).toBe(false)
  })

  test('subscribing to the same free course again does not create a second subscription', { tag: '@mutating' }, async ({ request }) => {
    test.skip(!freeCourse, 'No free course found in the previous step')
    test.fail(true, 'KNOWN DEFECT (dev, 2026-09-27): a repeat subscribeToFreeCourse succeeds and adds a duplicate subscription row')

    await graphqlRequest(request, {
      query: SUBSCRIBE_TO_FREE_COURSE_MUTATION,
      variables: subscribeVariables(freeCourse),
      token: student.tokens.access_token,
    })

    const subscriptions = await mySubscriptions(request, student)
    expect(subscriptions.filter((s) => s.course.id === freeCourse.id)).toHaveLength(1)
  })

  test('rejects subscribing without an Authorization header', async ({ request }) => {
    test.skip(!freeCourse, 'No free course found in the previous step')

    const { res } = await graphqlRequest(request, { query: SUBSCRIBE_TO_FREE_COURSE_MUTATION, variables: subscribeVariables(freeCourse) })

    expect(res.status()).toBe(401)
  })
})

test.describe('Free course enrolment guards', () => {
  test('a paid course cannot be taken through the free-subscription mutation', { tag: '@mutating' }, async ({ request }) => {
    const student = await signupStudent(request)
    const paid = await findCourses(request, student.tokens.access_token, { is_free_course: { eq: false }, active: { eq: true } })
    test.skip(paid.length === 0, 'No paid, active course with subjects in this environment')

    const { res, body } = await graphqlRequest(request, {
      query: SUBSCRIBE_TO_FREE_COURSE_MUTATION,
      variables: subscribeVariables(paid[0]),
      token: student.tokens.access_token,
    })

    expect(res.status()).toBe(400)
    expect(body.message).toBe('this course is not free to subscribe')
    expect(await mySubscriptions(request, student)).toHaveLength(0)
  })
})
