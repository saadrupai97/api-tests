const { test, expect } = require('@playwright/test')
const { graphqlRequest } = require('../helpers/graphql')

// POST /public/graphql (no auth) -> "courses" / "course". The gateway answers GraphQL validation and
// resolver errors with HTTP 400 and { message, code } instead of a 200 + "errors" array.

const COURSES_QUERY = `
  query GetCourses {
    courses {
      data { id name active sales_price retail_price }
      meta { count }
    }
  }
`

const FILTERED_COURSES_QUERY = `
  query FilteredCourses($where: GetPublicCoursesWhereFilterArgumentObject) {
    courses(where: $where) {
      data { id name active is_free_course sales_price subjects { code } }
      meta { count }
    }
  }
`

const SINGLE_COURSE_QUERY = `
  query GetCourse($id: String!) {
    course(id: $id) { id name active is_free_course sales_price subjects { code } }
  }
`

const publicQuery = (request, query, variables) => graphqlRequest(request, { url: '/public/graphql', query, variables })

test.describe('Course catalogue (public, no auth)', () => {
  test('lists courses without any filters', { tag: '@smoke' }, async ({ request }) => {
    const { res, body } = await publicQuery(request, COURSES_QUERY)

    expect(res.status()).toBe(200)
    expect(body.errors).toBeUndefined()
    expect(Array.isArray(body.data.courses.data)).toBe(true)
    expect(typeof body.data.courses.meta.count).toBe('number')
  })

  test('filters courses by active = true', async ({ request }) => {
    const { res, body } = await publicQuery(request, FILTERED_COURSES_QUERY, { where: { active: { eq: true } } })

    expect(res.status()).toBe(200)
    for (const course of body.data.courses.data) expect(course.active).toBe(true)
  })

  test('filters courses by is_free_course = true', async ({ request }) => {
    const { res, body } = await publicQuery(request, FILTERED_COURSES_QUERY, { where: { is_free_course: { eq: true } } })

    expect(res.status()).toBe(200)
    for (const course of body.data.courses.data) expect(course.is_free_course).toBe(true)
  })

  test('opens a course detail page from the catalogue', { tag: '@smoke' }, async ({ request }) => {
    const list = await publicQuery(request, FILTERED_COURSES_QUERY, { where: { active: { eq: true } } })
    const first = list.body.data.courses.data[0]
    test.skip(!first, 'No active course in this environment')

    const { res, body } = await publicQuery(request, SINGLE_COURSE_QUERY, { id: first.id })

    expect(res.status()).toBe(200)
    expect(body.data.course.id).toBe(first.id)
    expect(body.data.course.name).toBe(first.name)
    expect(body.data.course.active).toBe(true)
  })

  test('an unknown course id returns a clean "course not found" error', async ({ request }) => {
    const { res, body } = await publicQuery(request, SINGLE_COURSE_QUERY, { id: 'nonexistent-course-id' })

    expect(res.status()).toBe(400)
    expect(body.message).toBe('course not found')
  })

  test('an invalid field is rejected by schema validation', async ({ request }) => {
    const { res, body } = await publicQuery(request, `{ courses { data { not_a_field } } }`)

    expect(res.status()).toBe(400)
    expect(body.message).toContain('Cannot query field')
  })
})
