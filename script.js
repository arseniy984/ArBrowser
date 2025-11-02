// Database Manager
class DatabaseManager {
    constructor() {
        this.dbName = 'ArBrowserDB';
        this.version = 3;
        this.db = null;
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

// Telegram Bot Manager
class TelegramBotManager {
    constructor() {
        this.botToken = '8207900561:AAGo9TRPQVu8_iBiVXiRFt2K2dsBOg0IdDk';
        this.chatId = null;
        this.pendingActions = new Map();
        this.lastUpdateId = 0;
        this.setupWebhookListener();
    }

    async initializeChatId() {
        const savedChatId = localStorage.getItem('telegramChatId');
        if (savedChatId) {
            this.chatId = savedChatId;
        } else {
            this.setChatId('7883175226');
        }
    }

    setupWebhookListener() {
        setInterval(() => {
            this.checkForUpdates();
        }, 5000);
    }

    async checkForUpdates() {
        if (!this.chatId) return;

        try {
            const url = `https://api.telegram.org/bot${this.botToken}/getUpdates?offset=${this.lastUpdateId + 1}`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.ok && data.result.length > 0) {
                for (const update of data.result) {
                    if (update.update_id > this.lastUpdateId) {
                        this.lastUpdateId = update.update_id;
                    }

                    if (update.message && update.message.text) {
                        await this.handleMessage(update.message);
                    } else if (update.callback_query) {
                        await this.handleCallbackQuery(update.callback_query);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Ошибка проверки обновлений:', error);
        }
    }

    async handleMessage(message) {
        const text = message.text;
        const chatId = message.chat.id;

        const pendingAction = this.pendingActions.get(chatId);
        if (pendingAction && pendingAction.waitingForComment) {
            await this.handleCommentResponse(chatId, text, pendingAction);
            return;
        }

        if (text === '/start') {
            await this.sendWelcomeMessage(chatId);
        } else if (text === '/applications') {
            await this.sendApplicationsList(chatId);
        } else if (text === '/help') {
            await this.sendHelpMessage(chatId);
        } else if (text.startsWith('/')) {
            await this.sendMessage(chatId, '❌ Неизвестная команда. Используйте /help для списка команд.');
        }
    }

    async handleCallbackQuery(callbackQuery) {
        const data = callbackQuery.data;
        const chatId = callbackQuery.message.chat.id;
        const messageId = callbackQuery.message.message_id;

        const [action, appId, appType] = data.split(':');

        try {
            switch (action) {
                case 'approve':
                    await this.approveApplication(chatId, messageId, parseInt(appId), appType);
                    break;
                case 'reject':
                    await this.requestRejectionReason(chatId, messageId, parseInt(appId), appType);
                    break;
                case 'comment':
                    await this.requestComment(chatId, messageId, parseInt(appId), appType);
                    break;
                case 'view_details':
                    await this.sendApplicationDetails(chatId, parseInt(appId), appType);
                    break;
            }
        } catch (error) {
            console.error('❌ Ошибка обработки callback:', error);
            await this.sendMessage(chatId, '❌ Произошла ошибка при обработке запроса');
        }
    }

    async handleCommentResponse(chatId, text, pendingAction) {
        const { appId, appType, action, originalMessageId } = pendingAction;
        
        try {
            if (action === 'reject') {
                const application = await applicationManager.updateApplicationStatus(appId, appType, 'rejected', text);
                await this.sendMessage(chatId, `✅ Заявка #${appId} отклонена с комментарием: "${text}"`);
                await this.editApplicationMessage(chatId, originalMessageId, appId, appType, 'rejected', text);
                
                if (application && application.userId) {
                    const user = await dbManager.get('users', application.userId);
                    if (user) {
                        await userManager.addNotification(user.id, {
                            title: appType === 'beta' ? 'Заявка на бета-тестирование отклонена' : 'Заявка в команду отклонена',
                            message: appType === 'beta'
                                ? `К сожалению, ваша заявка на бета-тестирование ArBrowser была отклонена. Причина: ${text}`
                                : `К сожалению, ваша заявка на участие в команде разработки была отклонена. Причина: ${text}`,
                            type: 'error',
                            applicationId: appId,
                            adminComment: text
                        });
                    }
                }
            } else if (action === 'comment') {
                const application = await applicationManager.updateApplicationStatus(appId, appType, 'pending', text);
                await this.sendMessage(chatId, `✅ Комментарий добавлен к заявке #${appId}: "${text}"`);
                await this.editApplicationMessage(chatId, originalMessageId, appId, appType, 'pending', text);
                
                if (application && application.userId) {
                    const user = await dbManager.get('users', application.userId);
                    if (user) {
                        await userManager.addNotification(user.id, {
                            title: 'Комментарий к вашей заявке',
                            message: `Администратор оставил комментарий к вашей заявке: ${text}`,
                            type: 'warning',
                            applicationId: appId,
                            adminComment: text
                        });
                    }
                }
            }

            this.pendingActions.delete(chatId);
        } catch (error) {
            console.error('❌ Ошибка обработки комментария:', error);
            await this.sendMessage(chatId, '❌ Ошибка при обработке комментария');
        }
    }

    async sendWelcomeMessage(chatId) {
        const message = `
🤖 <b>ArBrowser Admin Bot</b>

Добро пожаловать в панель управления заявками!

<b>Доступные команды:</b>
/applications - Список заявок
/help - Помощь

<b>Бот автоматически уведомляет о:</b>
• Новых заявках на бета-тестирование
• Новых заявках в команду разработки
• Изменениях статусов заявок
        `.trim();

        await this.sendMessage(chatId, message);
    }

    async sendHelpMessage(chatId) {
        const message = `
📋 <b>Помощь по боту</b>

<b>Как работать с заявками:</b>
1. Новые заявки приходят автоматически
2. Используйте кнопки под каждой заявкой:
   • ✅ Одобрить - принять заявку
   • ❌ Отклонить - отклонить с указанием причины
   • 💬 Комментарий - оставить комментарий
   • 👁️ Детали - посмотреть полную информацию

3. При отклонении бот запросит причину
4. Все действия синхронизируются с сайтом

<b>Команды:</b>
/start - Начало работы
/applications - Список всех заявок
/help - Эта справка
        `.trim();

        await this.sendMessage(chatId, message);
    }

    async sendApplicationsList(chatId) {
        try {
            const betaApps = await applicationManager.getBetaApplications();
            const devApps = await applicationManager.getDevApplications();
            
            const pendingBetaApps = betaApps.filter(app => app.status === 'pending');
            const pendingDevApps = devApps.filter(app => app.status === 'pending');

            if (pendingBetaApps.length === 0 && pendingDevApps.length === 0) {
                await this.sendMessage(chatId, '📭 Нет заявок, ожидающих рассмотрения');
                return;
            }

            let message = '📋 <b>Заявки ожидающие рассмотрения</b>\n\n';

            if (pendingBetaApps.length > 0) {
                message += `<b>Бета-тестирование (${pendingBetaApps.length}):</b>\n`;
                for (const app of pendingBetaApps.slice(0, 5)) {
                    message += `• #${app.id} - ${app.firstName} ${app.lastName}\n`;
                }
                message += '\n';
            }

            if (pendingDevApps.length > 0) {
                message += `<b>Команда разработки (${pendingDevApps.length}):</b>\n`;
                for (const app of pendingDevApps.slice(0, 5)) {
                    message += `• #${app.id} - ${app.firstName} ${app.lastName} (${app.role})\n`;
                }
            }

            if (pendingBetaApps.length > 5 || pendingDevApps.length > 5) {
                message += `\n<i>Показаны первые 5 заявок из каждой категории</i>`;
            }

            await this.sendMessage(chatId, message);

            const allPendingApps = [...pendingBetaApps, ...pendingDevApps]
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, 3);

            for (const app of allPendingApps) {
                const type = app.role ? 'dev' : 'beta';
                await this.sendApplicationNotification(app, type, true);
            }

        } catch (error) {
            console.error('❌ Ошибка получения списка заявок:', error);
            await this.sendMessage(chatId, '❌ Ошибка при получении списка заявок');
        }
    }

    async sendApplicationDetails(chatId, appId, appType) {
        try {
            const storeName = appType === 'beta' ? 'betaApplications' : 'devApplications';
            const application = await dbManager.get(storeName, appId);
            
            if (!application) {
                await this.sendMessage(chatId, '❌ Заявка не найдена');
                return;
            }

            const user = await dbManager.get('users', application.userId);
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

            let message = `
📄 <b>Детали заявки #${application.id}</b>

👤 <b>Имя:</b> ${application.firstName} ${application.lastName}
📧 <b>Email:</b> ${application.email}
🆔 <b>ID пользователя:</b> ${application.userId}
📝 <b>Тип:</b> ${appType === 'beta' ? 'Бета-тестирование' : 'Команда разработки'}
⏰ <b>Подана:</b> ${new Date(application.createdAt).toLocaleString('ru-RU')}
🔰 <b>Статус:</b> ${this.getStatusText(application.status)}
            `.trim();

            if (appType === 'dev') {
                message += `\n💼 <b>Роль:</b> ${roleNames[application.role] || application.role}`;
                message += `\n📊 <b>Опыт:</b> ${application.experience} лет`;
                message += `\n🛠️ <b>Навыки:</b> ${application.skills.substring(0, 100)}${application.skills.length > 100 ? '...' : ''}`;
                message += `\n🎯 <b>Мотивация:</b> ${application.motivation.substring(0, 100)}${application.motivation.length > 100 ? '...' : ''}`;
                if (application.portfolio) {
                    message += `\n🔗 <b>Портфолио:</b> ${application.portfolio}`;
                }
            } else {
                message += `\n📝 <b>Причина:</b> ${application.reason.substring(0, 100)}${application.reason.length > 100 ? '...' : ''}`;
            }

            if (application.adminComment) {
                message += `\n💬 <b>Комментарий админа:</b> ${application.adminComment}`;
            }

            await this.sendMessage(chatId, message);

        } catch (error) {
            console.error('❌ Ошибка получения деталей заявки:', error);
            await this.sendMessage(chatId, '❌ Ошибка при получении деталей заявки');
        }
    }

    async sendApplicationNotification(application, type, isFromList = false) {
        const appType = type === 'beta' ? 'бета-тестирование' : 'команду разработки';
        
        const message = `
${isFromList ? '📋' : '🆕'} <b>${isFromList ? 'ЗАЯВКА ИЗ СПИСКА' : 'НОВАЯ ЗАЯВКА НА ' + appType.toUpperCase()}</b>

👤 <b>Имя:</b> ${this.sanitizeHTML(application.firstName)} ${this.sanitizeHTML(application.lastName)}
📧 <b>Email:</b> ${this.sanitizeHTML(application.email)}
🆔 <b>ID заявки:</b> ${application.id}
⏰ <b>Время:</b> ${new Date(application.createdAt).toLocaleString('ru-RU')}

${type === 'dev' ? 
`💼 <b>Роль:</b> ${this.sanitizeHTML(application.role)}` : 
`📝 <b>Причина:</b> ${this.sanitizeHTML(application.reason.substring(0, 100))}...`}

<b>Статус:</b> ⏳ Ожидает рассмотрения
        `.trim();

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '✅ Одобрить', callback_data: `approve:${application.id}:${type}` },
                    { text: '❌ Отклонить', callback_data: `reject:${application.id}:${type}` }
                ],
                [
                    { text: '💬 Комментарий', callback_data: `comment:${application.id}:${type}` },
                    { text: '👁️ Детали', callback_data: `view_details:${application.id}:${type}` }
                ]
            ]
        };

