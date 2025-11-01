// Password Manager
class PasswordManager {
    constructor() {
        this.encodedPassword = this.encodePassword('29485255QWERtT1!');
        this.adminLoggedIn = false;
    }

    encodePassword(password) {
        return btoa(unescape(encodeURIComponent(password + 'SALT_ArBrowser_2025')));
    }

    verifyPassword(input) {
        const encodedInput = this.encodePassword(input);
        return encodedInput === this.encodedPassword;
    }

    setLoggedIn(status) {
        this.adminLoggedIn = status;
        localStorage.setItem('adminSession', status ? 'true' : 'false');
    }

    isLoggedIn() {
        return localStorage.getItem('adminSession') === 'true';
    }
}

const passwordManager = new PasswordManager();

// User Management
class UserManager {
    constructor() {
        this.currentUser = null;
    }

    register(email, firstName, lastName, password) {
        const users = JSON.parse(localStorage.getItem('users')) || [];
        
        if (users.find(user => user.email === email)) {
            throw new Error('Пользователь с таким email уже существует');
        }

        const user = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            email,
            firstName,
            lastName,
            password: btoa(unescape(encodeURIComponent(password + 'USER_SALT'))),
            registeredAt: new Date().toISOString(),
            notifications: [],
            notificationPermission: false
        };

        users.push(user);
        localStorage.setItem('users', JSON.stringify(users));
        
        return user;
    }

    login(email, password) {
        const users = JSON.parse(localStorage.getItem('users')) || [];
        const encodedPassword = btoa(unescape(encodeURIComponent(password + 'USER_SALT')));
        const user = users.find(u => u.email === email && u.password === encodedPassword);
        
        if (user) {
            this.currentUser = user;
            localStorage.setItem('currentUser', JSON.stringify(user));
            return user;
        }
        
        throw new Error('Неверный email или пароль');
    }

    logout() {
        this.currentUser = null;
        localStorage.removeItem('currentUser');
    }

    getCurrentUser() {
        if (!this.currentUser) {
            const stored = localStorage.getItem('currentUser');
            this.currentUser = stored ? JSON.parse(stored) : null;
        }
        return this.currentUser;
    }

    updateUser(userId, updates) {
        const users = JSON.parse(localStorage.getItem('users')) || [];
        const userIndex = users.findIndex(u => u.id === userId);
        
        if (userIndex !== -1) {
            users[userIndex] = { ...users[userIndex], ...updates };
            localStorage.setItem('users', JSON.stringify(users));
            
            if (this.currentUser && this.currentUser.id === userId) {
                this.currentUser = users[userIndex];
                localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
            }
            
            return users[userIndex];
        }
    }

    addNotification(userId, notification) {
        const users = JSON.parse(localStorage.getItem('users')) || [];
        const userIndex = users.findIndex(u => u.id === userId);
        
        if (userIndex !== -1) {
            if (!users[userIndex].notifications) {
                users[userIndex].notifications = [];
            }
            
            const newNotification = {
                id: Date.now() + Math.random().toString(36).substr(2, 9),
                title: notification.title,
                message: notification.message,
                type: notification.type || 'info',
                read: false,
                createdAt: new Date().toISOString(),
                applicationId: notification.applicationId,
                adminComment: notification.adminComment
            };
            
            users[userIndex].notifications.unshift(newNotification);
            localStorage.setItem('users', JSON.stringify(users));
            
            if (this.currentUser && this.currentUser.id === userId) {
                this.currentUser = users[userIndex];
                localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
            }
            
            return newNotification;
        }
    }

    markNotificationAsRead(userId, notificationId) {
        const users = JSON.parse(localStorage.getItem('users')) || [];
        const userIndex = users.findIndex(u => u.id === userId);
        
        if (userIndex !== -1 && users[userIndex].notifications) {
            const notificationIndex = users[userIndex].notifications.findIndex(n => n.id === notificationId);
            if (notificationIndex !== -1) {
                users[userIndex].notifications[notificationIndex].read = true;
                localStorage.setItem('users', JSON.stringify(users));
                
                if (this.currentUser && this.currentUser.id === userId) {
                    this.currentUser = users[userIndex];
                    localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
                }
            }
        }
    }
}

const userManager = new UserManager();

