require('dotenv').config();

const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
const accounts = [
  { role: 'admin', email: 'admin@autocare.lk', password: 'admin123' },
  { role: 'customer', email: 'customer@autocare.lk', password: 'customer123' },
  { role: 'technician', email: 'tech@autocare.lk', password: 'tech123' }
];

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

  for (const account of accounts) {
    const login = await readJson(await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(account)
    }));
    const headers = { Authorization: `Bearer ${login.token}` };
    await readJson(await fetch(`${baseUrl}/api/auth/session`, { headers }));
    await readJson(await fetch(`${baseUrl}/api/${account.role}/dashboard`, { headers }));
    console.log(`${account.role} authentication and dashboard: OK`);
  }
}

check().catch((error) => {
  console.error(`Connection check failed: ${error.message}`);
  console.error(`Make sure the server is running at ${baseUrl} and the demo data is seeded.`);
  process.exitCode = 1;
});
