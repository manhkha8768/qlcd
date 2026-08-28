const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.QLCD_DB || path.join(__dirname, 'qlcd.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

module.exports = db;
module.exports.DB_PATH = DB_PATH;