// Notification Manager
class NotificationManager {
    constructor() {
        this.notificationSupport = 'Notification' in window;
    }

    async requestPermission() {
        if (!this.notificationSupport) {
            console.log('Браузер не поддерживает уведомления');
            return false;
        }

        try {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        } catch (error) {
            console.error('Ошибка запроса разрешения:', error);
            return false;
        }
    }

    showBrowserNotification(title, message) {
        if (!this.notificationSupport || Notification.permission !== 'granted') {
            return;
        }

        new Notification(title, {
            body: message,
            icon: '/favicon.ico',
            tag: 'arbrowser-notification'
        });
    }

    sendEmailNotification(email, subject, message) {
        console.log('Отправка email:', { email, subject, message });
        const emails = JSON.parse(localStorage.getItem('pendingEmails')) || [];
        emails.push({ email, subject, message, timestamp: new Date().toISOString() });
        localStorage.setItem('pendingEmails', JSON.stringify(emails));
    }
}

const notificationManager = new NotificationManager();

// Application Manager
class ApplicationManager {
    submitBetaApplication(data, userId) {
        const applications = JSON.parse(localStorage.getItem('betaApplications')) || [];
        const application = {
            ...data,
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            userId: userId,
            status: 'pending',
            submittedAt: new Date().toISOString(),
            adminComment: null
        };

        applications.push(application);
        localStorage.setItem('betaApplications', JSON.stringify(applications));
        return application;
    }

    submitDevApplication(data, userId) {
        const applications = JSON.parse(localStorage.getItem('devApplications')) || [];
        const application = {
            ...data,
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            userId: userId,
            status: 'pending',
            submittedAt: new Date().toISOString(),
            adminComment: null
        };

        applications.push(application);
        localStorage.setItem('devApplications', JSON.stringify(applications));
        return application;
    }

    updateApplicationStatus(applicationId, type, status, adminComment = null) {
        const storageKey = type === 'beta' ? 'betaApplications' : 'devApplications';
        const applications = JSON.parse(localStorage.getItem(storageKey)) || [];
        const applicationIndex = applications.findIndex(app => app.id === applicationId);
        
        if (applicationIndex !== -1) {
            applications[applicationIndex].status = status;
            applications[applicationIndex].adminComment = adminComment;
            applications[applicationIndex].processedAt = new Date().toISOString();
            localStorage.setItem(storageKey, JSON.stringify(applications));
            
            return applications[applicationIndex];
        }
    }

    getApplicationsByUserId(userId) {
        const betaApps = JSON.parse(localStorage.getItem('betaApplications')) || [];
        const devApps = JSON.parse(localStorage.getItem('devApplications')) || [];
        
        return {
            beta: betaApps.filter(app => app.userId === userId),
            dev: devApps.filter(app => app.userId === userId)
        };
    }
}

const applicationManager = new ApplicationManager();

// Global variables for admin actions
let currentCommentAppId = null;
let currentCommentAppType = null;
let currentCommentIsRejection = false;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    // Preloader
    const preloader = document.querySelector('.preloader');
    const content = document.querySelector('.content');
    const percentage = document.querySelector('.loader-percentage');
    
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 10;
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            
            setTimeout(() => {
                preloader.style.opacity = '0';
                setTimeout(() => {
                    preloader.style.display = 'none';
                    content.classList.remove('hidden');
                    content.style.opacity = '1';
                    
                    checkAuthStatus();
                    if (passwordManager.isLoggedIn()) {
                        showAdminPanel();
                    }
                }, 500);
            }, 500);
        }
        percentage.textContent = Math.min(progress, 100).toFixed(0) + '%';
    }, 100);

    // Initialize event listeners
    initializeEventListeners();
    
    // Initialize secret admin combo
    initializeSecretAdminCombo();
}

function initializeSecretAdminCombo() {
    let keySequence = [];
    const secretCode = '1337';
    
    document.addEventListener('keydown', function(e) {
        keySequence.push(e.key);
        if (keySequence.length > secretCode.length) {
            keySequence.shift();
        }
        
        if (keySequence.join('') === secretCode) {
            showAdminLogin();
            keySequence = [];
        }
    });
}

