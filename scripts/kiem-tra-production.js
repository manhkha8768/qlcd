const { auditProductionConfig } = require('../lib/production-readiness');
const result = auditProductionConfig();
console.log(JSON.stringify(result, null, 2));
process.exit(result.ready ? 0 : 1);
