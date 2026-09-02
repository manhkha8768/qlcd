const { profileQueryPlans } = require('../lib/query-profile');
const db = require('../db');
const rows = profileQueryPlans();
console.log(JSON.stringify(rows, null, 2));
try { db.close(); } catch (_) {}
process.exit(rows.every(x => x.indexed) ? 0 : 1);