function initializeEventListeners() {
    // Auth tabs
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            
            this.classList.add('active');
            document.getElementById(tabName + 'Form').classList.add('active');
        });
    });

    // Auth forms
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    
    // Navigation auth
    document.getElementById('navAuthBtn').addEventListener('click', showAuthModal);
    document.getElementById('userLogout').addEventListener('click', handleLogout);
    document.getElementById('notificationsBtn').addEventListener('click', toggleNotifications);

    // Application buttons
    document.querySelectorAll('.beta-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const user = userManager.getCurrentUser();
            if (!user) {
                showAuthModal();
                return;
            }
            document.getElementById('betaModal').style.display = 'block';
        });
    });

    document.querySelectorAll('.dev-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const user = userManager.getCurrentUser();
            if (!user) {
                showAuthModal();
                return;
            }
            document.getElementById('devModal').style.display = 'block';
        });
    });

    // Application forms
    document.getElementById('betaForm').addEventListener('submit', handleBetaApplication);
    document.getElementById('devForm').addEventListener('submit', handleDevApplication);

    // Notification system
    document.getElementById('enableNotifications').addEventListener('click', enableNotifications);
    document.getElementById('skipNotifications').addEventListener('click', skipNotifications);
    document.querySelector('.close-notifications').addEventListener('click', closeNotifications);

    // Admin system
    document.getElementById('logoutBtn').addEventListener('click', handleAdminLogout);
    document.getElementById('saveContent').addEventListener('click', saveContent);

    // Modal close handlers
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            this.closest('.modal').style.display = 'none';
        });
    });

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.style.display = 'none';
            }
        });
    });

    // Tab system
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            this.classList.add('active');
            document.getElementById(tabId + 'Tab').classList.add('active');
            
            if (tabId === 'users') {
                loadUsersList();
            }
        });
    });

    // Smooth scrolling
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Navbar scroll effect
    window.addEventListener('scroll', () => {
        const navbar = document.querySelector('.navbar');
        if (window.scrollY > 100) {
            navbar.style.background = 'rgba(255, 255, 255, 0.98)';
            navbar.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.1)';
        } else {
            navbar.style.background = 'rgba(255, 255, 255, 0.95)';
            navbar.style.boxShadow = 'none';
        }
    });

    // Auto-logout after 1 hour
    setTimeout(() => {
        if (passwordManager.isLoggedIn()) {
            passwordManager.setLoggedIn(false);
            if (document.getElementById('adminPanel') && !document.getElementById('adminPanel').classList.contains('hidden')) {
                hideAdminPanel();
                alert('Сессия истекла. Пожалуйста, войдите снова.');
            }
        }
    }, 3600000);
}

// Auth functions
function checkAuthStatus() {
    const user = userManager.getCurrentUser();
    if (user) {
        showUserMenu(user);
        if (!user.notificationPermission && Notification.permission === 'default') {
            setTimeout(() => {
                document.getElementById('notificationModal').style.display = 'block';
            }, 2000);
        }
    } else {
        showAuthButton();
    }
}

function showAuthModal() {
    document.getElementById('authModal').style.display = 'block';
}

function showUserMenu(user) {
    document.getElementById('navAuthBtn').classList.add('hidden');
    document.getElementById('userMenu').classList.remove('hidden');
    document.getElementById('userName').textContent = `${user.firstName} ${user.lastName}`;
    
    const unreadCount = user.notifications ? user.notifications.filter(n => !n.read).length : 0;
    const notificationsBtn = document.getElementById('notificationsBtn');
    notificationsBtn.textContent = unreadCount > 0 ? `🔔 (${unreadCount})` : '🔔';
}

function showAuthButton() {
    document.getElementById('navAuthBtn').classList.remove('hidden');
    document.getElementById('userMenu').classList.add('hidden');
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const user = userManager.login(email, password);
        showUserMenu(user);
        document.getElementById('authModal').style.display = 'none';
        e.target.reset();
        
        if (Notification.permission === 'default') {
            setTimeout(() => {
                document.getElementById('notificationModal').style.display = 'block';
            }, 1000);
        }
    } catch (error) {
        alert(error.message);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('regEmail').value;
    const firstName = document.getElementById('regFirstName').value;
    const lastName = document.getElementById('regLastName').value;
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;

    if (password !== confirmPassword) {
        alert('Пароли не совпадают');
        return;
    }

    if (password.length < 6) {
        alert('Пароль должен содержать минимум 6 символов');
        return;
    }

    try {
        const user = userManager.register(email, firstName, lastName, password);
        showUserMenu(user);
        document.getElementById('authModal').style.display = 'none';
        e.target.reset();
        alert('Регистрация успешна!');
        
        setTimeout(() => {
            document.getElementById('notificationModal').style.display = 'block';
        }, 1000);
    } catch (error) {
        alert(error.message);
    }
}

