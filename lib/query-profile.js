const db = require('../db');
const QUERIES = [
    { name: 'asset_transfer_source_scope', sql: 'SELECT transaction_id FROM asset_transaction_lines WHERE don_vi_nguon_id=?', params: [1], index: 'idx_asset_lines_source_tx' },
    { name: 'asset_transfer_destination_scope', sql: 'SELECT transaction_id FROM asset_transaction_lines WHERE don_vi_dich_id=?', params: [1], index: 'idx_asset_lines_destination_tx' },
    { name: 'stock_transaction_detail', sql: 'SELECT * FROM stock_transaction_lines WHERE transaction_id=?', params: ['x'], index: 'idx_stock_lines_transaction' },
    { name: 'stock_ledger_transaction', sql: 'SELECT * FROM stock_ledger_entries WHERE transaction_id=?', params: ['x'], index: 'idx_stock_entries_transaction' },
    { name: 'report_export_queue', sql: "SELECT id FROM report_export_runs WHERE status='RUNNING' ORDER BY started_at DESC", params: [], index: 'idx_report_exports_status_started' },
    { name: 'notification_job_queue', sql: "SELECT id FROM notification_job_runs WHERE status='RUNNING' ORDER BY started_at DESC", params: [], index: 'idx_notification_jobs_status_started' },
    { name: 'operational_error_queue', sql: "SELECT id FROM operational_error_events WHERE status='OPEN' ORDER BY occurred_at DESC", params: [], index: 'idx_operational_errors_queue' }
];
function profileQueryPlans() {
    return QUERIES.map(item => {
        const detail = db.prepare(`EXPLAIN QUERY PLAN ${item.sql}`).all(...item.params).map(x => x.detail).join(' | ');
        return { name: item.name, expected_index: item.index, detail, indexed: detail.includes(item.index) };
    });
}
module.exports = { QUERIES, profileQueryPlans };
