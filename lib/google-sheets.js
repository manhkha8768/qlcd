const crypto = require('crypto');
const fs = require('fs');

function config() {
    let credentials = {};
    const credentialsFile = process.env.QLCD_GOOGLE_CREDENTIALS_FILE;
    if (credentialsFile) {
        try { credentials = JSON.parse(fs.readFileSync(credentialsFile, 'utf8')); }
        catch (e) { throw new Error(`Không đọc được file Google credentials: ${e.message}`); }
    }
    const email = process.env.QLCD_GOOGLE_SERVICE_ACCOUNT_EMAIL || credentials.client_email;
    const privateKey = String(process.env.QLCD_GOOGLE_PRIVATE_KEY || credentials.private_key || '').replace(/\\n/g, '\n');
    return { email, privateKey, spreadsheetId: process.env.QLCD_GOOGLE_SPREADSHEET_ID || '' };
}

function b64url(value) { return Buffer.from(value).toString('base64url'); }

async function accessToken() {
    const c = config();
    if (!c.email || !c.privateKey) throw new Error('Chưa cấu hình tài khoản dịch vụ Google Sheets');
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64url(JSON.stringify({ iss: c.email, scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
    const unsigned = `${header}.${claim}`;
    const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), c.privateKey).toString('base64url');
    const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` });
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error_description || 'Không thể xác thực Google Sheets');
    return data.access_token;
}

async function googleRequest(url, options = {}) {
    const token = await accessToken();
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || 'Google Sheets không phản hồi');
    return data;
}

async function createSpreadsheet(title, sheetName = 'Asset Master') {
    return googleRequest('https://sheets.googleapis.com/v4/spreadsheets', { method: 'POST',
        body: JSON.stringify({ properties: { title }, sheets: [{ properties: { title: sheetName, frozenRowCount: 1 } }] }) });
}

async function writeValues(id, sheetName, values) {
    const range = encodeURIComponent(`'${sheetName.replace(/'/g, "''")}'!A1`);
    const clearRange = encodeURIComponent(`'${sheetName.replace(/'/g, "''")}'!A:Z`);
    await googleRequest(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${clearRange}:clear`,
        { method: 'POST', body: '{}' });
    return googleRequest(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}?valueInputOption=RAW`,
        { method: 'PUT', body: JSON.stringify({ range: `${sheetName}!A1`, majorDimension: 'ROWS', values }) });
}

async function readValues(id, sheetName) {
    const range = encodeURIComponent(`'${sheetName.replace(/'/g, "''")}'!A1:Z50000`);
    const data = await googleRequest(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}`);
    return data.values || [];
}

async function request(url, options = {}) {
    const token = await accessToken();
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || `Google Sheets trả lỗi ${response.status}`);
    return data;
}

function range(sheetName) { return encodeURIComponent(`'${sheetName.replace(/'/g, "''")}'!A:O`); }

async function createSpreadsheet(title) {
    return request('https://sheets.googleapis.com/v4/spreadsheets', { method: 'POST', body: JSON.stringify({ properties: { title }, sheets: [{ properties: { title: 'Asset Master', gridProperties: { frozenRowCount: 1 } } }] }) });
}

async function writeValues(spreadsheetId, sheetName, values) {
    const target = `'${sheetName.replace(/'/g, "''")}'!A1`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(target)}?valueInputOption=RAW`;
    await request(url, { method: 'PUT', body: JSON.stringify({ range: target, majorDimension: 'ROWS', values }) });
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

async function readValues(spreadsheetId, sheetName) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range(sheetName)}?majorDimension=ROWS`;
    return (await request(url)).values || [];
}

function spreadsheetId(input) {
    const value = String(input || '').trim();
    const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const id = match ? match[1] : value;
    if (!/^[a-zA-Z0-9-_]{20,}$/.test(id)) throw new Error('Liên kết hoặc mã Google Sheet không hợp lệ');
    return id;
}

module.exports = { config, createSpreadsheet, writeValues, readValues, spreadsheetId };
