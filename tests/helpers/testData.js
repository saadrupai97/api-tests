const { config } = require('./env')

// Valid BD mobile prefixes accepted by gateway/utility.FilterPhoneNumber
const VALID_PREFIXES = config.newStudent.phonePrefixes

function randomDigits(n) {
  let out = ''
  for (let i = 0; i < n; i++) out += Math.floor(Math.random() * 10)
  return out
}

function randomBdPhone() {
  const prefix = VALID_PREFIXES[Math.floor(Math.random() * VALID_PREFIXES.length)]
  return `${prefix}${randomDigits(8)}`
}

// Signup payload accepted by /auth/v2/signup: core rejects a student profile without a class ("Class is nil")
// and C9-C12 without a study group.
function newStudentPayload(overrides = {}) {
  const { firstName, class: classCode, studyGroup, vendor } = config.newStudent
  const profile = { first_name: firstName, class: { code: classCode } }
  if (studyGroup) profile.study_group = studyGroup

  return {
    phone: randomBdPhone(),
    type: 'student',
    auth_type: 'signup',
    vendor,
    profile,
    ...overrides,
  }
}

module.exports = { randomBdPhone, randomDigits, newStudentPayload }