function handleLogout() {
    userManager.logout();
    showAuthButton();
    closeNotifications();
}

// Notification functions
async function enableNotifications() {
    const permissionGranted = await notificationManager.requestPermission();
    
    if (permissionGranted) {
        const user = userManager.getCurrentUser();
        if (user) {
            userManager.updateUser(user.id, { notificationPermission: true });
        }
        alert('Уведомления разрешены!');
    } else {
        alert('Для получения уведомлений необходимо разрешить их в настройках браузера');
    }
    
    document.getElementById('notificationModal').style.display = 'none';
}

function skipNotifications() {
    document.getElementById('notificationModal').style.display = 'none';
}

function toggleNotifications() {
    const notificationsPanel = document.getElementById('userNotifications');
    if (notificationsPanel.classList.contains('hidden')) {
        showNotifications();
    } else {
        closeNotifications();
    }
}

function showNotifications() {
    const user = userManager.getCurrentUser();
    if (!user) return;

    const notificationsList = document.getElementById('notificationsList');
    notificationsList.innerHTML = '';

    if (!user.notifications || user.notifications.length === 0) {
        notificationsList.innerHTML = '<p>У вас пока нет уведомлений</p>';
    } else {
        user.notifications.forEach(notification => {
            const notificationElement = document.createElement('div');
            notificationElement.className = `notification-item ${notification.type} ${notification.read ? '' : 'unread'}`;
            notificationElement.innerHTML = `
                <div class="notification-header">
                    <div class="notification-title">${notification.title}</div>
                    <div class="notification-time">${new Date(notification.createdAt).toLocaleDateString()}</div>
                </div>
                <div class="notification-message">${notification.message}</div>
                ${notification.adminComment ? `<div class="admin-comment"><strong>Комментарий администратора:</strong> ${notification.adminComment}</div>` : ''}
            `;
            
            notificationElement.addEventListener('click', () => {
                userManager.markNotificationAsRead(user.id, notification.id);
                notificationElement.classList.remove('unread');
                const unreadCount = user.notifications.filter(n => !n.read).length - 1;
                document.getElementById('notificationsBtn').textContent = unreadCount > 0 ? `🔔 (${unreadCount})` : '🔔';
            });
            
            notificationsList.appendChild(notificationElement);
        });
    }

    document.getElementById('userNotifications').classList.remove('hidden');
}

function closeNotifications() {
    document.getElementById('userNotifications').classList.add('hidden');
}

// Application functions
function handleBetaApplication(e) {
    e.preventDefault();
    const user = userManager.getCurrentUser();
    if (!user) {
        alert('Пожалуйста, войдите в систему');
        return;
    }

    const formData = {
        email: document.getElementById('email').value,
        firstName: document.getElementById('firstName').value,
        lastName: document.getElementById('lastName').value,
        reason: document.getElementById('reason').value
    };

    try {
        const application = applicationManager.submitBetaApplication(formData, user.id);
        
        userManager.addNotification(user.id, {
            title: 'Заявка на бета-тестирование отправлена',
            message: 'Ваша заявка на бета-тестирование ArBrowser успешно отправлена и находится на рассмотрении.',
            type: 'success',
            applicationId: application.id
        });

        notificationManager.showBrowserNotification(
            'Заявка отправлена',
            'Ваша заявка на бета-тестирование успешно отправлена!'
        );

        alert('Заявка отправлена! Мы уведомим вас о решении.');
        e.target.reset();
        document.getElementById('betaModal').style.display = 'none';
        
        showUserMenu(userManager.getCurrentUser());
    } catch (error) {
        alert('Ошибка при отправке заявки: ' + error.message);
    }
}

