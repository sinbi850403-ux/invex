import { hasSessionAccessToken, shouldAttemptProfileLoad } from './auth/session-guards.js';
import { AUTH_REGRESSION_CHECKLIST } from './auth/auth-regression-checklist.js';

function assertEqual(name, actual, expected) {
  const pass = Object.is(actual, expected);
  const icon = pass ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${name}`);
  if (!pass) {
    console.log(`  expected: ${JSON.stringify(expected)}`);
    console.log(`  actual:   ${JSON.stringify(actual)}`);
  }
  return pass;
}

function printChecklist() {
  console.log('=== Auth Regression Checklist ===');
  for (const item of AUTH_REGRESSION_CHECKLIST) {
    const marker = item.automated ? '[auto]' : '[manual]';
    console.log(`- ${item.id} ${marker} ${item.title}`);
    console.log(`  -> ${item.expected}`);
  }
  console.log('');
}

function runAuthGuardRegressionTests() {
  printChecklist();
  console.log('=== Auth Guard Regression Tests ===');

  const cases = [
    {
      id: 'AUTH-001',
      name: 'ctrl+f5 race: user exists but access_token missing => skip profile bootstrap',
      actual: shouldAttemptProfileLoad({ uid: 'u-1' }, { user: { id: 'u-1' } }),
      expected: false,
    },
    {
      id: 'AUTH-002',
      name: 'blank access_token => skip profile bootstrap',
      actual: shouldAttemptProfileLoad({ uid: 'u-1' }, { access_token: '   ' }),
      expected: false,
    },
    {
      id: 'AUTH-003',
      name: 'valid access_token + matching session user id => allow profile load',
      actual: shouldAttemptProfileLoad({ uid: 'u-1' }, { access_token: 'token-123', user: { id: 'u-1' } }),
      expected: true,
    },
    {
      id: 'AUTH-002',
      name: 'uid/session user id mismatch => skip profile load',
      actual: shouldAttemptProfileLoad({ uid: 'u-1' }, { access_token: 'token-123', user: { id: 'u-2' } }),
      expected: false,
    },
    {
      id: 'AUTH-002',
      name: 'missing uid => skip profile bootstrap',
      actual: shouldAttemptProfileLoad({}, { access_token: 'token-123' }),
      expected: false,
    },
    {
      id: 'AUTH-002',
      name: 'access token helper returns false for undefined',
      actual: hasSessionAccessToken(undefined),
      expected: false,
    },
    {
      id: 'AUTH-003',
      name: 'access token helper returns true for non-empty token',
      actual: hasSessionAccessToken({ access_token: 'abc' }),
      expected: true,
    },
  ];

  let passed = 0;
  for (const testCase of cases) {
    if (assertEqual(`${testCase.id} ${testCase.name}`, testCase.actual, testCase.expected)) {
      passed += 1;
    }
  }

  const allPassed = passed === cases.length;
  console.log(`\nResult: ${passed}/${cases.length} passed`);
  if (!allPassed) {
    process.exitCode = 1;
  }
  return allPassed;
}

runAuthGuardRegressionTests();
