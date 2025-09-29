# Comprehensive Test Suite - File Processing API
# Run this script to test all functionality
# PowerShell script for complete API testing

Write-Host "File Processing API - Comprehensive Test Suite" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$baseUrl = "http://localhost:8888"
$userToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJleGFtaW5lciIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzU5MTI1MzA4LCJleHAiOjE3OTA2NjEzMDh9.sKKGq15lFg4EHKQ3SG8Go4G8cQqPdlZPTTBTw7q52WE"
$adminToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJleGFtaW5lci1hZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc1OTEyNTMwOCwiZXhwIjoxNzkwNjYxMzA4fQ.gv4tXEHiOvUa4m3q_p9zp0lgCbZQg-fgmNw0398Hd_c"

# Test counters
$totalTests = 0
$passedTests = 0
$failedTests = 0

function Test-Result {
    param($testName, $result, $expected = $true)
    $global:totalTests++
    if ($result -eq $expected) {
        Write-Host "✅ PASS: $testName" -ForegroundColor Green
        $global:passedTests++
    } else {
        Write-Host "❌ FAIL: $testName" -ForegroundColor Red
        $global:failedTests++
    }
}

function Test-Exception {
    param($testName, $scriptBlock, $expectedStatus)
    $global:totalTests++
    try {
        & $scriptBlock
        Write-Host "❌ FAIL: $testName - Should have thrown exception" -ForegroundColor Red
        $global:failedTests++
    } catch {
        if ($_.Exception.Response.StatusCode -eq $expectedStatus) {
            Write-Host "✅ PASS: $testName - Correctly rejected ($expectedStatus)" -ForegroundColor Green
            $global:passedTests++
        } else {
            Write-Host "❌ FAIL: $testName - Wrong status: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
            $global:failedTests++
        }
    }
}

