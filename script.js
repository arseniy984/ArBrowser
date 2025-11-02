// Database Manager
class DatabaseManager {
    constructor() {
        this.dbName = 'ArBrowserDB';
        this.version = 3; // Увеличиваем версию для миграции
        this.db = null;
        this.init();
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;
                
                // Миграция для добавления поля ownerId
                if (oldVersion < 3) {
                    if (db.objectStoreNames.contains('users')) {
                        db.deleteObjectStore('users');
                    }
                    if (db.objectStoreNames.contains('betaApplications')) {
                        db.deleteObjectStore('betaApplications');
                    }
                    if (db.objectStoreNames.contains('devApplications')) {
                        db.deleteObjectStore('devApplications');
                    }
                    if (db.objectStoreNames.contains('notifications')) {
                        db.deleteObjectStore('notifications');
                    }
                    if (db.objectStoreNames.contains('siteContent')) {
                        db.deleteObjectStore('siteContent');
                    }
                }

                if (!db.objectStoreNames.contains('users')) {
                    const userStore = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
                    userStore.createIndex('email', 'email', { unique: true });
                    userStore.createIndex('ownerId', 'ownerId');
                }
                if (!db.objectStoreNames.contains('betaApplications')) {
                    const betaStore = db.createObjectStore('betaApplications', { keyPath: 'id', autoIncrement: true });
                    betaStore.createIndex('userId', 'userId');
                    betaStore.createIndex('ownerId', 'ownerId');
                }
                if (!db.objectStoreNames.contains('devApplications')) {
                    const devStore = db.createObjectStore('devApplications', { keyPath: 'id', autoIncrement: true });
                    devStore.createIndex('userId', 'userId');
                    devStore.createIndex('ownerId', 'ownerId');
                }
                if (!db.objectStoreNames.contains('notifications')) {
                    const notifStore = db.createObjectStore('notifications', { keyPath: 'id', autoIncrement: true });
                    notifStore.createIndex('userId', 'userId');
                    notifStore.createIndex('ownerId', 'ownerId');
                }
                if (!db.objectStoreNames.contains('siteContent')) {
                    const siteStore = db.createObjectStore('siteContent', { keyPath: 'id' });
                }
            };
        });
    }

    async add(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async get(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAll(storeName, indexName = null, query = null) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const target = indexName ? store.index(indexName) : store;
            const request = query ? target.getAll(query) : target.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async update(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

const dbManager = new DatabaseManager();

// Telegram Bot Manager (без изменений)
class TelegramBotManager {
    constructor() {
        this.botToken = '8207900561:AAGo9TRPQVu8_iBiVXiRFt2K2dsBOg0IdDk';
        this.chatId = null;
        this.pendingActions = new Map();
        this.lastUpdateId = 0;
        this.initializeChatId();
        this.setupWebhookListener();
    }

    async initializeChatId() {
        const savedChatId = localStorage.getItem('telegramChatId');
        if (savedChatId) {
            this.chatId = savedChatId;
            console.log('✅ Chat ID loaded from storage:', this.chatId);
        } else {
            // Автоматически устанавливаем ваш Chat ID для всех пользователей
            this.setChatId('7883175226');
            console.log('✅ Chat ID установлен автоматически для всех пользователей: 7883175226');
        }
    }

    // ... остальные методы без изменений
    setChatId(chatId) {
        this.chatId = chatId;
        localStorage.setItem('telegramChatId', chatId);
        console.log('✅ Chat ID saved:', chatId);
    }

    // ... остальной код без изменений
}

const telegramBot = new TelegramBotManager();

// User Management с поддержкой ownerId
class UserManager {
    constructor() {
        this.currentUser = null;
        this.OWNER_ID = '7883175226'; // Ваш фиксированный ID
    }

    async register(email, firstName, lastName, password) {
        if (!this.isValidEmail(email)) {
            throw new Error('Некорректный формат email');
        }
        
        if (password.length < 6) {
            throw new Error('Пароль должен содержать минимум 6 символов');
        }

        if (!firstName.trim() || !lastName.trim()) {
            throw new Error('Имя и фамилия обязательны для заполнения');
        }

        const existingUsers = await dbManager.getAll('users', 'email', email.toLowerCase().trim());
        if (existingUsers.length > 0) {
            throw new Error('Пользователь с таким email уже существует');
        }

        const user = {
            email: email.toLowerCase().trim(),
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            password: btoa(unescape(encodeURIComponent(password + 'USER_SALT'))),
            ownerId: this.OWNER_ID, // Все пользователи привязываются к вам
            createdAt: new Date().toISOString(),
            notificationPermission: false,
            lastLogin: new Date().toISOString()
        };

        const userId = await dbManager.add('users', user);
        user.id = userId;
        return user;
    }

    async login(email, password) {
        const users = await dbManager.getAll('users', 'email', email.toLowerCase().trim());
        if (users.length === 0) {
            throw new Error('Пользователь с таким email не найден');
        }

        const user = users[0];
        const encodedPassword = btoa(unescape(encodeURIComponent(password + 'USER_SALT')));
        
        if (user.password !== encodedPassword) {
            throw new Error('Неверный пароль');
        }

        user.lastLogin = new Date().toISOString();
        await dbManager.update('users', user);

        this.currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));
        
        // Показываем сообщение о заявках при первом входе
        this.showApplicationsWelcome();
        
        return user;
    }

    showApplicationsWelcome() {
        const welcomeShown = localStorage.getItem('applicationsWelcomeShown');
        if (!welcomeShown) {
            setTimeout(() => {
                alert('📋 Добро пожаловать в систему заявок ArBrowser! Здесь вы можете подать заявку на бета-тестирование или присоединиться к команде разработки.');
                localStorage.setItem('applicationsWelcomeShown', 'true');
            }, 1000);
        }
    }

    // Остальные методы с добавлением ownerId
    async addNotification(userId, notification) {
        const newNotification = {
            userId: userId,
            ownerId: this.OWNER_ID,
            title: notification.title,
            message: notification.message,
            type: notification.type || 'info',
            read: false,
            createdAt: new Date().toISOString(),
            applicationId: notification.applicationId,
            adminComment: notification.adminComment
        };

        await dbManager.add('notifications', newNotification);
        return newNotification;
    }

    async getNotifications(userId) {
        const allNotifications = await dbManager.getAll('notifications', 'userId', userId);
        // Фильтруем только уведомления для текущего владельца
        return allNotifications.filter(notification => notification.ownerId === this.OWNER_ID);
    }

    async getAllUsers() {
        const allUsers = await dbManager.getAll('users');
        // Показываем только пользователей текущего владельца
        return allUsers.filter(user => user.ownerId === this.OWNER_ID);
    }

    // ... остальные методы без изменений
}

const userManager = new UserManager();

// Application Manager с поддержкой ownerId
class ApplicationManager {
    constructor() {
        this.OWNER_ID = '7883175226'; // Ваш фиксированный ID
    }

    async submitBetaApplication(data, userId) {
        const userApplications = await this.getUserApplications('betaApplications', userId);
        
        if (userApplications.length > 0) {
            userApplications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const lastApplication = userApplications[0];
            const lastApplicationDate = new Date(lastApplication.createdAt);
            const currentDate = new Date();
            
            const daysSinceLastApplication = Math.floor((currentDate - lastApplicationDate) / (1000 * 60 * 60 * 24));
            
            if (daysSinceLastApplication < 30) {
                const daysLeft = 30 - daysSinceLastApplication;
                throw new Error(`Вы можете подать следующую заявку через ${daysLeft} ${this.getDayText(daysLeft)}`);
            }
        }

        const application = {
            userId: userId,
            ownerId: this.OWNER_ID,
            email: data.email.toLowerCase().trim(),
            firstName: data.firstName.trim(),
            lastName: data.lastName.trim(),
            reason: data.reason.trim(),
            status: 'pending',
            createdAt: new Date().toISOString(),
            adminComment: null
        };

        const applicationId = await dbManager.add('betaApplications', application);
        application.id = applicationId;

        console.log('📨 Отправка уведомления в Telegram...');
        await telegramBot.sendNewApplicationNotification(application, 'beta');

        return application;
    }

    async submitDevApplication(data, userId) {
        const userApplications = await this.getUserApplications('devApplications', userId);
        
        if (userApplications.length > 0) {
            userApplications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const lastApplication = userApplications[0];
            const lastApplicationDate = new Date(lastApplication.createdAt);
            const currentDate = new Date();
            
            const daysSinceLastApplication = Math.floor((currentDate - lastApplicationDate) / (1000 * 60 * 60 * 24));
            
            if (daysSinceLastApplication < 30) {
                const daysLeft = 30 - daysSinceLastApplication;
                throw new Error(`Вы можете подать следующую заявку через ${daysLeft} ${this.getDayText(daysLeft)}`);
            }
        }

        const application = {
            userId: userId,
            ownerId: this.OWNER_ID,
            email: data.email.toLowerCase().trim(),
            firstName: data.firstName.trim(),
            lastName: data.lastName.trim(),
            role: data.role,
            experience: parseInt(data.experience),
            skills: data.skills.trim(),
            motivation: data.motivation.trim(),
            portfolio: data.portfolio?.trim() || '',
            status: 'pending',
            createdAt: new Date().toISOString(),
            adminComment: null
        };

        const applicationId = await dbManager.add('devApplications', application);
        application.id = applicationId;

        console.log('📨 Отправка уведомления в Telegram...');
        await telegramBot.sendNewApplicationNotification(application, 'dev');

        return application;
    }

    async getUserApplications(storeName, userId) {
        const allApplications = await dbManager.getAll(storeName, 'userId', userId);
        return allApplications.filter(app => app.ownerId === this.OWNER_ID);
    }

    async getBetaApplications() {
        const allApplications = await dbManager.getAll('betaApplications');
        return allApplications.filter(app => app.ownerId === this.OWNER_ID);
    }

    async getDevApplications() {
        const allApplications = await dbManager.getAll('devApplications');
        return allApplications.filter(app => app.ownerId === this.OWNER_ID);
    }

    // ... остальные методы без изменений
}

const applicationManager = new ApplicationManager();

// Site Content Manager
class SiteContentManager {
    constructor() {
        this.defaultContent = {
            id: 'main',
            heroTitle: 'ArBrowser',
            heroSubtitle: 'Браузер нового поколения от Ткаченко Арсения',
            releaseDate: 'Декабрь 2025'
        };
    }

    async initialize() {
        try {
            const content = await dbManager.get('siteContent', 'main');
            if (!content) {
                await dbManager.add('siteContent', this.defaultContent);
                return this.defaultContent;
            }
            return content;
        } catch (error) {
            return this.defaultContent;
        }
    }

    async getContent() {
        try {
            const content = await dbManager.get('siteContent', 'main');
            return content || this.defaultContent;
        } catch (error) {
            return this.defaultContent;
        }
    }

    async updateContent(updates) {
        const content = await this.getContent();
        const updatedContent = { ...content, ...updates };
        await dbManager.update('siteContent', updatedContent);
        return updatedContent;
    }
}

const siteContentManager = new SiteContentManager();

// Initialize the application с исправленной загрузкой
document.addEventListener('DOMContentLoaded', async function() {
    await initializeApp();
});

async function initializeApp() {
    try {
        // Показываем прелоадер сразу
        const preloader = document.querySelector('.preloader');
        const content = document.querySelector('.content');
        const percentage = document.querySelector('.loader-percentage');
        
        if (preloader) {
            preloader.style.display = 'flex';
            preloader.style.opacity = '1';
        }
        if (content) {
            content.classList.add('hidden');
            content.style.opacity = '0';
        }

        let progress = 0;
        const totalSteps = 4;
        let currentStep = 0;

        const updateProgress = () => {
            currentStep++;
            progress = Math.min((currentStep / totalSteps) * 100, 100);
            if (percentage) {
                percentage.textContent = Math.floor(progress) + '%';
            }
            console.log(`Загрузка: ${Math.floor(progress)}%`);
        };

        // Шаг 1: Инициализация базы данных
        console.log('🔄 Инициализация базы данных...');
        await dbManager.init();
        updateProgress();

        // Шаг 2: Инициализация контента сайта
        console.log('🔄 Загрузка контента...');
        await siteContentManager.initialize();
        updateProgress();

        // Шаг 3: Инициализация Telegram бота
        console.log('🔄 Настройка Telegram бота...');
        await telegramBot.initializeChatId();
        updateProgress();

        // Шаг 4: Проверка авторизации
        console.log('🔄 Проверка авторизации...');
        await checkAuthStatus();
        if (passwordManager.isLoggedIn()) {
            showAdminPanel();
        }
        updateProgress();

        // Завершение загрузки
        setTimeout(() => {
            if (preloader) {
                preloader.style.opacity = '0';
                setTimeout(() => {
                    preloader.style.display = 'none';
                    if (content) {
                        content.classList.remove('hidden');
                        setTimeout(() => {
                            content.style.opacity = '1';
                        }, 50);
                    }
                }, 500);
            }
        }, 500);

        initializeEventListeners();
        initializeSecretAdminCombo();
        
    } catch (error) {
        console.error('Ошибка инициализации приложения:', error);
        // В случае ошибки все равно показываем контент
        const preloader = document.querySelector('.preloader');
        const content = document.querySelector('.content');
        
        if (preloader) preloader.style.display = 'none';
        if (content) {
            content.classList.remove('hidden');
            content.style.opacity = '1';
        }
        
        alert('⚠️ Произошла ошибка при загрузке приложения. Пожалуйста, обновите страницу.');
    }
}

// Остальной код без изменений...
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
    
    // Notifications button
    const notificationsBtn = document.getElementById('notificationsBtn');
    if (notificationsBtn) {
        notificationsBtn.addEventListener('click', toggleNotifications);
    }

    // Application buttons - добавляем welcome сообщение
    document.querySelectorAll('.beta-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const user = userManager.getCurrentUser();
            if (!user) {
                showAuthModal();
                return;
            }
            
            const canSubmit = await applicationManager.canSubmitApplication(user.id, 'beta');
            if (!canSubmit.canSubmit) {
                alert(`Вы уже подавали заявку недавно. Следующую заявку можно подать через ${canSubmit.daysLeft} ${applicationManager.getDayText(canSubmit.daysLeft)}`);
                return;
            }
            
            document.getElementById('betaModal').style.display = 'block';
        });
    });

    document.querySelectorAll('.dev-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const user = userManager.getCurrentUser();
            if (!user) {
                showAuthModal();
                return;
            }
            
            const canSubmit = await applicationManager.canSubmitApplication(user.id, 'dev');
            if (!canSubmit.canSubmit) {
                alert(`Вы уже подавали заявку недавно. Следующую заявку можно подать через ${canSubmit.daysLeft} ${applicationManager.getDayText(canSubmit.daysLeft)}`);
                return;
            }
            
            document.getElementById('devModal').style.display = 'block';
        });
    });

    // Application forms
    document.getElementById('betaForm').addEventListener('submit', handleBetaApplication);
    document.getElementById('devForm').addEventListener('submit', handleDevApplication);

    // Остальные обработчики без изменений...
}