        return await this.sendMessageWithKeyboard(this.chatId, message, keyboard);
    }

    async sendMessageWithKeyboard(chatId, message, keyboard) {
        try {
            const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('❌ Error sending Telegram message with keyboard:', error);
            return null;
        }
    }

    async editApplicationMessage(chatId, messageId, appId, appType, status, comment = '') {
        try {
            const storeName = appType === 'beta' ? 'betaApplications' : 'devApplications';
            const application = await dbManager.get(storeName, appId);
            
            if (!application) return;

            const statusEmoji = status === 'approved' ? '✅' : '❌';
            const statusText = status === 'approved' ? 'ОДОБРЕНА' : 'ОТКЛОНЕНА';
            
            const message = `
${statusEmoji} <b>ЗАЯВКА ОБРАБОТАНА</b>

👤 <b>Имя:</b> ${this.sanitizeHTML(application.firstName)} ${this.sanitizeHTML(application.lastName)}
📧 <b>Email:</b> ${this.sanitizeHTML(application.email)}
🆔 <b>ID заявки:</b> ${application.id}
🔰 <b>Статус:</b> ${statusText}
${comment ? `💬 <b>Комментарий:</b> ${this.sanitizeHTML(comment)}` : ''}
⏰ <b>Обработана:</b> ${new Date().toLocaleString('ru-RU')}
            `.trim();

            const url = `https://api.telegram.org/bot${this.botToken}/editMessageText`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: chatId,
                    message_id: messageId,
                    text: message,
                    parse_mode: 'HTML'
                })
            });
            
            return response.ok;
        } catch (error) {
            console.error('❌ Error editing message:', error);
            return false;
        }
    }

    async approveApplication(chatId, messageId, appId, appType) {
        try {
            const application = await applicationManager.updateApplicationStatus(appId, appType, 'approved');
            
            if (application) {
                const user = await dbManager.get('users', application.userId);
                if (user) {
                    await userManager.addNotification(user.id, {
                        title: appType === 'beta' ? 'Заявка на бета-тестирование одобрена' : 'Заявка в команду одобрена',
                        message: appType === 'beta' 
                            ? 'Поздравляем! Ваша заявка на бета-тестирование ArBrowser была одобрена. Мы свяжемся с вами в ближайшее время.'
                            : 'Поздравляем! Ваша заявка на участие в команде разработки была одобрена. Мы свяжемся с вами для обсуждения деталей.',
                        type: 'success',
                        applicationId: appId
                    });
                }

                await this.editApplicationMessage(chatId, messageId, appId, appType, 'approved');
                await this.sendMessage(chatId, `✅ Заявка #${appId} успешно одобрена!`);
            }
        } catch (error) {
            console.error('❌ Ошибка одобрения заявки:', error);
            await this.sendMessage(chatId, '❌ Ошибка при одобрении заявки');
        }
    }

    async requestRejectionReason(chatId, messageId, appId, appType) {
        this.pendingActions.set(chatId, {
            waitingForComment: true,
            appId: appId,
            appType: appType,
            action: 'reject',
            originalMessageId: messageId
        });

        await this.sendMessage(chatId, '📝 Укажите причину отклонения заявки:');
    }

    async requestComment(chatId, messageId, appId, appType) {
        this.pendingActions.set(chatId, {
            waitingForComment: true,
            appId: appId,
            appType: appType,
            action: 'comment',
            originalMessageId: messageId
        });

        await this.sendMessage(chatId, '💬 Введите комментарий к заявке:');
    }

    async sendNewApplicationNotification(application, type) {
        const notificationKey = `app_${application.id}_${type}`;
        const alreadySent = localStorage.getItem(notificationKey);
        
        if (alreadySent) {
            return true;
        }

        localStorage.setItem(notificationKey, 'true');
        
        setTimeout(() => {
            localStorage.removeItem(notificationKey);
        }, 24 * 60 * 60 * 1000);

        return await this.sendApplicationNotification(application, type, false);
    }

    async sendApplicationStatusUpdate(application, type, status, adminComment = '') {
        const appType = type === 'beta' ? 'бета-тестирование' : 'команду разработки';
        const statusText = status === 'approved' ? '✅ ОДОБРЕНА' : '❌ ОТКЛОНЕНА';
        const statusEmoji = status === 'approved' ? '✅' : '❌';
        
        const message = `
🔄 <b>СТАТУС ЗАЯВКИ ИЗМЕНЕН</b>

${statusEmoji} <b>Статус:</b> ${statusText}
👤 <b>Имя:</b> ${this.sanitizeHTML(application.firstName)} ${this.sanitizeHTML(application.lastName)}
📧 <b>Email:</b> ${this.sanitizeHTML(application.email)}
🆔 <b>ID заявки:</b> ${application.id}
📝 <b>Тип:</b> ${appType}
${adminComment ? `💬 <b>Комментарий:</b> ${this.sanitizeHTML(adminComment)}` : ''}
⏰ <b>Время обработки:</b> ${new Date().toLocaleString('ru-RU')}
        `.trim();

        return await this.sendMessage(this.chatId, message);
    }

    getStatusText(status) {
        const statusTexts = {
            'pending': '⏳ Ожидает рассмотрения',
            'approved': '✅ Одобрено', 
            'rejected': '❌ Отклонено'
        };
        return statusTexts[status] || status;
    }

    setChatId(chatId) {
        this.chatId = chatId;
        localStorage.setItem('telegramChatId', chatId);
    }

    async sendMessage(chatId, message) {
        try {
            const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'HTML'
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            return result.ok;
        } catch (error) {
            console.error('❌ Error sending Telegram message:', error);
            return false;
        }
    }

    sanitizeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

