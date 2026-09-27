# Shikho API Test Suite: Production Student Flows

Automated API tests (Playwright, **no browser**) for the main student journeys on the Shikho backend.
Every test sends real HTTP / GraphQL requests to the gateway and checks the responses, the same calls
the app makes. Built for QA to run, configure and extend.

**Contents**
1. [Setup](#1-setup)
2. [Running the tests](#2-running-the-tests)
3. [Configuring (`config.json`)](#3-configuring-configjson)
4. [Flow catalogue](#4-flow-catalogue)
5. [Known defects](#5-known-defects-tests-marked-expected-to-fail)
6. [Adding a new test flow](#6-adding-a-new-test-flow)
7. [Changing an existing flow](#7-changing-an-existing-flow)
8. [Gateway behaviour cheat-sheet](#8-gateway-behaviour-cheat-sheet)
9. [Project layout](#9-project-layout)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Setup

### 1.1 Prerequisites

| Need | Check with | Notes |
|---|---|---|
| **Node.js 18 or newer** (LTS recommended) | `node -v` | Install from [nodejs.org](https://nodejs.org) or `brew install node` (macOS) |
| **npm** | `npm -v` | Comes with Node.js |
| **git** + access to the repo | `git --version` | SSH key added to GitHub, or use the HTTPS URL |
| Network access to the target env | open `https://api.shikho.dev/heartbeat` in a browser | Should show `{"message":"Beating","code":200}` |

No browser download is needed: the suite only makes API calls.

### 1.2 Get the code and install

```bash
git clone git@github.com:saadrupai97/api-tests.git
# or: git clone https://github.com/saadrupai97/api-tests.git
cd api-tests
npm ci            # installs the exact versions from package-lock.json (use `npm install` if npm ci fails)
```

### 1.3 First run (about 1 minute)

```bash
npx playwright test --list      # 1. sanity check: should print "Total: 86 tests in 15 files"
npm run test:smoke -- --list    # 2. optional: see the quick smoke set
npm run test:dev                # 3. run everything against dev
npm run report                  # 4. open the HTML report of that run
```

A healthy dev run ends with roughly `78 passed, 8 skipped`. The skips are flows whose data isn't configured
(see §3.3), and "expected to fail" tests are known defects (§5). Neither is a problem.

### 1.4 Before running on stage

1. Confirm with backend that stage accepts the test OTP in `config.json` → `environments.stage.otp`.
2. Start with the read-only run: `npm run test:stage:readonly` (creates no data).
3. Then run the full set: `npm run test:stage`. It creates test accounts, trial enrolments, pending orders and quiz attempts.

### 1.5 Getting updates

```bash
git pull
npm ci            # only needed if package.json / package-lock.json changed
```

> **Production is blocked.** The suite refuses to start if the base URL is `api.shikho.com`, or if the
> URL doesn't match the chosen environment (e.g. a stage URL configured under `dev`).

---

## 2. Running the tests

### 2.1 Pick an environment and run

| Command | What it runs |
|---|---|
| `npm run test:dev` | Everything, against **dev** (`api.shikho.dev`) |
| `npm run test:stage` | Everything, against **stage** (`api.shikho.net`). Creates test accounts, trial enrolments, pending orders and quiz attempts |
| `npm run test:stage:readonly` | Stage, but only tests that create **no data** (validation, auth guards, public catalogue) |
| `npm run test:local` | Everything, against a gateway on `localhost:5005` |
| `npm test` | Everything, against `activeEnv` from `config.json` |

### 2.2 Run a subset

| Goal | Command |
|---|---|
| Quick health check (one happy path per flow) | `npm run test:smoke` |
| Only the existing QA account flow | `npm run test:account` |
| One file | `TEST_ENV=dev npx playwright test tests/exams/practice-quiz.spec.js` |
| One folder | `TEST_ENV=dev npx playwright test tests/auth` |
| Tests whose name matches some text | `TEST_ENV=dev npx playwright test -g "refresh"` |
| Only tests with a tag | `TEST_ENV=dev npx playwright test --grep @smoke` |
| Everything except a tag | `TEST_ENV=dev npx playwright test --grep-invert @mutating` |
| One test at a time (easier to follow) | add `--workers=1` |
| See the list without running | add `--list` |

`test:smoke`, `test:account` and plain `npx playwright test` use `activeEnv` from `config.json`.
Put `TEST_ENV=dev` (or `stage` / `local`) in front of any command to override it.

**Tags**

| Tag | Meaning |
|---|---|
| `@smoke` | The main happy path of a flow. Run these for a quick check |
| `@mutating` | Creates data (accounts, enrolments, orders, quiz attempts). Skipped by `test:stage:readonly` |
| `@existing-account` | Uses the QA account from `config.json` → `existingStudent` |

### 2.3 Interactive mode

```bash
TEST_ENV=dev npm run test:ui
```

This opens Playwright's UI. Pick a test, run it, and click each step to see the exact request and response.

### 2.4 Reading the results

The terminal prints one line per test:

| Symbol | Meaning |
|---|---|
| `✓` passed | The API behaved as expected |
| `✘` failed | The API did not behave as expected. The error shows the expected vs received value |
| `-` skipped | The environment lacks the data this test needs. The reason is printed, e.g. `No free, active course with subjects in this environment` |
| passed, marked "expected to fail" | A **known defect** that is still present (see §5). This is fine |
| "unexpectedly passed" | A known defect has been **fixed**. Remove its `test.fail(...)` line (see §7.4) |

For details after a run:

```bash
npm run report
```

This opens an HTML report in the browser: every test, the failure message and the step where it stopped.
Raw artefacts of failed tests are in `test-results/`.

---

## 3. Configuring (`config.json`)

Every variable lives in **`config.json`** at the project root. To test another environment, a different kind of
student, a specific QA account or specific exam/course ids, change it there. No test file needs editing.

### 3.1 The file, explained

```jsonc
{
  "activeEnv": "local",                         // env used when TEST_ENV isn't given: local | dev | stage

  "environments": {
    "dev": {
      "baseURL": "https://api.shikho.dev",      // gateway URL
      "otp": "1234",                            // OTP that env accepts for any number
      "fixtures": {                             // ids the suite can't find by itself (blank = skip / auto)
        "paidCourseId": "",                     // pin the paid course used for checkout (blank = first paid course found)
        "mcqExamId": "",                        // MCQ exam to open (blank = test skipped)
        "modelTestId": ""                       // model test to open (blank = test skipped)
      }
    },
    "local": { ... }, "stage": { ... }
  },

  "newStudent": {                               // profile of every fresh account the suite signs up
    "firstName": "QA Automation",
    "class": "C8",                              // C8, SSC, HSC, C9V2, ... (ClassEnum)
    "studyGroup": "",                           // REQUIRED when class is C9 / C10 / C11 / C12
    "vendor": "shikho",
    "phonePrefixes": ["017", "013", ...]        // random test numbers start with one of these
  },

  "existingStudent": {                          // a real QA account to run the logged-in checks as
    "phone": "",                                // blank = those tests are skipped
    "otp": ""                                   // blank = use the environment's otp (set it for fixed-OTP accounts)
  },

  "http": {
    "userAgent": "Shikho/(250) 5.12.0 (Android 14; QA Automation)",  // sent on every request
    "browserUserAgent": "Mozilla/5.0 ..."       // used only by the web OTP-throttle test
  },

  "run": { "workers": 4, "timeoutMs": 60000, "retries": 0 }
}
```

(`config.json` itself is plain JSON, so comments are not allowed in the real file.)

### 3.2 Common recipes

| I want to… | Change |
|---|---|
| Run against stage by default | `"activeEnv": "stage"` (or just use `npm run test:stage`) |
| Test as an SSC student instead of Class 8 | `newStudent.class` → `"SSC"` |
| Test as a Class 9 / 10 student | `newStudent.class` → `"C9"`, **and** set `newStudent.studyGroup` to a group valid in that env |
| Check a particular user's data | `existingStudent.phone` → their number (+ `otp` if the account has a fixed OTP), then `npm run test:account` |
| Always buy the same paid course | `environments.<env>.fixtures.paidCourseId` → the course id |
| Test a specific exam / model test | `environments.<env>.fixtures.mcqExamId` / `modelTestId` |
| Stage uses a different test OTP | `environments.stage.otp` |
| Run slower / one at a time | `run.workers` → `1` |
| Slow environment, tests time out | `run.timeoutMs` → e.g. `120000` |
| Retry failures once | `run.retries` → `1` |

### 3.3 How the suite gets its test data

- **Fresh accounts.** Most flows sign up a brand-new student with a random number (send OTP → sign up with the
  env's `otp`). Runs never collide and never rely on leftover data.
- **Discovery.** Flows find their own data through the API: a free course, a paid course, a trial-enabled program,
  a chapter that has MCQ questions. If none exists, the test **skips** with the reason.
- **Fixtures.** Data that can't be discovered comes from `environments.<env>.fixtures`.
- **Existing account.** `existingStudent` runs read-only checks against a real account. Logging in issues new
  tokens, so it can log that account out on the same device type.

### 3.4 Adding a new environment

1. Add a block under `environments` in `config.json` (copy `dev` and change `baseURL` / `otp`).
2. Add its hostname to `ALLOWED_HOSTS` in `tests/helpers/env.js` (this is the safety allowlist).
3. Optionally add an npm script in `package.json`, e.g. `"test:qa2": "TEST_ENV=qa2 playwright test"`.

---

## 4. Flow catalogue

### Student auth: `tests/auth/`, `tests/profile/`
| Spec | Flow | Endpoints | Checks |
|---|---|---|---|
| `signup.spec.js` | Sign up with phone + OTP | `POST /auth/v2/send/sms` → `POST /auth/v2/signup` | tokens + user returned; re-signup = same account; wrong OTP, no OTP requested, missing class, bad phone rejected |
| `login.spec.js` | Log in with OTP | `send/sms` (`login`) → `POST /auth/v2/login` | tokens + auth cookies; wrong OTP / unknown number rejected; no login OTP for unknown number |
| `otp.spec.js` | OTP send / verify / cooldown | `POST /auth/v2/send/sms`, `POST /auth/v2/verify/otp` | send + `next_otp_in_seconds`; verify ok / wrong; 2nd OTP in cooldown → 429; bad `auth_type` / phone; web client burst → 429 |
| `session.spec.js` | Refresh → logout | `POST /auth/v2/token/refresh`, `POST /auth/v2/logout` | new tokens work; old access token revoked; after logout both tokens rejected; missing/bad token rejected |
| `user-check.spec.js` | "Does this number have an account?" | `POST /auth/v2/user/check`, `POST /auth/user_exist` | existing vs unknown number; bad phone |
| `profile.spec.js` | Load own profile | GraphQL `profile` | profile of the logged-in user; 401 without / with a bad token |

### Courses & enrolment: `tests/courses/`
| Spec | Flow | Operations | Checks |
|---|---|---|---|
| `courses.spec.js` | Browse the catalogue (no login) | `/public/graphql` `courses`, `course` | list, `active` / `is_free_course` filters, detail page, unknown id, schema validation |
| `course-subscription.spec.js` | Enrol in a free course | `courses` → `subscribeToFreeCourse` → `courseSubscriptions` | enrolment appears and is active; no duplicate on repeat*; 401 without login; paid course refused |
| `paid-course-checkout.spec.js` | Buy a paid course (up to the payment page) | `initiatePayment` (SSL, bKash) | HTTPS **sandbox** checkout URL from each gateway; invalid coupon; unknown course; 401 |
| `invoice-and-order.spec.js` | Receipt / pay-by-link lookups | `GET /invoice_info/:id`, `GET /payment/:order_id` | unknown invoice → 404; unknown order → invalid |

Completing a payment on the SSL/bKash page and the payment callbacks (IPN) are **not automated**. That needs
sandbox wallet credentials and signed gateway callbacks.

### Learning: `tests/learning/`
| Spec | Flow | Operations | Checks |
|---|---|---|---|
| `academic-program.spec.js` | Browse programs → free trial → lessons | `academicPrograms`, `academicProgram`, `generateFreeTrialEnrolment`, `userEnrolledProgramList`, `programPhasesByStudent`, `studentUpcomingLessons`, `studentSpecificLessons`, `lesson` | trial starts and appears as enrolled; 2nd trial refused; phases/lessons load; lesson opens; 401 |
| `live-classes.spec.js` | Live class list / calendar | `liveClasses` | list + calendar load; 401 |

### Exams: `tests/exams/`
| Spec | Flow | Operations | Checks |
|---|---|---|---|
| `practice-quiz.spec.js` | Practice MCQ quiz | `subjects` → `chapters` → `startPracticeQuizMcqSession` → `getMcqSession` → `submitPracticeQuizMcqSession` → `getPracticeQuizHistory` | quiz starts with questions; submit is final; result in own history and not in others'; other students can't read/submit*; 401; no chapters rejected |
| `scheduled-exams.spec.js` | Program exams (MCQ exam, model test) | `mcqExam`, `modelTest` | opens the configured exam: active + published (fixture-driven) |

### Existing account: `tests/account/`
| Spec | Flow | Checks |
|---|---|---|
| `existing-student.spec.js` | Log in as `existingStudent` | profile, subscriptions, enrolled programs, quiz history, token refresh |

\* Known defect, see §5.

---

## 5. Known defects (tests marked "expected to fail")

These tests describe the **correct** behaviour and are marked `test.fail(...)` with the reason, so the run stays
green while the bug exists. When the bug is fixed, Playwright reports **"unexpectedly passed"**. Then remove the
`test.fail` line (§7.4).

| Test | Defect (found on dev, 2026-09-27) |
|---|---|
| `course-subscription` › does not create a second subscription | Repeating `subscribeToFreeCourse` succeeds again and adds a duplicate subscription row |
| `practice-quiz` › another student cannot read this session | **Security:** any logged-in student can read another student's quiz session by id |
| `practice-quiz` › another student cannot submit this session | **Security:** any student can submit another student's quiz session |
| `practice-quiz` › the history counts the questions actually served | History `total_question` shows 10 even when fewer questions were served |

Also seen, not asserted: free **Live** courses on dev fail `subscribeToFreeCourse` with a date-parsing error, so
the suite prefers recorded (non-Live) free courses. And resubmitting an already-final practice quiz is accepted.

---

## 6. Adding a new test flow

### 6.1 Step by step

1. **Find the real API contract.** Don't guess field names. Use either:
   - **GraphQL introspection** on dev (with any logged-in token). It lists every query/mutation and its arguments:
     ```graphql
     { __schema { mutationType { fields { name args { name } } } } }
     { __type(name: "McqSessionInfoObject") { fields { name } } }
     ```
   - **The backend source:** `gateway/router/router.go` (REST routes + which need login),
     `gateway/schemas/defination/*.go` (GraphQL fields/args), `gateway/resolver/**` (business rules and exact
     error messages).
2. **Try it by hand once** in `npm run test:ui`, or with a quick throwaway test, to see the real response.
3. **Create the spec** in the matching folder: `tests/<area>/<flow-name>.spec.js`. Add a new folder if it's a new area.
4. **Write the steps** with the helpers (§6.3). Use `test.describe.serial` when later steps need data from earlier ones.
5. **Tag it:** `@smoke` on the main happy path, and `@mutating` on anything that creates data. If a `beforeAll`
   signs up a student, put `@mutating` on the whole `describe`.
6. **Handle missing data:** discover data through the API and `test.skip(!data, 'why')` when it isn't there.
   If it can't be discovered, add a fixture (§6.4).
7. **Run it** on dev a few times: `TEST_ENV=dev npx playwright test tests/<area>/<flow-name>.spec.js`.
8. **Add a row** for it to the flow catalogue (§4).

### 6.2 Template: a multi-step flow

```js
const { test, expect } = require('@playwright/test')
const { graphqlRequest } = require('../helpers/graphql')
const { signupStudent } = require('../helpers/auth')

// What flow this is + which resolver/endpoint backs it (one or two lines).

const LIST_QUERY = `query Things { things { data { id name } } }`
const DO_MUTATION = `mutation DoThing($id: String!) { doThing(id: $id) { message } }`

test.describe.serial('Thing flow: list -> do -> verify', { tag: '@mutating' }, () => {
  let student
  let thing

  test.beforeAll(async ({ request }) => {
    student = await signupStudent(request)            // fresh logged-in student
  })

  test('finds a thing', { tag: '@smoke' }, async ({ request }) => {
    const { res, body } = await graphqlRequest(request, { query: LIST_QUERY, token: student.tokens.access_token })

    expect(res.status()).toBe(200)
    thing = body.data.things.data[0]
    test.skip(!thing, 'No thing in this environment')  // skip, don't fail, when data is missing
  })

  test('does the thing', async ({ request }) => {
    test.skip(!thing, 'No thing from the previous step')

    const { res, body } = await graphqlRequest(request, {
      query: DO_MUTATION,
      variables: { id: thing.id },
      token: student.tokens.access_token,
    })

    expect(res.status(), JSON.stringify(body)).toBe(200)  // prints the body if it fails
    expect(body.data.doThing.message).toBe('success')
  })

  test('rejects it without login', async ({ request }) => {
    const { res } = await graphqlRequest(request, { query: DO_MUTATION, variables: { id: 'x' } })

    expect(res.status()).toBe(401)
  })
})
```

### 6.3 Helpers you can use

| Helper | From | Use |
|---|---|---|
| `signupStudent(request)` | `helpers/auth` | New student → `{ phone, userId, tokens, user }` |
| `loginExistingStudent(request)` | `helpers/auth` | Logs in `existingStudent` from config (or `null`) |
| `sendOtp / verifyOtp / loginWithOtp` | `helpers/auth` | Individual auth steps |
| `postJson(request, url, body, token?)` | `helpers/auth` | Any REST POST → `{ res, body }` |
| `graphqlRequest(request, { url?, query, variables?, token? })` | `helpers/graphql` | Any GraphQL call. `url` defaults to `/graphql`; use `/public/graphql` for no-login queries |
| `randomBdPhone()`, `newStudentPayload()` | `helpers/testData` | Random valid number, signup body |
| `fixture('name')` | `helpers/fixtures` | Value of `environments.<env>.fixtures.name` or `null` |
| `config` | `helpers/env` | The whole `config.json` (e.g. `config.newStudent.class`) |

REST GET calls: `await request.get('/path', { failOnStatusCode: false })`.

### 6.4 Adding a new config variable or fixture

- **An id that differs per environment** (a coupon, a batch, an exam): add it under every
  `environments.<env>.fixtures` in `config.json`, then read it with `fixture('myId')` and
  `test.skip(!fixture('myId'), 'Set environments.<env>.fixtures.myId in config.json')`.
- **A setting that's the same everywhere:** add a key to the matching section (`newStudent`, `http`, `run`, or a
  new section) and read it through `const { config } = require('../helpers/env')`.
- Document the new key in §3.1 of this README.

### 6.5 Rules of thumb

- Assert on **exact** values the API promises (status code, message text, ids), not just "not 200".
- Every flow should have at least one negative check: no login, wrong input, or another user's data.
- Never hard-code ids, phones or OTPs in a spec. Discover them, or use `config.json`.
- Keep tests independent across files. Only steps inside one `describe.serial` may share state.

---

## 7. Changing an existing flow

### 7.1 The API changed (field renamed, new required argument)

1. The failing test shows the gateway's message, e.g. `Cannot query field "x"`, or `Expected: 200, Received: 400`
   plus the body.
2. Check the new contract with introspection or the backend source (§6.1).
3. Update the query/mutation constant at the top of the spec. The steps below it usually don't change.
4. If an error message or rule changed on purpose, update the `expect(...)` and the comment above the test.

### 7.2 The expected behaviour changed on purpose

Update the assertion **and** the test title so the title still says what's checked, then update the catalogue (§4).

### 7.3 A new bug is found

Keep the test asserting the **correct** behaviour and add as the first line of the test:

```js
test.fail(true, 'KNOWN DEFECT (<env>, <date>): <one-line description>')
```

Add it to the table in §5, and report it to the owning team.

### 7.4 A known bug was fixed

The run shows **"unexpectedly passed"** for that test. Delete its `test.fail(...)` line and its row in §5.

### 7.5 Moving a flow to a different class / user / dataset

Prefer changing `config.json` (§3.2) over editing specs. Edit a spec only if the flow itself differs.

---

## 8. Gateway behaviour cheat-sheet

- **GraphQL errors come back as HTTP 400** with `{ "message": "...", "code": 400 }`, not as 200 with `errors`.
  Assert on `body.message`.
- **REST tokens are nested:** `{ "code": 200, "tokens": { "access_token", "refresh_token", "user_id", ... } }`.
- **"Not found" from `/auth/v2/user/check` is HTTP 200** with `"code": 404` in the body.
- **Missing or invalid login → HTTP 401.**
- **OTP limits:** one OTP per number per ~2 minutes (429 with `next_otp_in_seconds`). Web browsers are also limited
  per IP + User-Agent (more than 2/min or 10/hour → 429). The app User-Agent used by default is exempt.
- **Student login is OTP-only.** Passwords are only for teacher/employee accounts.
- **Enum values are case-sensitive,** e.g. course `packages` are `Live`, `Video`, `Exam`, not lowercase.

---

## 9. Project layout

```
api-tests/
├── config.json               # ALL settings: environments, OTP, student profile, fixtures, QA account
├── playwright.config.js      # reads config.json; refuses production
├── package.json              # npm scripts (test:dev, test:stage, ...)
└── tests/
    ├── helpers/
    │   ├── env.js            # loads config.json, picks + guards the environment (ALLOWED_HOSTS)
    │   ├── auth.js           # sendOtp / verifyOtp / loginWithOtp / signupStudent / loginExistingStudent / postJson
    │   ├── graphql.js        # graphqlRequest({ url, query, variables, token })
    │   ├── testData.js       # random BD phone, signup payload (from config.newStudent)
    │   └── fixtures.js       # fixture('paidCourseId') from config.json
    ├── auth/  profile/  courses/  learning/  exams/  account/   # one folder per area, one spec per flow
```

---

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Refusing to run against production` | The base URL points at `api.shikho.com`. Not allowed |
| `baseURL host "…" does not belong to "…"` | `TEST_ENV` and `baseURL` don't match. Fix `config.json` or the `TEST_ENV` you passed |
| Everything fails with `ECONNREFUSED` on local | The gateway isn't running on `localhost:5005` |
| Every call returns HTTP 211 / odd HTML on dev | The dev firewall blocked the User-Agent. Keep `http.userAgent` as the app UA |
| Signup/login fails with `invalid credential` | That env doesn't accept the configured `otp`. Ask backend which test OTP the env uses, and set `environments.<env>.otp` |
| Many `429` responses | OTP limits hit. Wait 2 minutes; don't change `http.userAgent` to a browser UA |
| `Class is nil` / study group errors | `newStudent.class` missing, or C9–C12 without `newStudent.studyGroup` |
| Lots of tests skipped | The environment lacks that data (reason printed). Seed it, or set a fixture in `config.json` |
| `existingStudent login failed` | Wrong phone/OTP, or the account has a fixed OTP. Set `existingStudent.otp` |