function handleDevApplication(e) {
    e.preventDefault();
    const user = userManager.getCurrentUser();
    if (!user) {
        alert('Пожалуйста, войдите в систему');
        return;
    }

    const formData = {
        email: document.getElementById('devEmail').value,
        firstName: document.getElementById('devFirstName').value,
        lastName: document.getElementById('devLastName').value,
        role: document.getElementById('devRole').value,
        experience: document.getElementById('devExperience').value,
        skills: document.getElementById('devSkills').value,
        motivation: document.getElementById('devMotivation').value,
        portfolio: document.getElementById('devPortfolio').value
    };

    try {
        const application = applicationManager.submitDevApplication(formData, user.id);
        
        userManager.addNotification(user.id, {
            title: 'Заявка в команду отправлена',
            message: 'Ваша заявка на участие в команде разработки ArBrowser успешно отправлена и находится на рассмотрении.',
            type: 'success',
            applicationId: application.id
        });

        notificationManager.showBrowserNotification(
            'Заявка отправлена',
            'Ваша заявка в команду разработки успешно отправлена!'
        );

        alert('Заявка отправлена! Мы рассмотрим вашу кандидатуру и свяжемся с вами.');
        e.target.reset();
        document.getElementById('devModal').style.display = 'none';
        
        showUserMenu(userManager.getCurrentUser());
    } catch (error) {
        alert('Ошибка при отправке заявки: ' + error.message);
    }
}

// Admin functions
function showAdminLogin() {
    const loginModal = document.createElement('div');
    loginModal.className = 'login-modal';
    loginModal.innerHTML = `
        <div class="login-content">
            <h2>Вход в админ панель</h2>
            <form class="login-form" id="adminLoginForm">
                <input type="password" id="adminPassword" placeholder="Введите пароль" required>
                <div class="error-message" id="loginError">Неверный пароль!</div>
                <button type="submit">Войти</button>
            </form>
        </div>
    `;
    document.body.appendChild(loginModal);

    loginModal.style.display = 'block';

    document.getElementById('adminLoginForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const password = document.getElementById('adminPassword').value;
        const errorElement = document.getElementById('loginError');
        
        if (passwordManager.verifyPassword(password)) {
            passwordManager.setLoggedIn(true);
            loginModal.style.display = 'none';
            document.body.removeChild(loginModal);
            showAdminPanel();
        } else {
            errorElement.style.display = 'block';
        }
    });

    loginModal.addEventListener('click', (e) => {
        if (e.target === loginModal) {
            loginModal.style.display = 'none';
            document.body.removeChild(loginModal);
        }
    });
}

function showAdminPanel() {
    document.querySelector('.content').classList.add('hidden');
    document.getElementById('adminPanel').classList.remove('hidden');
    loadApplications();
    loadContent();
}

function hideAdminPanel() {
    document.getElementById('adminPanel').classList.add('hidden');
    document.querySelector('.content').classList.remove('hidden');
}

function handleAdminLogout() {
    passwordManager.setLoggedIn(false);
    hideAdminPanel();
}

function loadApplications() {
    loadBetaApplications();
    loadDevApplications();
}

function loadBetaApplications() {
    const applications = JSON.parse(localStorage.getItem('betaApplications')) || [];
    const applicationsList = document.getElementById('betaApplications');
    applicationsList.innerHTML = '';
    
    if (applications.length === 0) {
        applicationsList.innerHTML = '<p>Бета-заявок пока нет</p>';
        return;
    }
    
    applications.forEach((app, index) => {
        const user = getUserById(app.userId);
        const appElement = document.createElement('div');
        appElement.className = 'application-item';
        appElement.innerHTML = `
            <h4>Бета-заявка #${index + 1} <span class="status-badge status-${app.status}">${getStatusText(app.status)}</span></h4>
            <p><strong>ID:</strong> ${app.id}</p>
            <p><strong>Пользователь:</strong> ${user ? `${user.firstName} ${user.lastName} (${user.email})` : 'N/A'}</p>
            <p><strong>Имя:</strong> ${app.firstName} ${app.lastName}</p>
            <p><strong>Email:</strong> ${app.email}</p>
            <p><strong>Причина:</strong> ${app.reason}</p>
            <p><strong>Время подачи:</strong> ${new Date(app.submittedAt).toLocaleString()}</p>
            ${app.adminComment ? `<p><strong>Комментарий админа:</strong> ${app.adminComment}</p>` : ''}
            ${app.status === 'pending' ? `
                <div class="action-buttons">
                    <button class="approve-btn" onclick="adminApproveApplication('${app.id}', 'beta')">Одобрить</button>
                    <button class="reject-btn" onclick="adminRejectApplication('${app.id}', 'beta')">Отклонить</button>
                    <button class="comment-btn" onclick="adminShowCommentModal('${app.id}', 'beta')">Комментарий</button>
                </div>
            ` : ''}
            <button class="delete-btn" onclick="adminDeleteApplication('${app.id}', 'beta')">Удалить</button>
        `;
        applicationsList.appendChild(appElement);
    });
}