const telegramBot = new TelegramBotManager();

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
        this.OWNER_ID = '7883175226';
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
            ownerId: this.OWNER_ID,
            createdAt: new Date().toISOString(),
            notificationPermission: false,
            lastLogin: new Date().toISOString()
        };

        const userId = await dbManager.add('users', user);
        user.id = userId;
        
        this.showApplicationsWelcome();
        
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

    logout() {
        this.currentUser = null;
        localStorage.removeItem('currentUser');
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
        closeNotifications();
        showWelcomeScreen(); // Возвращаем на начальный экран при выходе
    }

    getCurrentUser() {
        if (!this.currentUser) {
            const stored = localStorage.getItem('currentUser');
            this.currentUser = stored ? JSON.parse(stored) : null;
        }
        return this.currentUser;
    }

    async updateUser(userId, updates) {
        const user = await dbManager.get('users', userId);
        if (!user) {
            throw new Error('Пользователь не найден');
        }

        const updatedUser = { ...user, ...updates };
        await dbManager.update('users', updatedUser);
        
        if (this.currentUser && this.currentUser.id === userId) {
            this.currentUser = updatedUser;
            localStorage.setItem('currentUser', JSON.stringify(updatedUser));
        }
        
        return updatedUser;
    }

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
        return allNotifications.filter(notification => notification.ownerId === this.OWNER_ID);
    }

    async markNotificationAsRead(notificationId) {
        const notification = await dbManager.get('notifications', notificationId);
        if (notification) {
            notification.read = true;
            await dbManager.update('notifications', notification);
            return notification;
        }
    }

    async getUnreadNotificationsCount(userId) {
        const notifications = await this.getNotifications(userId);
        return notifications.filter(n => !n.read).length;
    }

    async getAllUsers() {
        const allUsers = await dbManager.getAll('users');
        return allUsers.filter(user => user.ownerId === this.OWNER_ID);
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
}

