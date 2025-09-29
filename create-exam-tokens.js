const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'file-upload-secret-2024-secure-key-change-in-production';

console.log('Simple JWT Token Generator');
console.log('============================');
console.log('');

// Generate tokens valid for 1 year
const oneYear = 365 * 24 * 60 * 60;

const userToken = jwt.sign(
    { 
        userId: 'examiner', 
        role: 'user' 
    }, 
    JWT_SECRET,
    { expiresIn: oneYear }
);

const adminToken = jwt.sign(
    { 
        userId: 'examiner-admin', 
        role: 'admin' 
    }, 
    JWT_SECRET,
    { expiresIn: oneYear }
);

console.log('👤 USER TOKEN (Valid for 1 year):');
console.log(userToken);
console.log('');
console.log('👑 ADMIN TOKEN (Valid for 1 year):');
console.log(adminToken);
console.log('');
console.log('📝 Usage in requests:');
console.log('Authorization: Bearer ' + userToken);
console.log('');
console.log('💡 These tokens are valid for 1 year for examination purposes.');