function loadDevApplications() {
    const applications = JSON.parse(localStorage.getItem('devApplications')) || [];
    const applicationsList = document.getElementById('devApplications');
    applicationsList.innerHTML = '';
    
    if (applications.length === 0) {
        applicationsList.innerHTML = '<p>Заявок в команду пока нет</p>';
        return;
    }
    
    const roleNames = {
        'frontend': 'Frontend разработчик',
        'backend': 'Backend разработчик', 
        'fullstack': 'Fullstack разработчик',
        'designer': 'UI/UX дизайнер',
        'qa': 'QA инженер',
        'devops': 'DevOps инженер',
        'marketing': 'Маркетолог',
        'other': 'Другое'
    };
    
    applications.forEach((app, index) => {
        const user = getUserById(app.userId);
        const appElement = document.createElement('div');
        appElement.className = 'application-item';
        appElement.innerHTML = `
            <h4>Заявка в команду #${index + 1} <span class="status-badge status-${app.status}">${getStatusText(app.status)}</span></h4>
            <p><strong>ID:</strong> ${app.id}</p>
            <p><strong>Пользователь:</strong> ${user ? `${user.firstName} ${user.lastName} (${user.email})` : 'N/A'}</p>
            <p><strong>Имя:</strong> ${app.firstName} ${app.lastName}</p>
            <p><strong>Email:</strong> ${app.email}</p>
            <p><strong>Роль:</strong> <span class="role-badge ${app.role}">${roleNames[app.role] || app.role}</span></p>
            <p><strong>Опыт:</strong> ${app.experience} лет</p>
            <p><strong>Навыки:</strong> ${app.skills}</p>
            <p><strong>Мотивация:</strong> ${app.motivation}</p>
            ${app.portfolio ? `<p><strong>Портфолио:</strong> <a href="${app.portfolio}" target="_blank">${app.portfolio}</a></p>` : ''}
            <p><strong>Время подачи:</strong> ${new Date(app.submittedAt).toLocaleString()}</p>
            ${app.adminComment ? `<p><strong>Комментарий админа:</strong> ${app.adminComment}</p>` : ''}
            ${app.status === 'pending' ? `
                <div class="action-buttons">
                    <button class="approve-btn" onclick="adminApproveApplication('${app.id}', 'dev')">Одобрить</button>
                    <button class="reject-btn" onclick="adminRejectApplication('${app.id}', 'dev')">Отклонить</button>
                    <button class="comment-btn" onclick="adminShowCommentModal('${app.id}', 'dev')">Комментарий</button>
                </div>
            ` : ''}
            <button class="delete-btn" onclick="adminDeleteApplication('${app.id}', 'dev')">Удалить</button>
        `;
        applicationsList.appendChild(appElement);
    });
}

function loadUsersList() {
    const users = JSON.parse(localStorage.getItem('users')) || [];
    const usersList = document.getElementById('usersList');
    usersList.innerHTML = '';
    
    if (users.length === 0) {
        usersList.innerHTML = '<p>Пользователей пока нет</p>';
        return;
    }
    
    users.forEach((user, index) => {
        const userElement = document.createElement('div');
        userElement.className = 'application-item';
        userElement.innerHTML = `
            <h4>Пользователь #${index + 1}</h4>
            <p><strong>ID:</strong> ${user.id}</p>
            <p><strong>Имя:</strong> ${user.firstName} ${user.lastName}</p>
            <p><strong>Email:</strong> ${user.email}</p>
            <p><strong>Зарегистрирован:</strong> ${new Date(user.registeredAt).toLocaleString()}</p>
            <p><strong>Уведомления:</strong> ${user.notificationPermission ? 'Разрешены' : 'Запрещены'}</p>
            <p><strong>Кол-во уведомлений:</strong> ${user.notifications ? user.notifications.length : 0}</p>
        `;
        usersList.appendChild(userElement);
    });
}