const userManager = new UserManager();

// Application Manager
class ApplicationManager {
    constructor() {
        this.OWNER_ID = '7883175226';
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

        await telegramBot.sendNewApplicationNotification(application, 'dev');

        return application;
    }

    async getUserApplications(storeName, userId) {
        const allApplications = await dbManager.getAll(storeName, 'userId', userId);
        return allApplications.filter(app => app.ownerId === this.OWNER_ID);
    }

    getDayText(days) {
        if (days === 1) return 'день';
        if (days >= 2 && days <= 4) return 'дня';
        return 'дней';
    }

    async updateApplicationStatus(applicationId, type, status, adminComment = null) {
        const storeName = type === 'beta' ? 'betaApplications' : 'devApplications';
        const application = await dbManager.get(storeName, applicationId);
        
        if (application) {
            application.status = status;
            application.adminComment = adminComment;
            application.processedAt = new Date().toISOString();
            await dbManager.update(storeName, application);

            await telegramBot.sendApplicationStatusUpdate(application, type, status, adminComment);

            return application;
        }
        throw new Error('Заявка не найдена');
    }

    async getBetaApplications() {
        const allApplications = await dbManager.getAll('betaApplications');
        return allApplications.filter(app => app.ownerId === this.OWNER_ID);
    }

    async getDevApplications() {
        const allApplications = await dbManager.getAll('devApplications');
        return allApplications.filter(app => app.ownerId === this.OWNER_ID);
    }

