// Database Manager
class DatabaseManager {
    constructor() {
        this.dbName = 'ArBrowserDB';
        this.version = 2;
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
                if (!db.objectStoreNames.contains('users')) {
                    const userStore = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
                    userStore.createIndex('email', 'email', { unique: true });
                }
                if (!db.objectStoreNames.contains('betaApplications')) {
                    const betaStore = db.createObjectStore('betaApplications', { keyPath: 'id', autoIncrement: true });
                    betaStore.createIndex('userId', 'userId');
                }
                if (!db.objectStoreNames.contains('devApplications')) {
                    const devStore = db.createObjectStore('devApplications', { keyPath: 'id', autoIncrement: true });
                    devStore.createIndex('userId', 'userId');
                }
                if (!db.objectStoreNames.contains('notifications')) {
                    const notifStore = db.createObjectStore('notifications', { keyPath: 'id', autoIncrement: true });
                    notifStore.createIndex('userId', 'userId');
                }
                if (!db.objectStoreNames.contains('siteContent')) {
                    db.createObjectStore('siteContent', { keyPath: 'id' });
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

// Telegram Bot Manager с исправлениями
class TelegramBotManager {
    constructor() {
        this.botToken = '8207900561:AAGo9TRPQVu8_iBiVXiRFt2K2dsBOg0IdDk';
        this.chatId = null;
        this.pendingActions = new Map();
        this.lastUpdateId = 0; // Для отслеживания обработанных сообщений
        this.initializeChatId();
        this.setupWebhookListener();
    }

    async initializeChatId() {
        const savedChatId = localStorage.getItem('telegramChatId');
        if (savedChatId) {
            this.chatId = savedChatId;
            console.log('✅ Chat ID loaded from storage:', this.chatId);
        } else {
            await this.findChatIdAutomatically();
        }
    }

    async findChatIdAutomatically() {
        try {
            const url = `https://api.telegram.org/bot${this.botToken}/getUpdates`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.ok && data.result.length > 0) {
                const chatId = data.result[data.result.length - 1].message.chat.id;
                this.setChatId(chatId);
                console.log('✅ Chat ID найден автоматически:', chatId);
                this.showAutoConfigSuccess(chatId);
                return chatId;
            } else {
                console.log('📝 Напишите любое сообщение вашему боту в Telegram');
                this.createChatIdHelper();
                return null;
            }
        } catch (error) {
            console.error('❌ Ошибка поиска Chat ID:', error);
            this.createChatIdHelper();
            return null;
        }
    }

    setupWebhookListener() {
        // Увеличиваем интервал и добавляем защиту от дублирования
        setInterval(() => {
            this.checkForUpdates();
        }, 5000); // Увеличили до 5 секунд
    }

    async checkForUpdates() {
        if (!this.chatId) return;

        try {
            const url = `https://api.telegram.org/bot${this.botToken}/getUpdates?offset=${this.lastUpdateId + 1}`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.ok && data.result.length > 0) {
                console.log('📨 Новые обновления:', data.result.length);
                
                for (const update of data.result) {
                    // Обновляем lastUpdateId
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

        console.log('📨 Обработка сообщения:', text);

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

        console.log('📨 Callback received:', data);

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
                
                // Уведомляем пользователя
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
                
                // Уведомляем пользователя
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

            // Удаляем ожидающее действие
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

            // Отправляем только последние 3 заявки с кнопками
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
            console.log('✅ Telegram message with keyboard sent');
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
        // Проверяем, не отправляли ли уже уведомление об этой заявке
        const notificationKey = `app_${application.id}_${type}`;
        const alreadySent = localStorage.getItem(notificationKey);
        
        if (alreadySent) {
            console.log('📨 Уведомление уже отправлено, пропускаем');
            return true;
        }

        // Помечаем как отправленное
        localStorage.setItem(notificationKey, 'true');
        
        // Устанавливаем таймер на очистку через 24 часа
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

    showAutoConfigSuccess(chatId) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 15px;
            border-radius: 5px;
            z-index: 10000;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        `;
        notification.innerHTML = `
            ✅ <strong>Telegram бот настроен!</strong><br>
            Chat ID: ${chatId}
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    createChatIdHelper() {
        // ... (без изменений)
    }

    showChatIdInstructions() {
        // ... (без изменений)
    }

    setChatId(chatId) {
        this.chatId = chatId;
        localStorage.setItem('telegramChatId', chatId);
        console.log('✅ Chat ID saved:', chatId);
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

    async sendTestMessage() {
        if (!this.chatId) {
            console.warn('⚠️ Chat ID не установлен');
            return false;
        }

        const testMessage = `
🤖 <b>ТЕСТОВОЕ СООБЩЕНИЕ</b>

✅ Ваш бот работает корректно!
🕒 Время: ${new Date().toLocaleString('ru-RU')}

<b>ArBrowser Notification System</b>
        `.trim();

        return await this.sendMessage(this.chatId, testMessage);
    }

    sanitizeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

const telegramBot = new TelegramBotManager();

// Application Manager с исправлениями
class ApplicationManager {
    async submitBetaApplication(data, userId) {
        const userApplications = await dbManager.getAll('betaApplications', 'userId', userId);
        
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
        const userApplications = await dbManager.getAll('devApplications', 'userId', userId);
        
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

            console.log('📨 Отправка уведомления о смене статуса в Telegram...');
            await telegramBot.sendApplicationStatusUpdate(application, type, status, adminComment);

            return application;
        }
        throw new Error('Заявка не найдена');
    }

    async getBetaApplications() {
        return await dbManager.getAll('betaApplications');
    }

    async getDevApplications() {
        return await dbManager.getAll('devApplications');
    }

    async deleteApplication(applicationId, type) {
        const storeName = type === 'beta' ? 'betaApplications' : 'devApplications';
        await dbManager.delete(storeName, applicationId);
    }

    async canSubmitApplication(userId, type) {
        const storeName = type === 'beta' ? 'betaApplications' : 'devApplications';
        const userApplications = await dbManager.getAll(storeName, 'userId', userId);
        
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

// Исправленная функция для комментариев в админ-панели
async function adminSubmitComment() {
    const modal = document.querySelector('.comment-modal');
    if (!modal) return;
    
    const comment = modal.querySelector('.comment-textarea').value;
    
    if (!comment.trim()) {
        alert('❌ Пожалуйста, введите комментарий');
        return;
    }
    
    try {
        const status = currentCommentIsRejection ? 'rejected' : 'pending';
        const application = await applicationManager.updateApplicationStatus(currentCommentAppId, currentCommentAppType, status, comment);
        
        if (application) {
            const user = await dbManager.get('users', application.userId);
            if (user) {
                if (currentCommentIsRejection) {
                    await userManager.addNotification(user.id, {
                        title: currentCommentAppType === 'beta' ? 'Заявка на бета-тестирование отклонена' : 'Заявка в команду отклонена',
                        message: currentCommentAppType === 'beta'
                            ? `К сожалению, ваша заявка на бета-тестирование ArBrowser была отклонена. Причина: ${comment}`
                            : `К сожалению, ваша заявка на участие в команде разработки была отклонена. Причина: ${comment}`,
                        type: 'error',
                        applicationId: currentCommentAppId,
                        adminComment: comment
                    });
                } else {
                    await userManager.addNotification(user.id, {
                        title: 'Комментарий к вашей заявке',
                        message: `Администратор оставил комментарий к вашей заявке: ${comment}`,
                        type: 'warning',
                        applicationId: currentCommentAppId,
                        adminComment: comment
                    });
                }
            }
            
            document.body.removeChild(modal);
            await loadApplications();
            alert(currentCommentIsRejection ? '✅ Заявка отклонена!' : '✅ Комментарий добавлен!');
        }
    } catch (error) {
        alert('❌ Ошибка: ' + error.message);
    }
}

// Password Manager, UserManager, SiteContentManager и остальные функции остаются без изменений
// ... (остальной код без изменений)
