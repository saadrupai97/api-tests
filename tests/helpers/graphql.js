// GraphQL is served at POST /graphql (auth required, Authorization: Bearer <access_token>)
// and POST /public/graphql (no auth) — see gateway/router/router.go.
async function graphqlRequest(request, { url = '/graphql', query, variables, token }) {
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await request.post(url, {
    data: { query, variables },
    headers,
    failOnStatusCode: false,
  })
  const body = await res.json().catch(() => ({}))
  return { res, body }
}

module.exports = { graphqlRequest }