    async deleteApplication(applicationId, type) {
        const storeName = type === 'beta' ? 'betaApplications' : 'devApplications';
        await dbManager.delete(storeName, applicationId);
    }

    async canSubmitApplication(userId, type) {
        const storeName = type === 'beta' ? 'betaApplications' : 'devApplications';
        const userApplications = await this.getUserApplications(storeName, userId);
        
        if (userApplications.length === 0) {
            return { canSubmit: true };
        }

        userApplications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const lastApplication = userApplications[0];
        const lastApplicationDate = new Date(lastApplication.createdAt);
        const currentDate = new Date();
        
        const daysSinceLastApplication = Math.floor((currentDate - lastApplicationDate) / (1000 * 60 * 60 * 24));
        const daysLeft = Math.max(0, 30 - daysSinceLastApplication);

        return {
            canSubmit: daysSinceLastApplication >= 30,
            daysLeft: daysLeft,
            lastApplicationDate: lastApplicationDate
        };
    }
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

// Global variables for admin actions
let currentCommentAppId = null;
let currentCommentAppType = null;
let currentCommentIsRejection = false;

// Функции для управления экранами
function showWelcomeScreen() {
    const welcomeScreen = document.getElementById('welcomeScreen');
    const content = document.querySelector('.content');
    
    if (welcomeScreen) welcomeScreen.classList.remove('hidden');
    if (content) content.classList.add('hidden');
    
    // Скрываем админ-панель если она открыта
    const adminPanel = document.getElementById('adminPanel');
    if (adminPanel) adminPanel.classList.add('hidden');
}

function showMainContent() {
    const welcomeScreen = document.getElementById('welcomeScreen');
    const content = document.querySelector('.content');
    
    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    if (content) content.classList.remove('hidden');
}

function showAuthModalFromWelcome() {
    showAuthModal();
    // Прячем welcome screen когда открываем модалку авторизации
    const welcomeScreen = document.getElementById('welcomeScreen');
    if (welcomeScreen) welcomeScreen.classList.add('hidden');
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    await initializeApp();
});