function getUserById(userId) {
    const users = JSON.parse(localStorage.getItem('users')) || [];
    return users.find(u => u.id === userId);
}

function getStatusText(status) {
    const statusTexts = {
        'pending': 'На рассмотрении',
        'approved': 'Одобрено', 
        'rejected': 'Отклонено'
    };
    return statusTexts[status] || status;
}

// Admin application actions (global functions)
function adminApproveApplication(applicationId, type) {
    if (confirm('Одобрить эту заявку?')) {
        const application = applicationManager.updateApplicationStatus(applicationId, type, 'approved');
        if (application) {
            const user = getUserById(application.userId);
            if (user) {
                userManager.addNotification(user.id, {
                    title: type === 'beta' ? 'Заявка на бета-тестирование одобрена' : 'Заявка в команду одобрена',
                    message: type === 'beta' 
                        ? 'Поздравляем! Ваша заявка на бета-тестирование ArBrowser была одобрена. Мы свяжемся с вами в ближайшее время.'
                        : 'Поздравляем! Ваша заявка на участие в команде разработки была одобрена. Мы свяжемся с вами для обсуждения деталей.',
                    type: 'success',
                    applicationId: applicationId
                });

                notificationManager.showBrowserNotification(
                    'Заявка одобрена!',
                    type === 'beta' 
                        ? 'Ваша заявка на бета-тестирование была одобрена!'
                        : 'Ваша заявка в команду была одобрена!'
                );

                notificationManager.sendEmailNotification(
                    user.email,
                    type === 'beta' ? 'Заявка на бета-тестирование ArBrowser одобрена' : 'Заявка в команду ArBrowser одобрена',
                    type === 'beta'
                        ? `Уважаемый(ая) ${user.firstName} ${user.lastName}!\n\nВаша заявка на бета-тестирование ArBrowser была одобрена. Мы свяжемся с вами в ближайшее время для предоставления доступа к бета-версии.\n\nС уважением,\nКоманда ArBrowser`
                        : `Уважаемый(ая) ${user.firstName} ${user.lastName}!\n\nВаша заявка на участие в команде разработки ArBrowser была одобрена. Мы свяжемся с вами в ближайшее время для обсуждения деталей сотрудничества.\n\nС уважением,\nКоманда ArBrowser`
                );
            }
            
            loadApplications();
            alert('Заявка одобрена! Пользователь получил уведомление.');
        }
    }
}

function adminRejectApplication(applicationId, type) {
    adminShowCommentModal(applicationId, type, true);
}

