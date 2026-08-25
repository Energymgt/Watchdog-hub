const bcrypt = require('bcryptjs');
if (!process.env.PASSWORD) {
    throw new Error('PASSWORD environment variable is required');
}
if (!process.env.ENCRYPTION_KEY && !process.env.ENCRIPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
}
const PASSWORD = bcrypt.hashSync(process.env.PASSWORD, 8);

module.exports = {
    uiPort: process.env.PORT || 1880,
    mqttReconnectTime: 15000,
    debugMaxLength: 1000,
    credentialSecret: process.env.ENCRYPTION_KEY || process.env.ENCRIPTION_KEY,
    userDir: '/data/',
    adminAuth: {
        type: 'credentials',
        users: [{
            username: process.env.USERNAME || 'admin',
            password: PASSWORD,
            permissions: '*'
        }]
    },
    editorTheme: {
        page: { title: 'Watchdog Hub' },
        header: { title: 'Watchdog Hub — BACnet Gateway', image: null },
        projects: { enabled: false },
        palette: { editable: true }
    },
    logging: {
        console: { level: 'info', metrics: false, audit: false }
    },
    contextStorage: {
        default: { module: 'localfilesystem' }
    },
    exportGlobalContextKeys: false,
    functionTimeout: 0,
    nodeMessageBufferMaxLength: 0
};
