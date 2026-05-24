require('dotenv').config();

const store = require('../src/firestore-store');

store.ensureSeedData()
  .then(() => {
    console.log('Firestore seed data is ready.');
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