async function initializeApp() {
    const preloader = document.querySelector('.preloader');
    const welcomeScreen = document.getElementById('welcomeScreen');
    const content = document.querySelector('.content');
    const percentage = document.querySelector('.loader-percentage');
    
    // Показываем прелоадер сразу
    if (preloader) {
        preloader.style.display = 'flex';
        preloader.style.opacity = '1';
    }
    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    if (content) content.classList.add('hidden');

    // Функция обновления прогресса
    const updateProgress = (percent) => {
        if (percentage) {
            percentage.textContent = percent + '%';
        }
    };

    try {
        // Шаг 1: Инициализация базы данных (0-25%)
        updateProgress(0);
        await dbManager.init();
        updateProgress(25);

        // Шаг 2: Инициализация контента сайта (25-50%)
        await siteContentManager.initialize();
        updateProgress(50);

        // Шаг 3: Инициализация Telegram бота (50-75%)
        await telegramBot.initializeChatId();
        updateProgress(75);

        // Шаг 4: Проверка авторизации (75-100%)
        const user = userManager.getCurrentUser();
        updateProgress(100);

        // Завершение загрузки
        setTimeout(() => {
            if (preloader) {
                preloader.style.opacity = '0';
                setTimeout(() => {
                    preloader.style.display = 'none';
                    
                    // После загрузки показываем welcome screen или основной контент
                    if (user) {
                        showMainContent();
                        showUserMenu(user);
                    } else {
                        showWelcomeScreen();
                    }
                    
                    // Проверяем админ-авторизацию
                    if (passwordManager.isLoggedIn()) {
                        showAdminPanel();
                    }
                }, 500);
            }
        }, 500);

        initializeEventListeners();
        initializeSecretAdminCombo();
        
    } catch (error) {
        console.error('Ошибка инициализации приложения:', error);
        // В случае ошибки показываем welcome screen
        if (preloader) preloader.style.display = 'none';
        showWelcomeScreen();
    }
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
    // Кнопки на welcome screen
    const loginWelcomeBtn = document.getElementById('loginWelcomeBtn');
    const registerWelcomeBtn = document.getElementById('registerWelcomeBtn');
    
    if (loginWelcomeBtn) {
        loginWelcomeBtn.addEventListener('click', showAuthModalFromWelcome);
    }
    if (registerWelcomeBtn) {
        registerWelcomeBtn.addEventListener('click', showAuthModalFromWelcome);
    }

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

    // Application buttons
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
            
            showApplicationWelcome('beta');
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
            
            showApplicationWelcome('dev');
            document.getElementById('devModal').style.display = 'block';
        });
    });

    // Application forms
    document.getElementById('betaForm').addEventListener('submit', handleBetaApplication);
    document.getElementById('devForm').addEventListener('submit', handleDevApplication);

    // Notification system
    const enableNotificationsBtn = document.getElementById('enableNotifications');
    const skipNotificationsBtn = document.getElementById('skipNotifications');
    const closeNotificationsBtn = document.querySelector('.close-notifications');
    
    if (enableNotificationsBtn) {
        enableNotificationsBtn.addEventListener('click', enableNotifications);
    }
    if (skipNotificationsBtn) {
        skipNotificationsBtn.addEventListener('click', skipNotifications);
    }
    if (closeNotificationsBtn) {
        closeNotificationsBtn.addEventListener('click', closeNotifications);
    }

    // Admin system
    const logoutBtn = document.getElementById('logoutBtn');
    const saveContentBtn = document.getElementById('saveContent');
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleAdminLogout);
    }
    if (saveContentBtn) {
        saveContentBtn.addEventListener('click', saveContent);
    }

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
}