# Check if server is running
Write-Host "🔍 Checking server connectivity..." -ForegroundColor Yellow
try {
    $serverCheck = Invoke-WebRequest -Uri $baseUrl -UseBasicParsing -TimeoutSec 5
    Write-Host "✅ Server is running on $baseUrl" -ForegroundColor Green
} catch {
    Write-Host "❌ Server is not running. Please start with 'npm run dev'" -ForegroundColor Red
    Write-Host "Exiting..." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🔐 AUTHENTICATION TESTS" -ForegroundColor Yellow
Write-Host "========================" -ForegroundColor Yellow

# Test 1: No Authentication (Should Fail)
Write-Host "Test 1: No Authentication (Should Fail)"
Test-Exception "No Auth Access" {
    Invoke-RestMethod -Uri "$baseUrl/api/upload" -Method Get
} "Unauthorized"

# Test 2: User Authentication
Write-Host "Test 2: User Authentication"
try {
    $userHeaders = @{ Authorization = "Bearer $userToken" }
    $result = Invoke-RestMethod -Uri "$baseUrl/api/upload" -Method Get -Headers $userHeaders
    Test-Result "User Authentication" ($result.files -is [array])
    Write-Host "   Found $($result.files.Count) files" -ForegroundColor Gray
} catch {
    Test-Result "User Authentication" $false
}

# Test 3: Admin Authentication
Write-Host "Test 3: Admin Authentication"
try {
    $adminHeaders = @{ Authorization = "Bearer $adminToken" }
    $queue = Invoke-RestMethod -Uri "$baseUrl/api/upload/system/queue-status" -Method Get -Headers $adminHeaders
    Test-Result "Admin Authentication" ($queue.queue -ne $null)
    Write-Host "   Queue status retrieved successfully" -ForegroundColor Gray
} catch {
    Test-Result "Admin Authentication" $false
}

# Test 4: User Access to Admin Endpoint (Should Fail)
Write-Host "Test 4: User Access to Admin Endpoint (Should Fail)"
Test-Exception "User Admin Access Block" {
    $userHeaders = @{ Authorization = "Bearer $userToken" }
    Invoke-RestMethod -Uri "$baseUrl/api/upload/system/queue-status" -Method Get -Headers $userHeaders
} "Forbidden"

Write-Host ""
Write-Host "📁 FILE OPERATIONS TESTS" -ForegroundColor Yellow
Write-Host "=========================" -ForegroundColor Yellow

# Test 5: File Upload
Write-Host "Test 5: File Upload"
try {
    # Create test file
    $testContent = "Test file content for API testing`nCreated at: $(Get-Date)"
    $testContent | Out-File -FilePath "test-upload.txt" -Encoding UTF8
    
    # Prepare multipart form data
    $fileBytes = [System.IO.File]::ReadAllBytes("test-upload.txt")
    $boundary = [System.Guid]::NewGuid().ToString()
    $body = "--$boundary`r`nContent-Disposition: form-data; name=`"file`"; filename=`"test-upload.txt`"`r`nContent-Type: text/plain`r`n`r`n$([System.Text.Encoding]::UTF8.GetString($fileBytes))`r`n--$boundary--"
    
    $uploadHeaders = @{
        Authorization = "Bearer $userToken"
        'Content-Type' = "multipart/form-data; boundary=$boundary"
    }
    
    $upload = Invoke-RestMethod -Uri "$baseUrl/api/upload" -Method Post -Headers $uploadHeaders -Body $body
    Test-Result "File Upload" ($upload.file.id -ne $null)
    $global:testFileId = $upload.file.id
    Write-Host "   File ID: $($upload.file.id)" -ForegroundColor Gray
} catch {
    Test-Result "File Upload" $false
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 6: Get File Info
Write-Host "Test 6: Get File Info"
if ($global:testFileId) {
    try {
        $userHeaders = @{ Authorization = "Bearer $userToken" }
        $fileInfo = Invoke-RestMethod -Uri "$baseUrl/api/upload/$($global:testFileId)" -Method Get -Headers $userHeaders
        Test-Result "Get File Info" ($fileInfo.file -ne $null)
        Write-Host "   Original: $($fileInfo.file.originalName), Size: $($fileInfo.file.fileSize)" -ForegroundColor Gray
    } catch {
        Test-Result "Get File Info" $false
    }
} else {
    Write-Host "❌ SKIP: Get File Info - No file ID from upload" -ForegroundColor Yellow
}

# Test 7: Update File Metadata
Write-Host "Test 7: Update File Metadata"
if ($global:testFileId) {
    try {
        $updateHeaders = @{
            Authorization = "Bearer $userToken"
            'Content-Type' = 'application/json'
        }
        $updateData = '{"publicAccess": true}'
        $updated = Invoke-RestMethod -Uri "$baseUrl/api/upload/$($global:testFileId)" -Method Put -Headers $updateHeaders -Body $updateData
        Test-Result "Update Metadata" ($updated.file.publicAccess -eq $true)
        Write-Host "   Public Access: $($updated.file.publicAccess)" -ForegroundColor Gray
    } catch {
        Test-Result "Update Metadata" $false
    }
} else {
    Write-Host "❌ SKIP: Update Metadata - No file ID" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "PUZZLE CHAIN TESTS" -ForegroundColor Magenta
Write-Host "=====================" -ForegroundColor Magenta

# Puzzle 1: Header Discovery
Write-Host "Puzzle 1: Header Discovery"
try {
    $userHeaders = @{ Authorization = "Bearer $userToken" }
    $response = Invoke-WebRequest -Uri "$baseUrl/api/upload" -Method Get -Headers $userHeaders
    $hiddenHeader = $response.Headers['X-Hidden-Metadata']
    Test-Result "Puzzle 1 - Header Discovery" ($hiddenHeader -ne $null)
    Write-Host "   🔍 Clue: $hiddenHeader" -ForegroundColor Cyan
} catch {
    Test-Result "Puzzle 1 - Header Discovery" $false
}

# Puzzle 2a: Processing Logs (Should Fail)
Write-Host "Puzzle 2a: Processing Logs Access (Should Fail)"
Test-Exception "Puzzle 2a - Logs Block" {
    Invoke-RestMethod -Uri "$baseUrl/api/processing-logs" -Method Get
} "Forbidden"

# Puzzle 2b: Processing Logs with Admin Access
Write-Host "Puzzle 2b: Processing Logs Admin Access"
try {
    $logs = Invoke-RestMethod -Uri "$baseUrl/api/processing-logs?access=PROC_LOGS_ADMIN_2024&level=detailed" -Method Get
    Test-Result "Puzzle 2b - Admin Logs" ($logs -ne $null)
    if ($logs.nextClue) {
        Write-Host "   🔍 Next Clue: $($logs.nextClue)" -ForegroundColor Cyan
    }
} catch {
    Test-Result "Puzzle 2b - Admin Logs" $false
}

# Puzzle 3: System Access
Write-Host "Puzzle 3: System Access"
try {
    $systemHeaders = @{ 'X-System-Key' = 'system-processing-key-2024' }
    $system = Invoke-RestMethod -Uri "$baseUrl/api/processing-logs?level=full" -Method Get -Headers $systemHeaders
    Test-Result "Puzzle 3 - System Access" ($system.secretHint -ne $null)
    
    if ($system.secretHint) {
        $decoded = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($system.secretHint))
        Write-Host "   🔓 Decoded Secret: $decoded" -ForegroundColor Cyan
    }
} catch {
    Test-Result "Puzzle 3 - System Access" $false
}

# Puzzle 4: Archive Master Access
Write-Host "Puzzle 4: Archive Master Access"
try {
    $archiveHeaders = @{ 'X-Archive-Key' = 'ARCHIVE_MASTER_2024' }
    $archive = Invoke-RestMethod -Uri "$baseUrl/api/archive" -Method Get -Headers $archiveHeaders
    Test-Result "Puzzle 4 - Archive Master" ($archive.masterAccess -ne $null)
    
    if ($archive.masterAccess) {
        Write-Host "   🏆 Achievement: $($archive.masterAccess.achievementUnlocked)" -ForegroundColor Yellow
        Write-Host "   🎉 Final Secret: $($archive.decryptedSecret)" -ForegroundColor Yellow
    }
} catch {
    Test-Result "Puzzle 4 - Archive Master" $false
}

Write-Host ""
Write-Host "SECURITY TESTS" -ForegroundColor Yellow
Write-Host "==================" -ForegroundColor Yellow

# Test 8: Empty File Upload (Should Fail)
Write-Host "Test 8: Empty File Upload (Should Fail)"
try {
    $emptyHeaders = @{
        Authorization = "Bearer $userToken"
        'Content-Type' = "multipart/form-data; boundary=test"
    }
    $emptyBody = "--test`r`nContent-Disposition: form-data; name=`"file`"; filename=`"`"`r`n`r`n`r`n--test--"
    Invoke-RestMethod -Uri "$baseUrl/api/upload" -Method Post -Headers $emptyHeaders -Body $emptyBody
    Test-Result "Empty File Upload Block" $false
} catch {
    Test-Result "Empty File Upload Block" ($_.Exception.Response.StatusCode -eq "BadRequest")
}

Write-Host ""
Write-Host "CLEANUP" -ForegroundColor Yellow
Write-Host "==========" -ForegroundColor Yellow

# Cleanup: Delete test file
Write-Host "Cleanup: Delete uploaded test file"
if ($global:testFileId) {
    try {
        $userHeaders = @{ Authorization = "Bearer $userToken" }
        $deleted = Invoke-RestMethod -Uri "$baseUrl/api/upload/$($global:testFileId)" -Method Delete -Headers $userHeaders
        Test-Result "File Cleanup" ($deleted.message -like "*deleted*")
        Write-Host "   $($deleted.message)" -ForegroundColor Gray
    } catch {
        if ($_.Exception.Response.StatusCode -eq "TooManyRequests") {
            Write-Host "⚠️ SKIP: Rate limit reached - file will be cleaned up automatically" -ForegroundColor Yellow
        } else {
            Test-Result "File Cleanup" $false
        }
    }
}

# Remove local test files
Remove-Item "test-upload.txt" -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "📊 TEST RESULTS SUMMARY" -ForegroundColor Cyan -BackgroundColor Black
Write-Host "========================" -ForegroundColor Cyan
Write-Host "Total Tests: $totalTests" -ForegroundColor White
Write-Host "Passed: $passedTests" -ForegroundColor Green
Write-Host "Failed: $failedTests" -ForegroundColor Red

if ($failedTests -eq 0) {
    Write-Host ""
    Write-Host "🎉 ALL TESTS PASSED!" -ForegroundColor Green -BackgroundColor Black
    Write-Host "✅ Authentication working correctly" -ForegroundColor Green
    Write-Host "✅ File operations functional" -ForegroundColor Green
    Write-Host "✅ All 4 puzzles solved" -ForegroundColor Green
    Write-Host "✅ Security measures active" -ForegroundColor Green
    Write-Host ""
    Write-Host "🏆 ASSESSMENT REQUIREMENTS FULLY MET!" -ForegroundColor Yellow -BackgroundColor Black
} else {
    Write-Host ""
    Write-Host "⚠️ SOME TESTS FAILED" -ForegroundColor Red -BackgroundColor Black
    Write-Host "Please check the failed tests above" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Test completed at: $(Get-Date)" -ForegroundColor Gray