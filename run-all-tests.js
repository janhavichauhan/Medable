#!/usr/bin/env node

/**
 * Comprehensive Test Suite - File Processing API
 * Node.js version of the test suite for cross-platform compatibility
 */

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

// Configuration
const BASE_URL = 'http://localhost:8888';
const USER_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJleGFtaW5lciIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzU5MTI1MzA4LCJleHAiOjE3OTA2NjEzMDh9.sKKGq15lFg4EHKQ3SG8Go4G8cQqPdlZPTTBTw7q52WE';
const ADMIN_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJleGFtaW5lci1hZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc1OTEyNTMwOCwiZXhwIjoxNzkwNjYxMzA4fQ.gv4tXEHiOvUa4m3q_p9zp0lgCbZQg-fgmNw0398Hd_c';

// Test counters
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
let testFileId = null;

// Console colors
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m'
};

function colorLog(message, color = 'white') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function testResult(testName, result, expected = true) {
    totalTests++;
    if (result === expected) {
        colorLog(`✅ PASS: ${testName}`, 'green');
        passedTests++;
    } else {
        colorLog(`❌ FAIL: ${testName}`, 'red');
        failedTests++;
    }
}

function testException(testName, promise, expectedStatus) {
    totalTests++;
    return promise
        .then(() => {
            colorLog(`❌ FAIL: ${testName} - Should have thrown exception`, 'red');
            failedTests++;
        })
        .catch(error => {
            if (error.response && error.response.status === expectedStatus) {
                colorLog(`✅ PASS: ${testName} - Correctly rejected (${expectedStatus})`, 'green');
                passedTests++;
            } else {
                colorLog(`❌ FAIL: ${testName} - Wrong status: ${error.response?.status || 'unknown'}`, 'red');
                failedTests++;
            }
        });
}

