/**
 * Common Utilities for Ricar Auto Plan Payment
 */

const STORAGE_KEYS = {
    ORDER: 'ricar_order_draft',
    LICENSE: 'ricar_license_key',
    DEVICE: 'ricar_device_info',
    FAIL_REASON: 'ricar_fail_reason'
};

const Utils = {
    formatCurrency: (num) => num.toLocaleString() + '원',

    // Generate Random Order ID: ORD-YYYYMMDD-XXXXX
    generateOrderId: () => {
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const random = Math.random().toString(36).substr(2, 5).toUpperCase();
        return `ORD-${date}-${random}`;
    },

    // Generate License Key: XXXX-XXXX-XXXX-XXXX
    generateLicenseKey: () => {
        const seg = () => Math.random().toString(36).substr(2, 4).toUpperCase();
        return `${seg()}-${seg()}-${seg()}-${seg()}`;
    },

    // Generate Device ID
    generateDeviceId: () => {
        return 'DEV-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    },

    getStorage: (key) => {
        try { return JSON.parse(localStorage.getItem(key)); }
        catch (e) { return null; }
    },

    setStorage: (key, value) => {
        localStorage.setItem(key, JSON.stringify(value));
    },

    // Date Formatter
    formatDate: (isoString) => {
        if (!isoString) return '-';
        const d = new Date(isoString);
        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
};