function adminShowCommentModal(applicationId, type, isRejection = false) {
    currentCommentAppId = applicationId;
    currentCommentAppType = type;
    currentCommentIsRejection = isRejection;
    
    const modal = document.createElement('div');
    modal.className = 'modal comment-modal';
    modal.innerHTML = `
        <div class="modal-content comment-content">
            <span class="close">&times;</span>
            <h2>${isRejection ? 'Отклонить заявку' : 'Добавить комментарий'}</h2>
            <textarea class="comment-textarea" placeholder="${isRejection ? 'Укажите причину отказа...' : 'Введите ваш комментарий...'}" required></textarea>
            <div class="comment-actions">
                <button class="secondary-btn" onclick="adminCloseCommentModal()">Отмена</button>
                <button class="${isRejection ? 'reject-btn' : 'comment-btn'}" onclick="adminSubmitComment()">
                    ${isRejection ? 'Отклонить' : 'Отправить'}
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'block';
    
    modal.querySelector('.close').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

function adminSubmitComment() {
    const modal = document.querySelector('.comment-modal');
    const comment = modal.querySelector('.comment-textarea').value;
    
    if (!comment.trim()) {
        alert('Пожалуйста, введите комментарий');
        return;
    }
    
    const status = currentCommentIsRejection ? 'rejected' : 'pending';
    const application = applicationManager.updateApplicationStatus(currentCommentAppId, currentCommentAppType, status, comment);
    
    if (application) {
        const user = getUserById(application.userId);
        if (user) {
            if (currentCommentIsRejection) {
                userManager.addNotification(user.id, {
                    title: currentCommentAppType === 'beta' ? 'Заявка на бета-тестирование отклонена' : 'Заявка в команду отклонена',
                    message: currentCommentAppType === 'beta'
                        ? 'К сожалению, ваша заявка на бета-тестирование ArBrowser была отклонена.'
                        : 'К сожалению, ваша заявка на участие в команде разработки была отклонена.',
                    type: 'error',
                    applicationId: currentCommentAppId,
                    adminComment: comment
                });

                notificationManager.showBrowserNotification(
                    'Заявка отклонена',
                    currentCommentAppType === 'beta'
                        ? 'Ваша заявка на бета-тестирование была отклонена.'
                        : 'Ваша заявка в команду была отклонена.'
                );

                notificationManager.sendEmailNotification(
                    user.email,
                    currentCommentAppType === 'beta' ? 'Заявка на бета-тестирование ArBrowser отклонена' : 'Заявка в команду ArBrowser отклонена',
                    currentCommentAppType === 'beta'
                        ? `Уважаемый(ая) ${user.firstName} ${user.lastName}!\n\nК сожалению, ваша заявка на бета-тестирование ArBrowser была отклонена.\n\nПричина: ${comment}\n\nС уважением,\nКоманда ArBrowser`
                        : `Уважаемый(ая) ${user.firstName} ${user.lastName}!\n\nК сожалению, ваша заявка на участие в команде разработки ArBrowser была отклонена.\n\nПричина: ${comment}\n\nС уважением,\nКоманда ArBrowser`
                );
            } else {
                userManager.addNotification(user.id, {
                    title: 'Комментарий к вашей заявке',
                    message: 'Администратор оставил комментарий к вашей заявке.',
                    type: 'warning',
                    applicationId: currentCommentAppId,
                    adminComment: comment
                });

                notificationManager.showBrowserNotification(
                    'Новый комментарий',
                    'Администратор оставил комментарий к вашей заявке.'
                );
            }
        }
        
        const modal = document.querySelector('.comment-modal');
        if (modal) {
            document.body.removeChild(modal);
        }
        loadApplications();
        alert(currentCommentIsRejection ? 'Заявка отклонена!' : 'Комментарий добавлен!');
    }
}

function adminCloseCommentModal() {
    const modal = document.querySelector('.comment-modal');
    if (modal) {
        document.body.removeChild(modal);
    }
}

function adminDeleteApplication(applicationId, type) {
    if (confirm('Вы уверены, что хотите удалить эту заявку?')) {
        const storageKey = type === 'beta' ? 'betaApplications' : 'devApplications';
        const applications = JSON.parse(localStorage.getItem(storageKey)) || [];
        const filteredApplications = applications.filter(app => app.id !== applicationId);
        localStorage.setItem(storageKey, JSON.stringify(filteredApplications));
        loadApplications();
    }
}

function saveContent() {
    const siteContent = {
        heroTitle: document.getElementById('heroTitle').value,
        heroSubtitle: document.getElementById('heroSubtitle').value,
        releaseDate: document.getElementById('releaseDate').value
    };
    
    localStorage.setItem('siteContent', JSON.stringify(siteContent));
    
    document.querySelector('.hero-title').textContent = siteContent.heroTitle;
    document.querySelector('.hero-subtitle').textContent = siteContent.heroSubtitle;
    document.querySelector('.release-info h4').textContent = `📅 Примерный релиз: ${siteContent.releaseDate}`;
    
    alert('Изменения сохранены!');
}

function loadContent() {
    const savedContent = JSON.parse(localStorage.getItem('siteContent')) || {};
    document.getElementById('heroTitle').value = savedContent.heroTitle || 'ArBrowser';
    document.getElementById('heroSubtitle').value = savedContent.heroSubtitle || 'Браузер нового поколения от Ткаченко Арсения';
    document.getElementById('releaseDate').value = savedContent.releaseDate || 'Декабрь 2025';
}

// Intersection Observer for animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

document.querySelectorAll('.feature-card').forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(30px)';
    card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(card);
});
