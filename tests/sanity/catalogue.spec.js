const { test, expect } = require('@playwright/test')
const { graphqlRequest } = require('../helpers/graphql')

const ACTIVE_COURSES_QUERY = `
  query ActiveCourses {
    courses(where: { active: { eq: true } }) {
      data { id name active }
      meta { count }
    }
  }
`

const COURSE_QUERY = `query Course($id: String!) { course(id: $id) { id name active } }`

const publicQuery = (request, query, variables) => graphqlRequest(request, { url: '/public/graphql', query, variables })

test.describe('Sanity: public catalogue', { tag: '@sanity' }, () => {
  test('the course catalogue has active courses', async ({ request }) => {
    const { res, body } = await publicQuery(request, ACTIVE_COURSES_QUERY)

    expect(res.status(), JSON.stringify(body)).toBe(200)
    expect(body.data.courses.data.length).toBeGreaterThan(0)
    for (const course of body.data.courses.data) expect(course.active).toBe(true)
  })

  test('a course detail page loads', async ({ request }) => {
    const list = await publicQuery(request, ACTIVE_COURSES_QUERY)
    const first = list.body.data.courses.data[0]

    const { res, body } = await publicQuery(request, COURSE_QUERY, { id: first.id })

    expect(res.status()).toBe(200)
    expect(body.data.course.id).toBe(first.id)
  })

  test('an unknown course id fails cleanly', async ({ request }) => {
    const { res, body } = await publicQuery(request, COURSE_QUERY, { id: 'nonexistent-course-id' })

    expect(res.status()).toBe(400)
    expect(body.message).toBe('course not found')
  })
})
