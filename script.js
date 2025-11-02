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

// Telegram Bot Manager с интерактивными кнопками
class TelegramBotManager {
    constructor() {
        this.botToken = '8207900561:AAGo9TRPQVu8_iBiVXiRFt2K2dsBOg0IdDk';
        this.chatId = null;
        this.pendingActions = new Map();
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
        setInterval(() => {
            this.checkForUpdates();
        }, 3000);
    }

    async checkForUpdates() {
        if (!this.chatId) return;

        try {
            const url = `https://api.telegram.org/bot${this.botToken}/getUpdates`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.ok && data.result.length > 0) {
                for (const update of data.result) {
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
                await applicationManager.updateApplicationStatus(appId, appType, 'rejected', text);
                await this.sendMessage(chatId, `✅ Заявка #${appId} отклонена с комментарием: "${text}"`);
                await this.editApplicationMessage(chatId, originalMessageId, appId, appType, 'rejected', text);
            } else if (action === 'comment') {
                await applicationManager.updateApplicationStatus(appId, appType, 'pending', text);
                await this.sendMessage(chatId, `✅ Комментарий добавлен к заявке #${appId}: "${text}"`);
                await this.editApplicationMessage(chatId, originalMessageId, appId, appType, 'pending', text);
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
                message += `\n🛠️ <b>Навыки:</b> ${application.skills}`;
                message += `\n🎯 <b>Мотивация:</b> ${application.motivation}`;
                if (application.portfolio) {
                    message += `\n🔗 <b>Портфолио:</b> ${application.portfolio}`;
                }
            } else {
                message += `\n📝 <b>Причина:</b> ${application.reason}`;
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
            console.log('✅ Telegram message with keyboard sent:', result);
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
        const helperBtn = document.createElement('button');
        helperBtn.innerHTML = '🔧 Получить Chat ID';
        helperBtn.style.position = 'fixed';
        helperBtn.style.bottom = '10px';
        helperBtn.style.right = '10px';
        helperBtn.style.zIndex = '10000';
        helperBtn.style.padding = '10px';
        helperBtn.style.background = '#ff6b6b';
        helperBtn.style.color = 'white';
        helperBtn.style.border = 'none';
        helperBtn.style.borderRadius = '5px';
        helperBtn.style.cursor = 'pointer';
        
        helperBtn.addEventListener('click', () => {
            this.showChatIdInstructions();
        });
        
        document.body.appendChild(helperBtn);
    }

    showChatIdInstructions() {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10001;
        `;
        
        modal.innerHTML = `
            <div style="background: white; padding: 20px; border-radius: 10px; max-width: 500px; text-align: center;">
                <h3>📋 Как получить Chat ID</h3>
                <ol style="text-align: left; margin: 20px 0;">
                    <li>Найдите бота <strong>@getidsbot</strong> в Telegram</li>
                    <li>Начните диалог с ботом командой <code>/start</code></li>
                    <li>Бот покажет ваш Chat ID</li>
                    <li>Введите его ниже:</li>
                </ol>
                <input type="text" id="chatIdInput" placeholder="Ваш Chat ID" style="padding: 10px; width: 80%; margin: 10px 0;">
                <br>
                <button id="saveChatId" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 5px; margin: 5px;">Сохранить</button>
                <button id="testBot" style="padding: 10px 20px; background: #2196F3; color: white; border: none; border-radius: 5px; margin: 5px;">Тест бота</button>
                <button id="closeModal" style="padding: 10px 20px; background: #f44336; color: white; border: none; border-radius: 5px; margin: 5px;">Закрыть</button>
                <div id="testResult" style="margin: 10px 0;"></div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.querySelector('#saveChatId').addEventListener('click', () => {
            const chatId = modal.querySelector('#chatIdInput').value.trim();
            if (chatId) {
                this.setChatId(chatId);
                modal.remove();
                alert('✅ Chat ID сохранен!');
            } else {
                alert('❌ Введите Chat ID');
            }
        });
        
        modal.querySelector('#testBot').addEventListener('click', async () => {
            const testResult = modal.querySelector('#testResult');
            testResult.innerHTML = '🔄 Тестируем бота...';
            
            const success = await this.sendTestMessage();
            if (success) {
                testResult.innerHTML = '✅ Бот работает! Сообщение отправлено.';
            } else {
                testResult.innerHTML = '❌ Ошибка отправки. Проверьте токен бота и Chat ID.';
            }
        });
        
        modal.querySelector('#closeModal').addEventListener('click', () => {
            modal.remove();
        });
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
            console.log('✅ Telegram message sent:', result);
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
📱 Система: ${navigator.userAgent}

<b>ArBrowser Notification System</b>
        `.trim();

        return await this.sendMessage(testMessage);
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
        return user;
    }

    logout() {
        this.currentUser = null;
        localStorage.removeItem('currentUser');
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
        closeNotifications();
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
        return await dbManager.getAll('notifications', 'userId', userId);
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
        return await dbManager.getAll('users');
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
}

const userManager = new UserManager();

// Application Manager
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

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    await initializeApp();
});

async function initializeApp() {
    try {
        await dbManager.init();
        await siteContentManager.initialize();
        
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

        initializeEventListeners();
        initializeSecretAdminCombo();
        
    } catch (error) {
        console.error('Ошибка инициализации приложения:', error);
        document.querySelector('.preloader').style.display = 'none';
        document.querySelector('.content').classList.remove('hidden');
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
        alert('✅ Вход выполнен успешно!');
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
        alert('✅ Регистрация успешна!');
    } catch (error) {
        alert('❌ ' + error.message);
    }
}

function handleLogout() {
    userManager.logout();
    showAuthButton();
    alert('✅ Вы успешно вышли из аккаунта');
}

// Notification functions
async function enableNotifications() {
    if (!('Notification' in window)) {
        alert('❌ Ваш браузер не поддерживает уведомления');
        return;
    }

    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
        const user = userManager.getCurrentUser();
        if (user) {
            await userManager.updateUser(user.id, { notificationPermission: true });
        }
        alert('✅ Уведомления разрешены!');
    } else {
        alert('❌ Уведомления заблокированы');
    }
    
    document.getElementById('notificationModal').style.display = 'none';
}

function skipNotifications() {
    document.getElementById('notificationModal').style.display = 'none';
}

function toggleNotifications() {
    const notificationsPanel = document.getElementById('userNotifications');
    if (notificationsPanel) {
        notificationsPanel.classList.toggle('hidden');
        // Обновляем список уведомлений при открытии
        if (!notificationsPanel.classList.contains('hidden')) {
            loadUserNotifications();
        }
    }
}

function closeNotifications() {
    const notificationsPanel = document.getElementById('userNotifications');
    if (notificationsPanel) {
        notificationsPanel.classList.add('hidden');
    }
}

async function loadUserNotifications() {
    const user = userManager.getCurrentUser();
    if (!user) return;

    const notificationsList = document.getElementById('notificationsList');
    if (!notificationsList) return;

    const notifications = await userManager.getNotifications(user.id);
    notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    notificationsList.innerHTML = '';

    if (notifications.length === 0) {
        notificationsList.innerHTML = '<div class="notification-item">Нет уведомлений</div>';
        return;
    }

    for (const notification of notifications) {
        const notificationElement = document.createElement('div');
        notificationElement.className = `notification-item ${notification.read ? 'read' : 'unread'}`;
        notificationElement.innerHTML = `
            <div class="notification-header">
                <strong class="notification-title">${notification.title}</strong>
                <span class="notification-time">${new Date(notification.createdAt).toLocaleString()}</span>
            </div>
            <div class="notification-message">${notification.message}</div>
            ${notification.adminComment ? `<div class="notification-comment"><strong>Комментарий:</strong> ${notification.adminComment}</div>` : ''}
            ${!notification.read ? `<button class="mark-read-btn" data-id="${notification.id}">Отметить прочитанным</button>` : ''}
        `;
        notificationsList.appendChild(notificationElement);
    }

    // Добавляем обработчики для кнопок "Отметить прочитанным"
    document.querySelectorAll('.mark-read-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const notificationId = parseInt(this.getAttribute('data-id'));
            await userManager.markNotificationAsRead(notificationId);
            await loadUserNotifications();
            await showUserMenu(userManager.getCurrentUser());
        });
    });
}

// Application functions
async function handleBetaApplication(e) {
    e.preventDefault();
    const user = userManager.getCurrentUser();
    if (!user) {
        alert('❌ Пожалуйста, войдите в систему');
        return;
    }

    const formData = {
        email: document.getElementById('email').value,
        firstName: document.getElementById('firstName').value,
        lastName: document.getElementById('lastName').value,
        reason: document.getElementById('reason').value
    };

    try {
        const application = await applicationManager.submitBetaApplication(formData, user.id);
        
        await userManager.addNotification(user.id, {
            title: 'Заявка на бета-тестирование отправлена',
            message: 'Ваша заявка на бета-тестирование ArBrowser успешно отправлена и находится на рассмотрении.',
            type: 'success',
            applicationId: application.id
        });

        alert('✅ Заявка отправлена! Мы уведомим вас о решении.');
        e.target.reset();
        document.getElementById('betaModal').style.display = 'none';
        
        await showUserMenu(userManager.getCurrentUser());
    } catch (error) {
        alert('❌ ' + error.message);
    }
}

async function handleDevApplication(e) {
    e.preventDefault();
    const user = userManager.getCurrentUser();
    if (!user) {
        alert('❌ Пожалуйста, войдите в систему');
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
        const application = await applicationManager.submitDevApplication(formData, user.id);
        
        await userManager.addNotification(user.id, {
            title: 'Заявка в команду отправлена',
            message: 'Ваша заявка на участие в команде разработки ArBrowser успешно отправлена и находится на рассмотрении.',
            type: 'success',
            applicationId: application.id
        });

        alert('✅ Заявка отправлена! Мы рассмотрим вашу кандидатуру и свяжемся с вами.');
        e.target.reset();
        document.getElementById('devModal').style.display = 'none';
        
        await showUserMenu(userManager.getCurrentUser());
    } catch (error) {
        alert('❌ ' + error.message);
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

    const adminLoginForm = document.getElementById('adminLoginForm');
    if (adminLoginForm) {
        adminLoginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const password = document.getElementById('adminPassword').value;
            const errorElement = document.getElementById('loginError');
            
            if (passwordManager.verifyPassword(password)) {
                passwordManager.setLoggedIn(true);
                loginModal.style.display = 'none';
                document.body.removeChild(loginModal);
                showAdminPanel();
            } else {
                if (errorElement) errorElement.style.display = 'block';
            }
        });
    }

    loginModal.addEventListener('click', (e) => {
        if (e.target === loginModal) {
            loginModal.style.display = 'none';
            document.body.removeChild(loginModal);
        }
    });
}

async function showAdminPanel() {
    const content = document.querySelector('.content');
    const adminPanel = document.getElementById('adminPanel');
    
    if (content) content.classList.add('hidden');
    if (adminPanel) adminPanel.classList.remove('hidden');
    
    await loadApplications();
    await loadContent();
}

function hideAdminPanel() {
    const adminPanel = document.getElementById('adminPanel');
    const content = document.querySelector('.content');
    
    if (adminPanel) adminPanel.classList.add('hidden');
    if (content) content.classList.remove('hidden');
}

function handleAdminLogout() {
    passwordManager.setLoggedIn(false);
    hideAdminPanel();
    alert('✅ Вы вышли из админ-панели');
}

async function loadApplications() {
    await loadBetaApplications();
    await loadDevApplications();
}

async function loadBetaApplications() {
    const applications = await applicationManager.getBetaApplications();
    const applicationsList = document.getElementById('betaApplications');
    if (!applicationsList) return;
    
    applicationsList.innerHTML = '';
    
    if (applications.length === 0) {
        applicationsList.innerHTML = '<p>Бета-заявок пока нет</p>';
        return;
    }
    
    applications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    for (const app of applications) {
        const user = await dbManager.get('users', app.userId);
        const appElement = document.createElement('div');
        appElement.className = 'application-item';
        appElement.innerHTML = `
            <h4>Бета-заявка <span class="status-badge status-${app.status}">${getStatusText(app.status)}</span></h4>
            <p><strong>ID:</strong> ${app.id}</p>
            <p><strong>Пользователь:</strong> ${user ? `${user.firstName} ${user.lastName} (${user.email})` : 'N/A'}</p>
            <p><strong>Имя:</strong> ${app.firstName} ${app.lastName}</p>
            <p><strong>Email:</strong> ${app.email}</p>
            <p><strong>Причина:</strong> ${app.reason}</p>
            <p><strong>Время подачи:</strong> ${new Date(app.createdAt).toLocaleString()}</p>
            ${app.adminComment ? `<p><strong>Комментарий админа:</strong> ${app.adminComment}</p>` : ''}
            ${app.status === 'pending' ? `
                <div class="action-buttons">
                    <button class="approve-btn" data-id="${app.id}" data-type="beta">Одобрить</button>
                    <button class="reject-btn" data-id="${app.id}" data-type="beta">Отклонить</button>
                    <button class="comment-btn" data-id="${app.id}" data-type="beta">Комментарий</button>
                </div>
            ` : ''}
            <button class="delete-btn" data-id="${app.id}" data-type="beta">Удалить</button>
        `;
        applicationsList.appendChild(appElement);
    }

    addAdminButtonHandlers();
}

async function loadDevApplications() {
    const applications = await applicationManager.getDevApplications();
    const applicationsList = document.getElementById('devApplications');
    if (!applicationsList) return;
    
    applicationsList.innerHTML = '';
    
    if (applications.length === 0) {
        applicationsList.innerHTML = '<p>Заявок в команду пока нет</p>';
        return;
    }
    
    applications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
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
    
    for (const app of applications) {
        const user = await dbManager.get('users', app.userId);
        const appElement = document.createElement('div');
        appElement.className = 'application-item';
        appElement.innerHTML = `
            <h4>Заявка в команду <span class="status-badge status-${app.status}">${getStatusText(app.status)}</span></h4>
            <p><strong>ID:</strong> ${app.id}</p>
            <p><strong>Пользователь:</strong> ${user ? `${user.firstName} ${user.lastName} (${user.email})` : 'N/A'}</p>
            <p><strong>Имя:</strong> ${app.firstName} ${app.lastName}</p>
            <p><strong>Email:</strong> ${app.email}</p>
            <p><strong>Роль:</strong> <span class="role-badge ${app.role}">${roleNames[app.role] || app.role}</span></p>
            <p><strong>Опыт:</strong> ${app.experience} лет</p>
            <p><strong>Навыки:</strong> ${app.skills}</p>
            <p><strong>Мотивация:</strong> ${app.motivation}</p>
            ${app.portfolio ? `<p><strong>Портфолио:</strong> <a href="${app.portfolio}" target="_blank">${app.portfolio}</a></p>` : ''}
            <p><strong>Время подачи:</strong> ${new Date(app.createdAt).toLocaleString()}</p>
            ${app.adminComment ? `<p><strong>Комментарий админа:</strong> ${app.adminComment}</p>` : ''}
            ${app.status === 'pending' ? `
                <div class="action-buttons">
                    <button class="approve-btn" data-id="${app.id}" data-type="dev">Одобрить</button>
                    <button class="reject-btn" data-id="${app.id}" data-type="dev">Отклонить</button>
                    <button class="comment-btn" data-id="${app.id}" data-type="dev">Комментарий</button>
                </div>
            ` : ''}
            <button class="delete-btn" data-id="${app.id}" data-type="dev">Удалить</button>
        `;
        applicationsList.appendChild(appElement);
    }

    addAdminButtonHandlers();
}

function addAdminButtonHandlers() {
    document.querySelectorAll('.approve-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const appId = this.getAttribute('data-id');
            const appType = this.getAttribute('data-type');
            adminApproveApplication(appId, appType);
        });
    });

    document.querySelectorAll('.reject-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const appId = this.getAttribute('data-id');
            const appType = this.getAttribute('data-type');
            adminRejectApplication(appId, appType);
        });
    });

    document.querySelectorAll('.comment-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const appId = this.getAttribute('data-id');
            const appType = this.getAttribute('data-type');
            adminShowCommentModal(appId, appType);
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const appId = this.getAttribute('data-id');
            const appType = this.getAttribute('data-type');
            adminDeleteApplication(appId, appType);
        });
    });
}

async function loadUsersList() {
    const users = await userManager.getAllUsers();
    const usersList = document.getElementById('usersList');
    if (!usersList) return;
    
    usersList.innerHTML = '';
    
    if (users.length === 0) {
        usersList.innerHTML = '<p>Пользователей пока нет</p>';
        return;
    }
    
    users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    for (const user of users) {
        const userElement = document.createElement('div');
        userElement.className = 'application-item';
        userElement.innerHTML = `
            <h4>Пользователь</h4>
            <p><strong>ID:</strong> ${user.id}</p>
            <p><strong>Имя:</strong> ${user.firstName} ${user.lastName}</p>
            <p><strong>Email:</strong> ${user.email}</p>
            <p><strong>Зарегистрирован:</strong> ${new Date(user.createdAt).toLocaleString()}</p>
            <p><strong>Последний вход:</strong> ${user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Никогда'}</p>
        `;
        usersList.appendChild(userElement);
    }
}

function getStatusText(status) {
    const statusTexts = {
        'pending': 'На рассмотрении',
        'approved': 'Одобрено', 
        'rejected': 'Отклонено'
    };
    return statusTexts[status] || status;
}

// Admin application actions
async function adminApproveApplication(applicationId, type) {
    if (confirm('Одобрить эту заявку?')) {
        try {
            const application = await applicationManager.updateApplicationStatus(applicationId, type, 'approved');
            if (application) {
                const user = await dbManager.get('users', application.userId);
                if (user) {
                    await userManager.addNotification(user.id, {
                        title: type === 'beta' ? 'Заявка на бета-тестирование одобрена' : 'Заявка в команду одобрена',
                        message: type === 'beta' 
                            ? 'Поздравляем! Ваша заявка на бета-тестирование ArBrowser была одобрена. Мы свяжемся с вами в ближайшее время.'
                            : 'Поздравляем! Ваша заявка на участие в команде разработки была одобрена. Мы свяжемся с вами для обсуждения деталей.',
                        type: 'success',
                        applicationId: applicationId
                    });
                }
                
                await loadApplications();
                alert('✅ Заявка одобрена! Пользователь получил уведомление.');
            }
        } catch (error) {
            alert('❌ Ошибка: ' + error.message);
        }
    }
}

async function adminRejectApplication(applicationId, type) {
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
                <button class="secondary-btn" id="cancelComment">Отмена</button>
                <button class="${isRejection ? 'reject-btn' : 'comment-btn'}" id="submitComment">
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
    
    modal.querySelector('#cancelComment').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.querySelector('#submitComment').addEventListener('click', adminSubmitComment);
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

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
                            ? 'К сожалению, ваша заявка на бета-тестирование ArBrowser была отклонена.'
                            : 'К сожалению, ваша заявка на участие в команде разработки была отклонена.',
                        type: 'error',
                        applicationId: currentCommentAppId,
                        adminComment: comment
                    });
                } else {
                    await userManager.addNotification(user.id, {
                        title: 'Комментарий к вашей заявке',
                        message: 'Администратор оставил комментарий к вашей заявке.',
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

async function adminDeleteApplication(applicationId, type) {
    if (confirm('Вы уверены, что хотите удалить эту заявку?')) {
        try {
            await applicationManager.deleteApplication(applicationId, type);
            await loadApplications();
            alert('✅ Заявка удалена!');
        } catch (error) {
            alert('❌ Ошибка: ' + error.message);
        }
    }
}

async function saveContent() {
    const heroTitle = document.getElementById('heroTitle');
    const heroSubtitle = document.getElementById('heroSubtitle');
    const releaseDate = document.getElementById('releaseDate');
    
    if (!heroTitle || !heroSubtitle || !releaseDate) {
        alert('❌ Элементы формы не найдены');
        return;
    }

    const siteContent = {
        heroTitle: heroTitle.value,
        heroSubtitle: heroSubtitle.value,
        releaseDate: releaseDate.value
    };
    
    try {
        await siteContentManager.updateContent(siteContent);
        
        const heroTitleElement = document.querySelector('.hero-title');
        const heroSubtitleElement = document.querySelector('.hero-subtitle');
        const releaseInfoElement = document.querySelector('.release-info h4');
        
        if (heroTitleElement) heroTitleElement.textContent = siteContent.heroTitle;
        if (heroSubtitleElement) heroSubtitleElement.textContent = siteContent.heroSubtitle;
        if (releaseInfoElement) releaseInfoElement.textContent = `📅 Примерный релиз: ${siteContent.releaseDate}`;
        
        alert('✅ Изменения сохранены!');
    } catch (error) {
        alert('❌ Ошибка сохранения: ' + error.message);
    }
}

async function loadContent() {
    try {
        const content = await siteContentManager.getContent();
        const heroTitle = document.getElementById('heroTitle');
        const heroSubtitle = document.getElementById('heroSubtitle');
        const releaseDate = document.getElementById('releaseDate');
        
        if (heroTitle) heroTitle.value = content.heroTitle;
        if (heroSubtitle) heroSubtitle.value = content.heroSubtitle;
        if (releaseDate) releaseDate.value = content.releaseDate;
    } catch (error) {
        console.error('Ошибка загрузки контента:', error);
    }
}

// Добавляем CSS для улучшенной шторки уведомлений и кнопки выхода
const improvedStyles = `
    /* Шторка уведомлений */
    #userNotifications {
        position: fixed;
        top: 0;
        right: -400px;
        width: 380px;
        height: 100vh;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        box-shadow: -5px 0 25px rgba(0,0,0,0.3);
        transition: right 0.3s ease-in-out;
        z-index: 1000;
        padding: 20px;
        overflow-y: auto;
        color: white;
    }
    
    #userNotifications:not(.hidden) {
        right: 0;
    }
    
    .notifications-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 15px;
        border-bottom: 2px solid rgba(255,255,255,0.3);
    }
    
    .notifications-header h3 {
        margin: 0;
        color: white;
        font-size: 1.4em;
    }
    
    .close-notifications {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        font-size: 1.5em;
        cursor: pointer;
        padding: 5px 10px;
        border-radius: 5px;
        transition: background 0.3s;
    }
    
    .close-notifications:hover {
        background: rgba(255,255,255,0.3);
    }
    
    .notification-item {
        background: rgba(255,255,255,0.1);
        border-radius: 10px;
        padding: 15px;
        margin-bottom: 15px;
        border-left: 4px solid #4CAF50;
        transition: transform 0.2s;
    }
    
    .notification-item:hover {
        transform: translateX(-5px);
    }
    
    .notification-item.unread {
        border-left-color: #ff6b6b;
        background: rgba(255,255,255,0.15);
    }
    
    .notification-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 10px;
    }
    
