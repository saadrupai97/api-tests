const { expect } = require('@playwright/test')
const { newStudentPayload } = require('./testData')
const { resolveTarget } = require('./env')

const testOtp = () => resolveTarget().otp

// Every REST handler replies with models.HTTPResponse; tokens are nested under "tokens".
async function postJson(request, url, data, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const res = await request.post(url, { data, headers, failOnStatusCode: false })
  const body = await res.json().catch(() => ({}))
  return { res, body }
}

function sendOtp(request, { phone, authType, type = 'student' }) {
  return postJson(request, '/auth/v2/send/sms', { phone, type, auth_type: authType })
}

function verifyOtp(request, { phone, otp = testOtp(), type = 'student' }) {
  return postJson(request, '/auth/v2/verify/otp', { phone, otp, type })
}

function loginWithOtp(request, { phone, otp = testOtp(), type = 'student' }) {
  return postJson(request, '/auth/v2/login', { phone, otp, type })
}

// Real app signup: request an OTP for a new number, then sign up with it.
async function signupStudent(request, overrides = {}) {
  const payload = newStudentPayload(overrides)

  const otp = await sendOtp(request, { phone: payload.phone, authType: 'signup' })
  expect(otp.res.status(), `send/sms failed: ${JSON.stringify(otp.body)}`).toBe(200)

  const { res, body } = await postJson(request, '/auth/v2/signup', { ...payload, otp: testOtp() })
  expect(res.status(), `signup failed: ${JSON.stringify(body)}`).toBe(200)
  expect(body.tokens?.access_token).toBeTruthy()

  return { phone: payload.phone, userId: body.tokens.user_id, tokens: body.tokens, user: body.user }
}

// Logs into config.json environments.<env>.existingStudent without sending an OTP; null when none is set.
function existingStudentConfig() {
  return resolveTarget().existingStudent || { phone: '', otp: '' }
}

async function loginExistingStudent(request) {
  const { phone, otp } = existingStudentConfig()
  if (!phone) return null

  const { res, body } = await loginWithOtp(request, { phone, otp: otp || testOtp() })
  expect(res.status(), `existingStudent login failed: ${JSON.stringify(body)}`).toBe(200)
  return { phone, userId: body.tokens.user_id, tokens: body.tokens }
}

module.exports = { testOtp, postJson, sendOtp, verifyOtp, loginWithOtp, signupStudent, existingStudentConfig, loginExistingStudent }