async function runTests() {
    colorLog('File Processing API - Comprehensive Test Suite', 'cyan');
    colorLog('=================================================', 'cyan');
    console.log();

    // Check server connectivity
    colorLog('🔍 Checking server connectivity...', 'yellow');
    try {
        await axios.get(BASE_URL, { timeout: 5000 });
        colorLog(`✅ Server is running on ${BASE_URL}`, 'green');
    } catch (error) {
        colorLog('❌ Server is not running. Please start with \'npm run dev\'', 'red');
        process.exit(1);
    }

    console.log();
    colorLog('🔐 AUTHENTICATION TESTS', 'yellow');
    colorLog('========================', 'yellow');

    // Test 1: No Authentication (Should Fail)
    console.log('Test 1: No Authentication (Should Fail)');
    await testException('No Auth Access', 
        axios.get(`${BASE_URL}/api/upload`), 
        401
    );

    // Test 2: User Authentication
    console.log('Test 2: User Authentication');
    try {
        const response = await axios.get(`${BASE_URL}/api/upload`, {
            headers: { 'Authorization': `Bearer ${USER_TOKEN}` }
        });
        testResult('User Authentication', Array.isArray(response.data.files));
        colorLog(`   Found ${response.data.files.length} files`, 'gray');
    } catch (error) {
        testResult('User Authentication', false);
    }

    // Test 3: Admin Authentication
    console.log('Test 3: Admin Authentication');
    try {
        const response = await axios.get(`${BASE_URL}/api/upload/system/queue-status`, {
            headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
        });
        testResult('Admin Authentication', response.data.queue !== undefined);
        colorLog('   Queue status retrieved successfully', 'gray');
    } catch (error) {
        testResult('Admin Authentication', false);
    }

    // Test 4: User Access to Admin Endpoint (Should Fail)
    console.log('Test 4: User Access to Admin Endpoint (Should Fail)');
    await testException('User Admin Access Block',
        axios.get(`${BASE_URL}/api/upload/system/queue-status`, {
            headers: { 'Authorization': `Bearer ${USER_TOKEN}` }
        }),
        403
    );

    console.log();
    colorLog('📁 FILE OPERATIONS TESTS', 'yellow');
    colorLog('=========================', 'yellow');

    // Test 5: File Upload
    console.log('Test 5: File Upload');
    try {
        // Create test file
        const testContent = `Test file content for API testing\\nCreated at: ${new Date()}`;
        fs.writeFileSync('test-upload.txt', testContent);

        // Prepare form data
        const formData = new FormData();
        formData.append('file', fs.createReadStream('test-upload.txt'));

        const response = await axios.post(`${BASE_URL}/api/upload`, formData, {
            headers: {
                'Authorization': `Bearer ${USER_TOKEN}`,
                ...formData.getHeaders()
            }
        });

        testResult('File Upload', response.data.file?.id !== undefined);
        testFileId = response.data.file?.id;
        colorLog(`   File ID: ${testFileId}`, 'gray');
    } catch (error) {
        testResult('File Upload', false);
        colorLog(`   Error: ${error.message}`, 'red');
    }

    // Test 6: Get File Info
    console.log('Test 6: Get File Info');
    if (testFileId) {
        try {
            const response = await axios.get(`${BASE_URL}/api/upload/${testFileId}`, {
                headers: { 'Authorization': `Bearer ${USER_TOKEN}` }
            });
            testResult('Get File Info', response.data.file !== undefined);
            colorLog(`   Original: ${response.data.file.originalName}, Size: ${response.data.file.fileSize}`, 'gray');
        } catch (error) {
            testResult('Get File Info', false);
        }
    } else {
        colorLog('❌ SKIP: Get File Info - No file ID from upload', 'yellow');
    }

    // Test 7: Update File Metadata
    console.log('Test 7: Update File Metadata');
    if (testFileId) {
        try {
            const response = await axios.put(`${BASE_URL}/api/upload/${testFileId}`, 
                { publicAccess: true },
                {
                    headers: { 
                        'Authorization': `Bearer ${USER_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            testResult('Update Metadata', response.data.file.publicAccess === true);
            colorLog(`   Public Access: ${response.data.file.publicAccess}`, 'gray');
        } catch (error) {
            testResult('Update Metadata', false);
        }
    } else {
        colorLog('❌ SKIP: Update Metadata - No file ID', 'yellow');
    }

    console.log();
    colorLog('PUZZLE CHAIN TESTS', 'magenta');
    colorLog('=====================', 'magenta');

    // Puzzle 1: Header Discovery
    console.log('Puzzle 1: Header Discovery');
    try {
        const response = await axios.get(`${BASE_URL}/api/upload`, {
            headers: { 'Authorization': `Bearer ${USER_TOKEN}` }
        });
        const hiddenHeader = response.headers['x-hidden-metadata'];
        testResult('Puzzle 1 - Header Discovery', hiddenHeader !== undefined);
        colorLog(`   🔍 Clue: ${hiddenHeader}`, 'cyan');
    } catch (error) {
        testResult('Puzzle 1 - Header Discovery', false);
    }

    // Puzzle 2a: Processing Logs (Should Fail)
    console.log('Puzzle 2a: Processing Logs Access (Should Fail)');
    await testException('Puzzle 2a - Logs Block',
        axios.get(`${BASE_URL}/api/processing-logs`),
        403
    );

    // Puzzle 2b: Processing Logs with Admin Access
    console.log('Puzzle 2b: Processing Logs Admin Access');
    try {
        const response = await axios.get(`${BASE_URL}/api/processing-logs?access=PROC_LOGS_ADMIN_2024&level=detailed`);
        testResult('Puzzle 2b - Admin Logs', response.data !== undefined);
        if (response.data.nextClue) {
            colorLog(`   🔍 Next Clue: ${response.data.nextClue}`, 'cyan');
        }
    } catch (error) {
        testResult('Puzzle 2b - Admin Logs', false);
    }

    // Puzzle 3: System Access
    console.log('Puzzle 3: System Access');
    try {
        const response = await axios.get(`${BASE_URL}/api/processing-logs?level=full`, {
            headers: { 'X-System-Key': 'system-processing-key-2024' }
        });
        testResult('Puzzle 3 - System Access', response.data.secretHint !== undefined);
        
        if (response.data.secretHint) {
            const decoded = Buffer.from(response.data.secretHint, 'base64').toString('utf-8');
            colorLog(`   🔓 Decoded Secret: ${decoded}`, 'cyan');
        }
    } catch (error) {
        testResult('Puzzle 3 - System Access', false);
    }

    // Puzzle 4: Archive Master Access
    console.log('Puzzle 4: Archive Master Access');
    try {
        const response = await axios.get(`${BASE_URL}/api/archive`, {
            headers: { 'X-Archive-Key': 'ARCHIVE_MASTER_2024' }
        });
        testResult('Puzzle 4 - Archive Master', response.data.masterAccess !== undefined);
        
        if (response.data.masterAccess) {
            colorLog(`   🏆 Achievement: ${response.data.masterAccess.achievementUnlocked}`, 'yellow');
            colorLog(`   🎉 Final Secret: ${response.data.decryptedSecret}`, 'yellow');
        }
    } catch (error) {
        testResult('Puzzle 4 - Archive Master', false);
    }

    console.log();
    colorLog('SECURITY TESTS', 'yellow');
    colorLog('==================', 'yellow');

    // Test 8: Empty File Upload (Should Fail)
    console.log('Test 8: Empty File Upload (Should Fail)');
    try {
        const emptyFormData = new FormData();
        emptyFormData.append('file', Buffer.from(''), { filename: '' });
        
        await axios.post(`${BASE_URL}/api/upload`, emptyFormData, {
            headers: {
                'Authorization': `Bearer ${USER_TOKEN}`,
                ...emptyFormData.getHeaders()
            }
        });
        testResult('Empty File Upload Block', false);
    } catch (error) {
        testResult('Empty File Upload Block', error.response?.status === 400);
    }

    console.log();
    colorLog('CLEANUP', 'yellow');
    colorLog('==========', 'yellow');

    // Cleanup: Delete test file
    console.log('Cleanup: Delete uploaded test file');
    if (testFileId) {
        try {
            const response = await axios.delete(`${BASE_URL}/api/upload/${testFileId}`, {
                headers: { 'Authorization': `Bearer ${USER_TOKEN}` }
            });
            testResult('File Cleanup', response.data.message.includes('deleted'));
            colorLog(`   ${response.data.message}`, 'gray');
        } catch (error) {
            if (error.response?.status === 429) {
                colorLog('⚠️ SKIP: Rate limit reached - file will be cleaned up automatically', 'yellow');
            } else {
                testResult('File Cleanup', false);
            }
        }
    }

    // Remove local test files
    try {
        fs.unlinkSync('test-upload.txt');
    } catch (error) {
        // File doesn't exist, ignore
    }

    console.log();
    colorLog('📊 TEST RESULTS SUMMARY', 'cyan');
    colorLog('========================', 'cyan');
    colorLog(`Total Tests: ${totalTests}`, 'white');
    colorLog(`Passed: ${passedTests}`, 'green');
    colorLog(`Failed: ${failedTests}`, 'red');

    if (failedTests === 0) {
        console.log();
        colorLog('🎉 ALL TESTS PASSED!', 'green');
        colorLog('✅ Authentication working correctly', 'green');
        colorLog('✅ File operations functional', 'green');
        colorLog('✅ All 4 puzzles solved', 'green');
        colorLog('✅ Security measures active', 'green');
        console.log();
        colorLog('🏆 ASSESSMENT REQUIREMENTS FULLY MET!', 'yellow');
    } else {
        console.log();
        colorLog('⚠️ SOME TESTS FAILED', 'red');
        colorLog('Please check the failed tests above', 'yellow');
    }

    console.log();
    colorLog(`Test completed at: ${new Date()}`, 'gray');
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    colorLog(`❌ Uncaught Exception: ${error.message}`, 'red');
    process.exit(1);
});

// Run the tests
runTests().catch(error => {
    colorLog(`❌ Test execution failed: ${error.message}`, 'red');
    process.exit(1);
});