    .notification-title {
        font-weight: bold;
        font-size: 1.1em;
        color: white;
        margin: 0;
    }
    
    .notification-time {
        font-size: 0.8em;
        color: rgba(255,255,255,0.7);
    }
    
    .notification-message {
        color: rgba(255,255,255,0.9);
        line-height: 1.4;
        margin-bottom: 10px;
    }
    
    .notification-comment {
        background: rgba(255,255,255,0.1);
        padding: 10px;
        border-radius: 5px;
        margin-top: 10px;
        font-style: italic;
    }
    
    .mark-read-btn {
        background: #4CAF50;
        color: white;
        border: none;
        padding: 8px 15px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 0.9em;
        transition: background 0.3s;
    }
    
    .mark-read-btn:hover {
        background: #45a049;
    }
    
    /* Кнопка выхода другого цвета */
    #userLogout {
        background: linear-gradient(135deg, #ff6b6b, #ee5a52);
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: bold;
        transition: all 0.3s ease;
        box-shadow: 0 4px 15px rgba(255, 107, 107, 0.3);
    }
    
    #userLogout:hover {
        background: linear-gradient(135deg, #ff5252, #e53935);
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(255, 107, 107, 0.4);
    }
    
    #userLogout:active {
        transform: translateY(0);
    }
    
    /* Улучшенная кнопка уведомлений */
    #notificationsBtn {
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: bold;
        transition: all 0.3s ease;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
    }
    
    #notificationsBtn:hover {
        background: linear-gradient(135deg, #5a6fd8, #6a4190);
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
    }
`;

// Добавляем стили в документ
const styleSheet = document.createElement('style');
styleSheet.textContent = improvedStyles;
document.head.appendChild(styleSheet);