// Функция для показа welcome сообщения при открытии модалок заявок
function showApplicationWelcome(type) {
    const welcomeKey = `appWelcome_${type}_shown`;
    const alreadyShown = localStorage.getItem(welcomeKey);
    
    if (!alreadyShown) {
        const message = type === 'beta' 
            ? '📝 Заполните заявку на бета-тестирование ArBrowser. Расскажите, почему вы хотите стать бета-тестером.'
            : '👥 Заполните заявку для присоединения к команде разработки. Опишите ваш опыт и навыки.';
        
        setTimeout(() => {
            alert(message);
            localStorage.setItem(welcomeKey, 'true');
        }, 300);
    }
}

// Обновляем обработчики модалок
document.addEventListener('DOMContentLoaded', function() {
    // Добавляем welcome сообщения при открытии модалок заявок
    const betaModal = document.getElementById('betaModal');
    const devModal = document.getElementById('devModal');
    
    if (betaModal) {
        const originalDisplay = betaModal.style.display;
        Object.defineProperty(betaModal.style, 'display', {
            get: function() { return originalDisplay; },
            set: function(value) {
                if (value === 'block') {
                    showApplicationWelcome('beta');
                }
                originalDisplay = value;
            }
        });
    }
    
    if (devModal) {
        const originalDisplay = devModal.style.display;
        Object.defineProperty(devModal.style, 'display', {
            get: function() { return originalDisplay; },
            set: function(value) {
                if (value === 'block') {
                    showApplicationWelcome('dev');
                }
                originalDisplay = value;
            }
        });
    }
});

// Password Manager (без изменений)
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

// Остальной код (функции handleLogin, handleRegister, etc.) остается без изменений...