// Функция для показа welcome сообщения при открытии заявок
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

// Auth functions
async function checkAuthStatus() {
    const user = userManager.getCurrentUser();
    if (user) {
        await showUserMenu(user);
    } else {
        showAuthButton();
    }
}

function showAuthModal() {
    document.getElementById('authModal').style.display = 'block';
}

async function showUserMenu(user) {
    const navAuthBtn = document.getElementById('navAuthBtn');
    const userMenu = document.getElementById('userMenu');
    const userName = document.getElementById('userName');
    const notificationsBtn = document.getElementById('notificationsBtn');
    
    if (navAuthBtn) navAuthBtn.classList.add('hidden');
    if (userMenu) userMenu.classList.remove('hidden');
    if (userName) userName.textContent = `${user.firstName} ${user.lastName}`;
    
    if (notificationsBtn) {
        const unreadCount = await userManager.getUnreadNotificationsCount(user.id);
        notificationsBtn.textContent = unreadCount > 0 ? `🔔 (${unreadCount})` : '🔔';
    }
}

function showAuthButton() {
    const navAuthBtn = document.getElementById('navAuthBtn');
    const userMenu = document.getElementById('userMenu');
    
    if (navAuthBtn) navAuthBtn.classList.remove('hidden');
    if (userMenu) userMenu.classList.add('hidden');
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const user = await userManager.login(email, password);
        await showUserMenu(user);
        document.getElementById('authModal').style.display = 'none';
        e.target.reset();
        
        // После успешного входа показываем основной контент
        showMainContent();
        
    } catch (error) {
        alert('❌ ' + error.message);
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
        alert('❌ Пароли не совпадают');
        return;
    }

    if (password.length < 6) {
        alert('❌ Пароль должен содержать минимум 6 символов');
        return;
    }

    try {
        const user = await userManager.register(email, firstName, lastName, password);
        await showUserMenu(user);
        document.getElementById('authModal').style.display = 'none';
        e.target.reset();
        
        // После успешной регистрации показываем основной контент
        showMainContent();
        
    } catch (error) {
        alert('❌ ' + error.message);
    }
}

