const crypto = require('crypto');

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalMigrationText(sql) {
    return String(sql).replace(/\r\n?/g, '\n');
}

function migrationChecksum(sql) {
    return sha256(canonicalMigrationText(sql));
}

function matchesMigrationChecksum(storedChecksum, sql) {
    const canonical = canonicalMigrationText(sql);
    const compatibleChecksums = new Set([
        sha256(String(sql)),
        sha256(canonical),
        sha256(canonical.replace(/\n/g, '\r\n'))
    ]);
    return compatibleChecksums.has(storedChecksum);
}

module.exports = { migrationChecksum, matchesMigrationChecksum };
