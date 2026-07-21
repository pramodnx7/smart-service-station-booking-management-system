require('dotenv').config();

const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
const accounts = ['admin', 'customer', 'technician'].map((role) => ({
  role,
  email: process.env[`TEST_${role.toUpperCase()}_EMAIL`],
  password: process.env[`TEST_${role.toUpperCase()}_PASSWORD`]
}));

async function readJson(response) {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${response.status} ${payload.message || response.statusText}`);
  }
  return payload;
}

async function check() {
  const health = await readJson(await fetch(`${baseUrl}/api/health`));
  if (!health.ok || health.database !== 'firebase-firestore') {
    throw new Error('The API is running, but Firestore is not connected.');
  }
  console.log('API and Firestore connection: OK');

  const missingCredentials = accounts.filter((account) => !account.email || !account.password).map((account) => account.role);
  if (missingCredentials.length) {
    throw new Error(`Missing test credentials for: ${missingCredentials.join(', ')}.`);
  }

  for (const account of accounts) {
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(account)
    });
    await readJson(loginResponse);
    const cookie = loginResponse.headers.get('set-cookie')?.split(';')[0];
    if (!cookie) throw new Error(`${account.role} login did not establish a secure session cookie.`);
    const headers = { Cookie: cookie };
    await readJson(await fetch(`${baseUrl}/api/auth/session`, { headers }));
    await readJson(await fetch(`${baseUrl}/api/${account.role}/dashboard`, { headers }));
    console.log(`${account.role} authentication and dashboard: OK`);
  }
}

check().catch((error) => {
  console.error(`Connection check failed: ${error.message}`);
  console.error(`Make sure the server is running at ${baseUrl} and TEST_<ROLE>_EMAIL/PASSWORD variables are configured.`);
  process.exitCode = 1;
});
