class FileHubApp {
    constructor() {
        this.token = localStorage.getItem('token');
        this.user = null;
        this.files = [];
        this.selectedFile = null;
        this.adminAccessCode = 'PROC_LOGS_ADMIN_2024'; // Store admin code for challenges
        this.systemApiKey = 'system-processing-key-2024'; // Store system key
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuth();
        this.loadInitialData();
    }

    setupEventListeners() {
        // File upload
        const fileInput = document.getElementById('fileInput');
        const uploadZone = document.getElementById('uploadZone');

        uploadZone.addEventListener('click', () => fileInput.click());
        uploadZone.addEventListener('dragover', this.handleDragOver.bind(this));
        uploadZone.addEventListener('drop', this.handleDrop.bind(this));
        fileInput.addEventListener('change', this.handleFileSelect.bind(this));

        // Login form
        const loginForm = document.getElementById('loginForm');
        loginForm.addEventListener('submit', this.handleLogin.bind(this));

        // View toggle
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', this.toggleView.bind(this));
        });

        // Escape key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideLogin();
                this.closeActionsPanel();
            }
        });
    }

    async checkAuth() {
        if (this.token) {
            try {
                const response = await fetch('/api/profile', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                
                if (response.ok) {
                    this.user = await response.json();
                    this.showDashboard();
                } else {
                    this.logout();
                }
            } catch (error) {
                console.error('Auth check failed:', error);
                this.logout();
            }
        }
    }

    async loadInitialData() {
        if (this.user) {
            await this.loadFiles();
            this.updateStats();
        }
    }

    showLogin() {
        document.getElementById('loginModal').classList.add('active');
    }

    hideLogin() {
        document.getElementById('loginModal').classList.remove('active');
        // Clear the form fields when closing
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        // Ensure we're showing the proper UI state
        if (!this.token) {
            document.getElementById('loginBtn').style.display = 'block';
            document.getElementById('authInfo').style.display = 'none';
        }
    }

    fillCreds(username, password) {
        document.getElementById('username').value = username;
        document.getElementById('password').value = password;
    }

    async directLogin(username, password) {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            if (response.ok) {
                const data = await response.json();
                this.token = data.token;
                this.user = data.user;
                localStorage.setItem('token', this.token);
                
                this.showDashboard();
                this.showNotification('Welcome back!', 'success');
                
                // Load initial data
                await this.loadFiles();
                this.updateStats();
            } else {
                const error = await response.json();
                this.showNotification(error.message || 'Login failed', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showNotification('Connection error', 'error');
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            if (response.ok) {
                const data = await response.json();
                this.token = data.token;
                this.user = data.user;
                localStorage.setItem('token', this.token);
                
                this.hideLogin();
                this.showDashboard();
                this.showNotification('Welcome back!', 'success');
                
                // Load initial data
                await this.loadFiles();
                this.updateStats();
            } else {
                const error = await response.json();
                this.showNotification(error.message || 'Login failed', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showNotification('Connection error', 'error');
        }
    }

    logout() {
        this.token = null;
        this.user = null;
        this.files = [];
        localStorage.removeItem('token');
        
        document.getElementById('welcomeScreen').style.display = 'block';
        document.getElementById('dashboard').style.display = 'none';
        document.getElementById('authInfo').style.display = 'none';
        document.getElementById('loginBtn').style.display = 'block';
        
        this.showNotification('Logged out successfully', 'info');
    }

    showDashboard() {
        document.getElementById('welcomeScreen').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        document.getElementById('authInfo').style.display = 'flex';
        document.getElementById('loginBtn').style.display = 'none';
        
        // Update user info
        const userBadge = document.getElementById('userBadge');
        const userName = document.getElementById('userName');
        
        userBadge.textContent = this.user.role === 'admin' ? '👑' : '👤';
        userBadge.className = `user-badge ${this.user.role}`;
        userName.textContent = this.user.username;

        // Show admin panel if admin
        if (this.user.role === 'admin') {
            document.getElementById('adminPanel').style.display = 'block';
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    }

    handleDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        
        const files = Array.from(e.dataTransfer.files);
        this.uploadFiles(files);
    }

    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        this.uploadFiles(files);
    }

    async uploadFiles(files) {
        const uploadProgress = document.getElementById('uploadProgress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        
        uploadProgress.style.display = 'block';
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const formData = new FormData();
            formData.append('file', file);

            try {
                progressText.textContent = `Uploading ${file.name}...`;
                progressFill.style.width = `${((i + 1) / files.length) * 100}%`;

                const response = await fetch('/api/upload', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`
                    },
                    body: formData
                });

                if (response.ok) {
                    const result = await response.json();
                    this.showNotification(`${file.name} uploaded successfully`, 'success');
                } else {
                    throw new Error('Upload failed');
                }
            } catch (error) {
                console.error('Upload error:', error);
                this.showNotification(`Failed to upload ${file.name}`, 'error');
            }
        }

        uploadProgress.style.display = 'none';
        await this.loadFiles();
        this.updateStats();
        
        // Clear file input
        document.getElementById('fileInput').value = '';
    }

    async loadFiles() {
        try {
            const response = await fetch('/api/files', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                // Backend returns { files: [...] } format
                this.files = data.files || data;
                this.renderFiles();
            }
        } catch (error) {
            console.error('Failed to load files:', error);
        }
    }

    renderFiles() {
        const fileGrid = document.getElementById('fileGrid');
        
        if (this.files.length === 0) {
            fileGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-folder-open"></i>
                    <h3>No files yet</h3>
                    <p>Upload your first file to get started</p>
                </div>
            `;
            return;
        }

        fileGrid.innerHTML = this.files.map(file => `
            <div class="file-card" data-file-id="${file.id}">
                <div class="file-preview">
                    ${this.getFileIcon(file.originalName)}
                </div>
                <div class="file-info">
                    <h4 class="file-name" title="${file.originalName}">${file.originalName}</h4>
                    <p class="file-meta">
                        <span class="file-size">${this.formatFileSize(file.size)}</span>
                        <span class="file-date">${this.formatDate(file.uploadDate)}</span>
                    </p>
                    <div class="file-status ${file.status}">
                        ${this.getStatusIcon(file.status)} ${file.status}
                    </div>
                </div>
                <div class="file-actions">
                    <button class="action-btn" onclick="app.downloadFile('${file.id}')" title="Download">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="action-btn" onclick="app.processFile('${file.id}')" title="Process">
                        <i class="fas fa-cog"></i>
                    </button>
                    <button class="action-btn danger" onclick="app.deleteFile('${file.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const iconMap = {
            'jpg': 'fas fa-image',
            'jpeg': 'fas fa-image',
            'png': 'fas fa-image',
            'gif': 'fas fa-image',
            'pdf': 'fas fa-file-pdf',
            'csv': 'fas fa-file-csv',
            'xlsx': 'fas fa-file-excel',
            'xls': 'fas fa-file-excel',
            'txt': 'fas fa-file-alt'
        };
        
        return `<i class="${iconMap[ext] || 'fas fa-file'}"></i>`;
    }

    getStatusIcon(status) {
        const iconMap = {
            'uploaded': '<i class="fas fa-cloud-upload-alt"></i>',
            'processing': '<i class="fas fa-spinner fa-spin"></i>',
            'processed': '<i class="fas fa-check-circle"></i>',
            'error': '<i class="fas fa-exclamation-triangle"></i>'
        };
        
        return iconMap[status] || '<i class="fas fa-question-circle"></i>';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }

    updateStats() {
        const totalFiles = this.files.length;
        const processedFiles = this.files.filter(f => f.status === 'processed').length;
        const pendingFiles = this.files.filter(f => f.status === 'uploaded' || f.status === 'processing').length;

        document.getElementById('totalFiles').textContent = totalFiles;
        document.getElementById('processedFiles').textContent = processedFiles;
        document.getElementById('pendingFiles').textContent = pendingFiles;
    }

    async processFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (!file) return;

        try {
            this.showNotification(`Processing ${file.originalName}...`, 'info');
            
            const response = await fetch(`/api/files/${fileId}/process`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const result = await response.json();
                this.showNotification(`${file.originalName} processed successfully`, 'success');
                await this.loadFiles();
                this.updateStats();
            } else {
                throw new Error('Processing failed');
            }
        } catch (error) {
            console.error('Processing error:', error);
            this.showNotification(`Failed to process ${file.originalName}`, 'error');
        }
    }

    async downloadFile(fileId) {
        try {
            const response = await fetch(`/api/files/${fileId}/download`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = this.files.find(f => f.id === fileId)?.originalName || 'download';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Download error:', error);
            this.showNotification('Download failed', 'error');
        }
    }

    async deleteFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (!file) return;

        if (!confirm(`Are you sure you want to delete ${file.originalName}?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/files/${fileId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                this.showNotification(`${file.originalName} deleted`, 'success');
                await this.loadFiles();
                this.updateStats();
            } else {
                throw new Error('Delete failed');
            }
        } catch (error) {
            console.error('Delete error:', error);
            this.showNotification('Delete failed', 'error');
        }
    }

    async refreshFiles() {
        await this.loadFiles();
        this.updateStats();
        this.showNotification('Files refreshed', 'info');
    }

    toggleView(e) {
        const viewType = e.currentTarget.dataset.view;
        const fileGrid = document.getElementById('fileGrid');
        
        // Update active button
        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        e.currentTarget.classList.add('active');
        
        // Update grid class
        fileGrid.className = `file-grid ${viewType}-view`;
    }

    async startChallenge() {
        this.showNotification('Challenge started! Check your network tab for clues...', 'info');
        
        try {
            // Step 1: Start the puzzle
            const response = await fetch('/api/puzzle/start', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.updateChallengeStep(1, `Puzzle started: ${data.message}`);
                
                // Step 2: Get clue from headers
                const clue = response.headers.get('X-Puzzle-Clue');
                if (clue) {
                    this.updateChallengeStep(2, `Clue found in headers: ${clue}`);
                    
                    // Step 3: Decode and find hidden endpoint
                    const decoded = atob(clue);
                    this.updateChallengeStep(3, `Decoded clue: ${decoded}`);
                    
                    // Step 4: Continue with puzzle chain
                    await this.solvePuzzleChain();
                } else {
                    this.updateChallengeStep(2, 'No clue found in headers - check response manually');
                }
            } else {
                const errorData = await response.json();
                console.error('Challenge start failed:', errorData);
                this.showNotification(`Challenge failed: ${errorData.message}`, 'error');
            }
        } catch (error) {
            console.error('Challenge error:', error);
            this.showNotification('Challenge failed to start - check console', 'error');
        }
    }

    async solvePuzzleChain() {
        try {
            // Step 5: Get hidden logs with proper authentication
            this.updateChallengeStep(4, 'Accessing hidden processing logs...');
            
            const logsResponse = await fetch('/api/processing-logs/hidden', {
                headers: { 
                    'Authorization': `Bearer ${this.token}`,
                    'X-System-Key': this.systemApiKey
                }
            });
            
            if (logsResponse.ok) {
                const logs = await logsResponse.json();
                this.updateChallengeStep(5, 'Hidden logs accessed!');
                
                // Decode the Base64 message
                const decoded = atob(logs.encoded);
                console.log('Decoded message:', decoded);
                this.updateChallengeStep(6, `Decoded secret: ${decoded}`);
                
                // Step 6: Final archive key
                this.updateChallengeStep(7, 'Requesting archive key...');
                const keyResponse = await fetch('/api/archive/key', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ solution: logs.encoded })
                });
                
                if (keyResponse.ok) {
                    const result = await keyResponse.json();
                    this.updateChallengeStep(8, `Archive key unlocked: ${result.key}`);
                    
                    // Step 7: Access master archives
                    this.updateChallengeStep(9, 'Accessing master archives...');
                    const archiveResponse = await fetch('/api/archive', {
                        headers: {
                            'Authorization': `Bearer ${this.token}`,
                            'X-Archive-Key': result.key
                        }
                    });
                    
                    if (archiveResponse.ok) {
                        const archiveData = await archiveResponse.json();
                        this.updateChallengeStep(10, `Master access achieved! ${archiveData.masterAccess?.congratulations}`);
                        console.log('Full archive data:', archiveData);
                        this.showNotification('🎉 Challenge completed! Master access unlocked!', 'success');
                    } else {
                        console.log('Archive response:', await archiveResponse.text());
                        this.updateChallengeStep(10, '❌ Failed to access master archives');
                    }
                } else {
                    const errorData = await keyResponse.json();
                    console.log('Archive key error:', errorData);
                    this.updateChallengeStep(8, `❌ Archive key failed: ${errorData.message}`);
                }
            } else {
                const errorData = await logsResponse.json();
                console.log('Hidden logs error:', errorData);
                this.updateChallengeStep(5, `❌ Hidden logs failed: ${errorData.message}`);
            }
        } catch (error) {
            console.error('Puzzle chain error:', error);
            this.showNotification('Puzzle chain error - check console', 'error');
        }
    }

    updateChallengeStep(step, message) {
        // Update step element if it exists
        const stepElement = document.querySelector(`.step[data-step="${step}"]`);
        if (stepElement) {
            stepElement.classList.add('completed');
            const stepInfo = stepElement.querySelector('.step-info p');
            if (stepInfo) {
                stepInfo.textContent = message;
            }
        }
        
        // Always add to results
        const results = document.getElementById('challengeResults');
        if (results) {
            const resultDiv = document.createElement('div');
            resultDiv.className = 'challenge-result';
            resultDiv.innerHTML = `
                <div class="step-indicator">
                    <i class="fas fa-${message.startsWith('❌') ? 'times-circle' : 'check-circle'}"></i>
                    <span>Step ${step}</span>
                </div>
                <div class="step-message">${message}</div>
            `;
            results.appendChild(resultDiv);
            
            // Scroll to latest result
            results.scrollTop = results.scrollHeight;
        }
        
        console.log(`Challenge Step ${step}: ${message}`);
    }

    closeActionsPanel() {
        document.getElementById('actionsPanel').style.display = 'none';
    }

    async clearQueue() {
        if (!confirm('Clear all processing queue items?')) return;
        
        try {
            const response = await fetch('/api/admin/queue/clear', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (response.ok) {
                this.showNotification('Queue cleared', 'success');
                document.getElementById('queueStatus').textContent = '0 jobs';
            }
        } catch (error) {
            console.error('Clear queue error:', error);
            this.showNotification('Failed to clear queue', 'error');
        }
    }

    async viewLogs() {
        try {
            // Try multiple authentication methods
            let response;
            
            // Method 1: Try with JWT token
            response = await fetch('/api/processing-logs', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (!response.ok && response.status === 403) {
                // Method 2: Try with admin access code
                response = await fetch(`/api/processing-logs?access=${this.adminAccessCode}`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
            }
            
            if (!response.ok && response.status === 403) {
                // Method 3: Try with system API key
                response = await fetch('/api/processing-logs', {
                    headers: { 
                        'Authorization': `Bearer ${this.token}`,
                        'X-System-Key': this.systemApiKey
                    }
                });
            }
            
            if (response.ok) {
                const logs = await response.json();
                
                const logWindow = window.open('', '_blank', 'width=800,height=600');
                logWindow.document.write(`
                    <html>
                        <head>
                            <title>Processing Logs</title>
                            <style>
                                body { font-family: monospace; margin: 20px; }
                                pre { background: #f4f4f4; padding: 15px; border-radius: 5px; }
                                .access-level { color: #28a745; font-weight: bold; }
                            </style>
                        </head>
                        <body>
                            <h1>Processing Logs</h1>
                            <p class="access-level">Access Level: ${logs.accessLevel}</p>
                            <pre>${JSON.stringify(logs, null, 2)}</pre>
                        </body>
                    </html>
                `);
            } else {
                const errorData = await response.json();
                this.showNotification('Access denied to processing logs', 'error');
                console.error('Log access error:', errorData);
            }
        } catch (error) {
            console.error('View logs error:', error);
            this.showNotification('Failed to load logs', 'error');
        }
    }

    // Debug function to test authentication tokens
    async testTokens() {
        console.log('🔐 Testing Authentication Methods...');
        console.log('Current JWT Token:', this.token);
        console.log('Admin Access Code:', this.adminAccessCode);
        console.log('System API Key:', this.systemApiKey);
        
        // Test 1: JWT Token
        try {
            const response1 = await fetch('/api/processing-logs', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            console.log('JWT Token Result:', response1.status, await response1.clone().text());
        } catch (e) {
            console.error('JWT Token Error:', e);
        }
        
        // Test 2: Admin Access Code
        try {
            const response2 = await fetch(`/api/processing-logs?access=${this.adminAccessCode}`);
            console.log('Admin Code Result:', response2.status, await response2.clone().text());
        } catch (e) {
            console.error('Admin Code Error:', e);
        }
        
        // Test 3: System API Key
        try {
            const response3 = await fetch('/api/processing-logs', {
                headers: { 'X-System-Key': this.systemApiKey }
            });
            console.log('System Key Result:', response3.status, await response3.clone().text());
        } catch (e) {
            console.error('System Key Error:', e);
        }
        
        this.showNotification('Token tests completed - check console', 'info');
    }

    showNotification(message, type = 'info') {
        const notifications = document.getElementById('notifications');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };
        
        notification.innerHTML = `
            <i class="${icons[type]}"></i>
            <span>${message}</span>
            <button onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        notifications.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
}

// Global functions for onclick handlers
let app;

function showLogin() {
    app.showLogin();
}

function hideLogin() {
    app.hideLogin();
}

function fillCreds(username, password) {
    app.fillCreds(username, password);
}

function logout() {
    app.logout();
}

function refreshFiles() {
    app.refreshFiles();
}

function startChallenge() {
    app.startChallenge();
}

function closeActionsPanel() {
    app.closeActionsPanel();
}

function clearQueue() {
    app.clearQueue();
}

function viewLogs() {
    app.viewLogs();
}

function fillCredsAndLogin(username, password) {
    // Login directly without showing the modal
    app.directLogin(username, password);
}

function testTokens() {
    app.testTokens();
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    app = new FileHubApp();
});