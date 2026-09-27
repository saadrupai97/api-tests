const { test, expect } = require('@playwright/test')
const { graphqlRequest } = require('../helpers/graphql')
const { signupStudent } = require('../helpers/auth')
const { fixture } = require('../helpers/fixtures')

// Paid course purchase, up to the payment gateway hand-off (no money moves):
//   signup -> pick a paid course -> mutation "initiatePayment" (pgw SSL | Bkash, content_type Course) -> checkout URL.
// Resolver: gateway/resolver/mutation/system_mutation_initiate_payment.go (student role only).
// Completing the payment on the gateway page and the IPN callbacks are out of scope for automation.

const PAID_COURSES_QUERY = `
  query PaidCourses($ids: [String]) {
    courses(course_ids: $ids, where: { is_free_course: { eq: false }, active: { eq: true } }) {
      data { id name sales_price packages subjects { code } }
    }
  }
`

const INITIATE_PAYMENT_MUTATION = `
  mutation InitiatePayment($pgw: PgwTypeEnumType!, $content_id: String!, $subject_ids: [String], $coupon_code: String, $subscription_division: SubscriptionDivisionEnum) {
    initiatePayment(pgw: $pgw, content_id: $content_id, content_type: Course, subject_ids: $subject_ids, coupon_code: $coupon_code, subscription_division: $subscription_division) {
      url
      order_id
    }
  }
`

const GATEWAYS = [
  { pgw: 'SSL', host: /sslcommerz\.com$/ },
  { pgw: 'Bkash', host: /bkash\.com$/ },
]

function paymentVariables(course, overrides = {}) {
  return {
    content_id: course.id,
    subject_ids: course.subjects.map((s) => s.code),
    subscription_division: (course.packages || []).includes('Live') ? 'full' : null,
    ...overrides,
  }
}

test.describe('Paid course checkout (up to payment gateway)', { tag: '@mutating' }, () => {
  let student
  let paidCourse

  test.beforeAll(async ({ request }) => {
    student = await signupStudent(request)

    const ids = fixture('paidCourseId') ? [fixture('paidCourseId')] : null
    const { res, body } = await graphqlRequest(request, {
      query: PAID_COURSES_QUERY,
      variables: { ids },
      token: student.tokens.access_token,
    })
    expect(res.status()).toBe(200)
    paidCourse = body.data.courses.data.find((c) => c.sales_price > 0 && c.subjects && c.subjects.length)
  })

  for (const { pgw, host } of GATEWAYS) {
    test(`${pgw}: returns a sandbox checkout URL`, { tag: ['@smoke', '@mutating'] }, async ({ request }) => {
      test.skip(!paidCourse, 'No paid, active course with subjects (set environments.<env>.fixtures.paidCourseId in config.json)')

      const { res, body } = await graphqlRequest(request, {
        query: INITIATE_PAYMENT_MUTATION,
        variables: paymentVariables(paidCourse, { pgw }),
        token: student.tokens.access_token,
      })

      expect(res.status(), JSON.stringify(body)).toBe(200)
      const url = new URL(body.data.initiatePayment.url)
      expect(url.protocol).toBe('https:')
      expect(url.hostname).toMatch(host)
      // Non-prod must never hand students to a live payment gateway.
      expect(url.hostname).toContain('sandbox')
    })
  }

  test('rejects an invalid coupon code', { tag: '@mutating' }, async ({ request }) => {
    test.skip(!paidCourse, 'No paid, active course with subjects (set environments.<env>.fixtures.paidCourseId in config.json)')

    const { res, body } = await graphqlRequest(request, {
      query: INITIATE_PAYMENT_MUTATION,
      variables: paymentVariables(paidCourse, { pgw: 'SSL', coupon_code: 'QA-NOT-A-REAL-COUPON' }),
      token: student.tokens.access_token,
    })

    expect(res.status()).toBe(400)
    expect(body.message).toBe('Invalid Coupon Code')
  })

  test('rejects an unknown course', async ({ request }) => {
    const { res, body } = await graphqlRequest(request, {
      query: INITIATE_PAYMENT_MUTATION,
      variables: { pgw: 'SSL', content_id: '00000000-0000-0000-0000-000000000000', subject_ids: ['0'] },
      token: student.tokens.access_token,
    })

    expect(res.status()).toBe(400)
    expect(body.message).toBe('course not found')
  })

  test('rejects checkout without an Authorization header', async ({ request }) => {
    const { res } = await graphqlRequest(request, {
      query: INITIATE_PAYMENT_MUTATION,
      variables: { pgw: 'SSL', content_id: '00000000-0000-0000-0000-000000000000', subject_ids: ['0'] },
    })

    expect(res.status()).toBe(401)
  })
})
