// hash.js
const bcrypt = require('bcrypt');

const password = 'testpass123';
bcrypt.hash(password, 10).then(hash => {
    console.log(`Password: ${password}`);
    console.log(`Hashed Password (COPY THIS): ${hash}`);
});