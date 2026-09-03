# Password Length Validation Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enforce a single 8–128 character password policy for every password-writing flow without invalidating existing password hashes or exposing plaintext passwords.

**Architecture:** Add one backend password-policy module containing the limits, exact Vietnamese error, validation, and secure temporary-password generation. All HTTP routes and initialization/reset scripts call this module before hashing. Login remains unchanged, so existing accounts continue to authenticate against their current bcrypt hashes. Browser constraints mirror the backend but are never the authority.

**Tech Stack:** Node.js, Express, SQLite/better-sqlite3, bcryptjs, browser JavaScript, repository test harness.

---

### Task 1: Capture current behavior with focused tests

**Files:**
- Create: `test/test-password-policy.js`
- Modify: `package.json`

1. Add API tests proving 7 and 129 characters are rejected with the exact message.
2. Add API tests proving 8, a middle length, and 128 characters are accepted.
3. Cover create account, self-change, admin reset, and temporary-account creation.
4. Insert an existing account with a legacy short password hash and prove login still succeeds.
5. Capture responses and console output and assert supplied plaintext passwords never appear.
6. Run the focused test and confirm it fails for the current 4–6 implementation.

### Task 2: Centralize and enforce backend policy

**Files:**
- Create: `lib/password-policy.js`
- Modify: `routes/auth.js`
- Modify: `routes/quantri.js`
- Modify: `db/init.js`
- Modify: `scripts/dat-lai-mat-khau.js`

1. Export fixed minimum 8, maximum 128, and exact error text.
2. Validate before every bcrypt write; do not add validation to login.
3. Make administrative temporary/reset flows accept an explicit password, hash it, and omit it from responses and audit data.
4. Validate initialization and command-line reset passwords before changing data.
5. Remove plaintext password output from initialization/reset logs.
6. Run focused tests and confirm they pass.

### Task 3: Align browser validation and messages

**Files:**
- Modify: `public/js/man-hinh.js`
- Modify: `public/js/bao-mat.js`
- Modify: `public/admin/quan-tri-he-thong.html`

1. Set password inputs to `type=password`, `minlength=8`, and `maxlength=128`.
2. Display the 8–128 instruction beside each password-writing field.
3. Add immediate field-level validation using the same exact Vietnamese message.
4. Replace generated-password display workflows with explicit administrator password entry and non-secret success messages.
5. Search the repository to ensure no obsolete 4–6 guidance remains.

### Task 4: Update legacy tests for the new creation rule

**Files:**
- Modify: `test/test.js`
- Modify: `test/test-nghiep-vu.js`
- Modify: `test/test-giao-dich.js`
- Modify: `test/test-dai-mang.js`
- Modify: `test/test-phan-quyen-dong.js`
- Modify: any other test that creates accounts through the affected APIs

1. Replace only newly-created short test passwords with valid 8+ character values.
2. Preserve direct legacy-hash fixtures used to demonstrate backward-compatible login.
3. Update assertions that expected a plaintext temporary password in the response.
4. Run the full test suite and correct only regressions caused by the policy change.

### Task 5: Verify and commit

**Files:**
- Review all changed files

1. Run focused password-policy tests.
2. Run lint and typecheck.
3. Run the complete test suite.
4. Run build.
5. Review the diff for password leakage, accidental database changes, and unrelated edits.
6. If every check passes, create one separate commit for this password-policy fix.