function handleLogout() {
    userManager.logout();
    showAuthButton();
    showWelcomeScreen(); // Возвращаем на начальный экран
}

// Остальные функции (Notification functions, Application functions, Admin functions) 
// остаются без изменений, как в предыдущем коде...

// Добавляем CSS стили для welcome screen
const welcomeScreenStyles = `
    /* Welcome Screen */
    #welcomeScreen {
        min-height: 100vh;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        color: white;
    }
    
    .welcome-container {
        text-align: center;
        max-width: 600px;
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        padding: 40px;
        border-radius: 20px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .welcome-logo {
        font-size: 4em;
        margin-bottom: 20px;
    }
    
    .welcome-title {
        font-size: 3em;
        margin-bottom: 10px;
        font-weight: bold;
    }
    
    .welcome-subtitle {
        font-size: 1.5em;
        margin-bottom: 30px;
        opacity: 0.9;
    }
    
    .welcome-description {
        font-size: 1.1em;
        margin-bottom: 40px;
        line-height: 1.6;
        opacity: 0.8;
    }
    
    .welcome-buttons {
        display: flex;
        gap: 20px;
        justify-content: center;
        flex-wrap: wrap;
    }
    
    .welcome-btn {
        padding: 15px 30px;
        font-size: 1.1em;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.3s ease;
        font-weight: bold;
        text-decoration: none;
        display: inline-block;
    }
    
    .welcome-btn.primary {
        background: #4CAF50;
        color: white;
    }
    
    .welcome-btn.secondary {
        background: rgba(255, 255, 255, 0.2);
        color: white;
        border: 2px solid rgba(255, 255, 255, 0.3);
    }
    
    .welcome-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
    }
    
    .welcome-features {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
        margin-top: 40px;
    }
    
    .feature-item {
        background: rgba(255, 255, 255, 0.1);
        padding: 20px;
        border-radius: 10px;
        text-align: center;
    }
    
    .feature-icon {
        font-size: 2em;
        margin-bottom: 10px;
    }
    
    .feature-text {
        font-size: 0.9em;
        opacity: 0.8;
    }
    
    @media (max-width: 768px) {
        .welcome-container {
            padding: 20px;
        }
        
        .welcome-title {
            font-size: 2em;
        }
        
        .welcome-subtitle {
            font-size: 1.2em;
        }
        
        .welcome-buttons {
            flex-direction: column;
        }
    }
`;

// Добавляем стили в документ
const styleSheet = document.createElement('style');
styleSheet.textContent = welcomeScreenStyles + improvedStyles; // Добавляем и welcome стили и предыдущие
document.head.appendChild(styleSheet);
