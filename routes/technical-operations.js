const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { dangNhap, coMaQuyenNay, donViDuocPhep, duocThaoTacDonVi } = require('../middleware/quyen');

const r = express.Router();
r.use(dangNhap);
const uuid = () => crypto.randomUUID();

function workOrder(id) {
    return db.prepare(`SELECT w.*,d.ma_thiet_bi,d.ten AS device_name,d.don_vi_id,d.legacy_thiet_bi_id,
        px.ma AS unit_code,px.ten AS unit_name,c.component_code,c.name AS component_name
        FROM technical_work_orders w JOIN devices d ON d.id=w.device_id
        JOIN phan_xuong px ON px.id=d.don_vi_id
        LEFT JOIN device_components c ON c.id=w.primary_component_id WHERE w.id=?`).get(id);
}
function allowed(req, order) {
    return order && duocThaoTacDonVi(req.session.nguoiDung, order.don_vi_id);
}
function componentFor(deviceId, componentId) {
    if (!componentId) return null;
    return db.prepare('SELECT * FROM device_components WHERE id=? AND device_id=? AND active=1')
        .get(componentId, deviceId);
}
function addEvent(order, type, actorId, fromStatus, toStatus, reason, details) {
    db.prepare(`INSERT INTO technical_work_order_events
        (work_order_id,event_type,from_status,to_status,work_order_version,reason,details_json,actor_id)
        VALUES (?,?,?,?,?,?,?,?)`).run(order.id, type, fromStatus || null, toStatus || null,
        order.version, reason || null, details ? JSON.stringify(details) : null, actorId);
}
function componentEvent(component, eventType, actorId, details) {
    db.prepare(`INSERT INTO component_events
        (component_id,device_id,event_type,component_version,details_json,actor_id)
        VALUES (?,?,?,?,?,?)`).run(component.id, component.device_id, eventType, component.version,
        JSON.stringify(details || {}), actorId);
}
function rebuildStockProjection() {
    db.prepare('DELETE FROM stock_balance_projection').run();
    db.prepare(`INSERT INTO stock_balance_projection
        (warehouse_id,material_id,uom_code,on_hand,reserved,incoming,last_entry_id,updated_at)
        SELECT warehouse_id,material_id,uom_code,SUM(on_hand_delta),SUM(reserved_delta),
        SUM(incoming_delta),MAX(id),datetime('now','localtime')
        FROM stock_ledger_entries GROUP BY warehouse_id,material_id,uom_code`).run();
}
function nextVersion(order, expected) {
    if (Number(expected) !== Number(order.version)) {
        throw Object.assign(new Error('Công việc đã thay đổi; vui lòng tải lại'), { status: 409 });
    }
    return order.version + 1;
}
function respondError(res, error) {
    const message = /CHECK constraint/.test(error.message)
        ? 'Không đủ tồn kho khả dụng để thực hiện' : error.message;
    res.status(error.status || (/UNIQUE/.test(error.message) ? 409 : 400)).json({ loi: message });
}

r.get('/work-orders', coMaQuyenNay('technical_operation.view'), (req, res) => {
    const where = ['1=1']; const params = [];
    const scope = donViDuocPhep(req.session.nguoiDung);
    if (scope !== null) {
        if (!scope.length) where.push('1=0');
        else { where.push(`d.don_vi_id IN (${scope.map(() => '?').join(',')})`); params.push(...scope); }
    } else if (req.query.don_vi_id) { where.push('d.don_vi_id=?'); params.push(req.query.don_vi_id); }
    if (req.query.operation_type) { where.push('w.operation_type=?'); params.push(req.query.operation_type); }
    if (req.query.status) { where.push('w.status=?'); params.push(req.query.status); }
    if (req.query.device_id) { where.push('w.device_id=?'); params.push(req.query.device_id); }
    if (req.query.q?.trim()) {
        const q = `%${req.query.q.trim()}%`;
        where.push('(w.work_order_code LIKE ? OR w.description LIKE ? OR d.ma_thiet_bi LIKE ? OR d.ten LIKE ?)');
        params.push(q, q, q, q);
    }
    res.json(db.prepare(`SELECT w.*,d.ma_thiet_bi,d.ten AS device_name,d.don_vi_id,
        px.ma AS unit_code,px.ten AS unit_name,c.component_code,c.name AS component_name,
        (SELECT COUNT(*) FROM technical_material_issues i WHERE i.work_order_id=w.id AND i.status='POSTED') AS material_issue_count
        FROM technical_work_orders w JOIN devices d ON d.id=w.device_id
        JOIN phan_xuong px ON px.id=d.don_vi_id
        LEFT JOIN device_components c ON c.id=w.primary_component_id
        WHERE ${where.join(' AND ')} ORDER BY w.created_at DESC,w.work_order_code DESC LIMIT 500`).all(...params));
});

r.get('/work-orders/:id', coMaQuyenNay('technical_operation.view'), (req, res) => {
    const order = workOrder(req.params.id);
    if (!order) return res.status(404).json({ loi: 'Không tìm thấy công việc kỹ thuật' });
    if (!allowed(req, order)) return res.status(403).json({ loi: 'Không có quyền' });
    res.json({ work_order: order,
        material_issues: db.prepare(`SELECT i.*,m.material_code,m.name AS material_name,
            w.warehouse_code,w.name AS warehouse_name
            FROM technical_material_issues i JOIN materials m ON m.id=i.material_id
            JOIN warehouses w ON w.id=i.warehouse_id WHERE i.work_order_id=? ORDER BY i.issued_at`)
            .all(order.id),
        events: db.prepare(`SELECT e.*,u.ho_ten AS actor_name FROM technical_work_order_events e
            LEFT JOIN nguoi_dung u ON u.id=e.actor_id WHERE e.work_order_id=? ORDER BY e.id`).all(order.id) });
});

r.post('/work-orders', coMaQuyenNay('technical_operation.create'), (req, res) => {
    const b = req.body || {};
    const types = ['REPAIR','MAINTENANCE','INSPECTION'];
    const priorities = ['NORMAL','URGENT','STOP_PRODUCTION'];
    if (!types.includes(b.operation_type) || !b.description?.trim() || !b.idempotency_key?.trim()) {
        return res.status(422).json({ loi: 'Loại công việc, nội dung và idempotency key là bắt buộc' });
    }
    const existing = db.prepare('SELECT id FROM technical_work_orders WHERE idempotency_key=?')
        .get(b.idempotency_key.trim());
    if (existing) return res.json({ id: existing.id, idempotent: true });
    const device = db.prepare('SELECT * FROM devices WHERE id=? AND hoat_dong=1').get(b.device_id);
    if (!device) return res.status(404).json({ loi: 'Không tìm thấy Device canonical' });
    if (!duocThaoTacDonVi(req.session.nguoiDung, device.don_vi_id)) {
        return res.status(403).json({ loi: 'Không có quyền với Device này' });
    }
    const component = componentFor(device.id, b.primary_component_id);
    if (b.primary_component_id && !component) {
        return res.status(422).json({ loi: 'Component không thuộc Device hoặc đã ngừng hiệu lực' });
    }
    const id = uuid();
    const code = String(b.work_order_code || `TO-${b.operation_type.slice(0,3)}-${Date.now()}-${id.slice(0,4)}`)
        .trim().toUpperCase();
    try {
        db.transaction(() => {
            db.prepare(`INSERT INTO technical_work_orders
                (id,work_order_code,operation_type,device_id,primary_component_id,priority,description,
                 diagnosis,scheduled_date,idempotency_key,created_by,updated_by)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, code, b.operation_type, device.id,
                component?.id || null, priorities.includes(b.priority) ? b.priority : 'NORMAL',
                b.description.trim(), b.diagnosis || null, b.scheduled_date || null,
                b.idempotency_key.trim(), req.session.nguoiDung.id, req.session.nguoiDung.id);
            addEvent({ id, version: 1 }, 'CREATED', req.session.nguoiDung.id, null, 'DRAFT', null,
                { device_id: device.id, component_id: component?.id || null });
        })();
        res.status(201).json({ id, work_order_code: code, version: 1 });
    } catch (error) { respondError(res, error); }
});

function transition(req, res, config) {
    const order = workOrder(req.params.id); const b = req.body || {};
    if (!order) return res.status(404).json({ loi: 'Không tìm thấy công việc kỹ thuật' });
    if (!allowed(req, order)) return res.status(403).json({ loi: 'Không có quyền' });
    if (!config.from.includes(order.status)) return res.status(409).json({ loi: 'Trạng thái công việc không hợp lệ' });
    if (config.reason && !b.reason?.trim()) return res.status(422).json({ loi: 'Phải nhập lý do' });
    try {
        const version = nextVersion(order, b.version);
        db.transaction(() => {
            const changed = db.prepare(`UPDATE technical_work_orders SET status=?,version=version+1,
                updated_by=?,updated_at=datetime('now','localtime') WHERE id=? AND version=?`)
                .run(config.to, req.session.nguoiDung.id, order.id, order.version);
            if (!changed.changes) throw Object.assign(new Error('Công việc đã thay đổi; vui lòng tải lại'), { status: 409 });
            addEvent({ id: order.id, version }, config.event, req.session.nguoiDung.id,
                order.status, config.to, b.reason, null);
        })();
        res.json({ ok: true, status: config.to, version });
    } catch (error) { respondError(res, error); }
}

r.post('/work-orders/:id/submit', coMaQuyenNay('technical_operation.create'),
    (req, res) => transition(req, res, { from: ['DRAFT','RETURNED'], to: 'SUBMITTED', event: 'SUBMITTED' }));
r.post('/work-orders/:id/return', coMaQuyenNay('technical_operation.review'),
    (req, res) => transition(req, res, { from: ['SUBMITTED'], to: 'RETURNED', event: 'RETURNED', reason: true }));
r.post('/work-orders/:id/approve', coMaQuyenNay('technical_operation.review'),
    (req, res) => transition(req, res, { from: ['SUBMITTED'], to: 'APPROVED', event: 'APPROVED', reason: true }));
r.post('/work-orders/:id/reject', coMaQuyenNay('technical_operation.review'),
    (req, res) => transition(req, res, { from: ['SUBMITTED'], to: 'REJECTED', event: 'REJECTED', reason: true }));

r.post('/work-orders/:id/start', coMaQuyenNay('technical_operation.execute'), (req, res) => {
    const order = workOrder(req.params.id); const b = req.body || {};
    if (!order) return res.status(404).json({ loi: 'Không tìm thấy công việc kỹ thuật' });
    if (!allowed(req, order)) return res.status(403).json({ loi: 'Không có quyền' });
    if (order.status !== 'APPROVED') return res.status(409).json({ loi: 'Chỉ công việc đã duyệt mới được bắt đầu' });
    try {
        const version = nextVersion(order, b.version);
        db.transaction(() => {
            const changed = db.prepare(`UPDATE technical_work_orders SET status='IN_PROGRESS',started_at=COALESCE(?,datetime('now','localtime')),
                version=version+1,updated_by=?,updated_at=datetime('now','localtime') WHERE id=? AND version=?`)
                .run(b.started_at || null, req.session.nguoiDung.id, order.id, order.version);
            if (!changed.changes) throw Object.assign(new Error('Công việc đã thay đổi; vui lòng tải lại'), { status: 409 });
            if (order.operation_type !== 'INSPECTION') {
                db.prepare("UPDATE devices SET trang_thai='dang_sua',version=version+1,nguoi_sua_id=?,ngay_sua=datetime('now','localtime') WHERE id=?")
                    .run(req.session.nguoiDung.id, order.device_id);
                if (order.legacy_thiet_bi_id) db.prepare("UPDATE thiet_bi SET trang_thai='dang_sua' WHERE id=?")
                    .run(order.legacy_thiet_bi_id);
            }
            addEvent({ id: order.id, version }, 'STARTED', req.session.nguoiDung.id,
                order.status, 'IN_PROGRESS', b.reason, null);
        })();
        res.json({ ok: true, status: 'IN_PROGRESS', version });
    } catch (error) { respondError(res, error); }
});

r.post('/work-orders/:id/material-issues', coMaQuyenNay('technical_operation.material_issue'), (req, res) => {
    const order = workOrder(req.params.id); const b = req.body || {};
    if (!order) return res.status(404).json({ loi: 'Không tìm thấy công việc kỹ thuật' });
    if (!allowed(req, order)) return res.status(403).json({ loi: 'Không có quyền' });
    if (order.status !== 'IN_PROGRESS' || order.operation_type === 'INSPECTION') {
        return res.status(409).json({ loi: 'Chỉ repair/maintenance đang thực hiện mới được xuất vật tư' });
    }
    if (!b.idempotency_key?.trim() || !b.reason?.trim()) {
        return res.status(422).json({ loi: 'Idempotency key và lý do xuất là bắt buộc' });
    }
    const existing = db.prepare('SELECT * FROM technical_material_issues WHERE idempotency_key=?')
        .get(b.idempotency_key.trim());
    if (existing) return res.json({ id: existing.id, stock_transaction_id: existing.stock_transaction_id, idempotent: true });
    const component = componentFor(order.device_id, b.component_id || order.primary_component_id);
    const warehouse = db.prepare("SELECT * FROM warehouses WHERE id=? AND status='ACTIVE'").get(b.warehouse_id);
    const material = db.prepare("SELECT * FROM materials WHERE id=? AND status='ACTIVE'").get(b.material_id);
    const quantity = Number(b.quantity);
    if (!component) return res.status(422).json({ loi: 'Phải chọn Component canonical thuộc Device' });
    if (!warehouse || (warehouse.don_vi_id != null && !duocThaoTacDonVi(req.session.nguoiDung, warehouse.don_vi_id))) {
        return res.status(403).json({ loi: 'Kho ngoài phạm vi được phân công' });
    }
    if (!material || !(quantity > 0) || (b.uom_code && b.uom_code !== material.base_uom_code)) {
        return res.status(422).json({ loi: 'Material, UOM hoặc số lượng không hợp lệ' });
    }
    const balance = db.prepare(`SELECT on_hand-reserved AS available FROM stock_balance_projection
        WHERE warehouse_id=? AND material_id=? AND uom_code=?`).get(warehouse.id, material.id, material.base_uom_code);
    if (Number(balance?.available || 0) < quantity) return res.status(409).json({ loi: 'Không đủ AVAILABLE trong kho' });
    const issueId = uuid(), txId = uuid(), lineId = uuid(), entryId = uuid();
    const txCode = `TECH-ISSUE-${Date.now()}-${issueId.slice(0,4)}`.toUpperCase();
    try {
        const version = nextVersion(order, b.version);
        db.transaction(() => {
            db.prepare(`INSERT INTO stock_transactions
                (id,transaction_code,type,status,idempotency_key,reference_no,reason,created_by,posted_by,posted_at)
                VALUES (?,?,'ISSUE','POSTED',?,?,?,?,?,datetime('now','localtime'))`)
                .run(txId, txCode, `technical:${b.idempotency_key.trim()}`, order.work_order_code,
                    b.reason.trim(), req.session.nguoiDung.id, req.session.nguoiDung.id);
            db.prepare(`INSERT INTO stock_transaction_lines
                (id,transaction_id,warehouse_id,material_id,uom_code,quantity,on_hand_delta,note)
                VALUES (?,?,?,?,?,?,-?,?)`).run(lineId, txId, warehouse.id, material.id,
                material.base_uom_code, quantity, quantity, `Work order ${order.work_order_code}`);
            db.prepare(`INSERT INTO stock_ledger_entries
                (id,transaction_id,line_id,warehouse_id,material_id,uom_code,on_hand_delta,entry_type,event_time,posted_by)
                VALUES (?,?,?,?,?,?,-?,'ISSUE',datetime('now','localtime'),?)`)
                .run(entryId, txId, lineId, warehouse.id, material.id, material.base_uom_code,
                    quantity, req.session.nguoiDung.id);
            rebuildStockProjection();
            db.prepare(`INSERT INTO technical_material_issues
                (id,work_order_id,component_id,stock_transaction_id,warehouse_id,material_id,uom_code,
                 quantity,idempotency_key,reason,issued_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
                .run(issueId, order.id, component.id, txId, warehouse.id, material.id,
                    material.base_uom_code, quantity, b.idempotency_key.trim(), b.reason.trim(),
                    req.session.nguoiDung.id);
            const changed = db.prepare(`UPDATE technical_work_orders SET version=version+1,updated_by=?,
                updated_at=datetime('now','localtime') WHERE id=? AND version=?`)
                .run(req.session.nguoiDung.id, order.id, order.version);
            if (!changed.changes) throw Object.assign(new Error('Công việc đã thay đổi; vui lòng tải lại'), { status: 409 });
            addEvent({ id: order.id, version }, 'MATERIAL_ISSUED', req.session.nguoiDung.id,
                order.status, order.status, b.reason, { issue_id: issueId, stock_transaction_id: txId,
                    component_id: component.id, material_id: material.id, quantity, uom_code: material.base_uom_code });
            componentEvent(component, 'MATERIAL_USE', req.session.nguoiDung.id,
                { work_order_id: order.id, technical_material_issue_id: issueId, stock_transaction_id: txId,
                    material_id: material.id, quantity, uom_code: material.base_uom_code });
        })();
        res.status(201).json({ id: issueId, stock_transaction_id: txId, version });
    } catch (error) { respondError(res, error); }
});

r.post('/work-orders/:id/material-issues/:issueId/reverse', coMaQuyenNay('technical_operation.material_issue'), (req, res) => {
    const order = workOrder(req.params.id); const b = req.body || {};
    if (!order) return res.status(404).json({ loi: 'Không tìm thấy công việc kỹ thuật' });
    if (!allowed(req, order)) return res.status(403).json({ loi: 'Không có quyền' });
    if (order.status !== 'IN_PROGRESS' || !b.reason?.trim()) {
        return res.status(409).json({ loi: 'Chỉ được reversal khi đang thực hiện và có lý do' });
    }
    const issue = db.prepare(`SELECT * FROM technical_material_issues
        WHERE id=? AND work_order_id=?`).get(req.params.issueId, order.id);
    if (!issue || issue.status !== 'POSTED') return res.status(409).json({ loi: 'Dòng vật tư không thể reversal' });
    const original = db.prepare('SELECT * FROM stock_ledger_entries WHERE transaction_id=?').all(issue.stock_transaction_id);
    const reversalId = uuid(); const code = `REV-TECH-${Date.now()}-${reversalId.slice(0,4)}`.toUpperCase();
    try {
        const version = nextVersion(order, b.version);
        db.transaction(() => {
            db.prepare(`INSERT INTO stock_transactions
                (id,transaction_code,type,status,idempotency_key,reference_no,reason,reversal_of_id,created_by,posted_by,posted_at)
                VALUES (?,?,'REVERSAL','POSTED',?,?,?,?,?,?,datetime('now','localtime'))`)
                .run(reversalId, code, `technical-reverse:${issue.id}`, order.work_order_code,
                    b.reason.trim(), issue.stock_transaction_id, req.session.nguoiDung.id, req.session.nguoiDung.id);
            for (const entry of original) {
                const lineId = uuid(), entryId = uuid();
                db.prepare(`INSERT INTO stock_transaction_lines
                    (id,transaction_id,warehouse_id,material_id,uom_code,quantity,on_hand_delta,reserved_delta,incoming_delta,note)
                    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(lineId, reversalId, entry.warehouse_id, entry.material_id,
                    entry.uom_code, Math.max(Math.abs(entry.on_hand_delta),Math.abs(entry.reserved_delta),Math.abs(entry.incoming_delta)),
                    -entry.on_hand_delta,-entry.reserved_delta,-entry.incoming_delta,`Reversal ${order.work_order_code}`);
                db.prepare(`INSERT INTO stock_ledger_entries
                    (id,transaction_id,line_id,warehouse_id,material_id,uom_code,on_hand_delta,reserved_delta,
                     incoming_delta,entry_type,event_time,posted_by,reversal_of_entry_id)
                    VALUES (?,?,?,?,?,?,?,?,?,'REVERSAL',datetime('now','localtime'),?,?)`)
                    .run(entryId,reversalId,lineId,entry.warehouse_id,entry.material_id,entry.uom_code,
                        -entry.on_hand_delta,-entry.reserved_delta,-entry.incoming_delta,
                        req.session.nguoiDung.id,entry.id);
            }
            db.prepare("UPDATE stock_transactions SET status='REVERSED' WHERE id=? AND status='POSTED'")
                .run(issue.stock_transaction_id);
            rebuildStockProjection();
            db.prepare(`UPDATE technical_material_issues SET status='REVERSED',reversal_stock_transaction_id=?,
                reversed_by=?,reversed_at=datetime('now','localtime') WHERE id=? AND status='POSTED'`)
                .run(reversalId, req.session.nguoiDung.id, issue.id);
            const changed = db.prepare(`UPDATE technical_work_orders SET version=version+1,updated_by=?,
                updated_at=datetime('now','localtime') WHERE id=? AND version=?`)
                .run(req.session.nguoiDung.id, order.id, order.version);
            if (!changed.changes) throw Object.assign(new Error('Công việc đã thay đổi; vui lòng tải lại'), { status: 409 });
            addEvent({ id: order.id, version }, 'MATERIAL_REVERSED', req.session.nguoiDung.id,
                order.status, order.status, b.reason, { issue_id: issue.id, reversal_stock_transaction_id: reversalId });
        })();
        res.status(201).json({ id: reversalId, version });
    } catch (error) { respondError(res, error); }
});

r.post('/work-orders/:id/complete', coMaQuyenNay('technical_operation.execute'), (req, res) => {
    const order = workOrder(req.params.id); const b = req.body || {};
    const results = ['PASS','CONDITIONAL','FAIL'];
    if (!order) return res.status(404).json({ loi: 'Không tìm thấy công việc kỹ thuật' });
    if (!allowed(req, order)) return res.status(403).json({ loi: 'Không có quyền' });
    if (order.status !== 'IN_PROGRESS') return res.status(409).json({ loi: 'Công việc chưa ở trạng thái đang thực hiện' });
    if (!results.includes(b.result) || (order.operation_type !== 'INSPECTION' && !b.action_taken?.trim())) {
        return res.status(422).json({ loi: 'Kết quả và biện pháp thực hiện là bắt buộc' });
    }
    try {
        const version = nextVersion(order, b.version);
        db.transaction(() => {
            const changed = db.prepare(`UPDATE technical_work_orders SET status='COMPLETED',result=?,
                action_taken=COALESCE(?,action_taken),diagnosis=COALESCE(?,diagnosis),
                completed_at=COALESCE(?,datetime('now','localtime')),next_due_date=?,version=version+1,
                updated_by=?,updated_at=datetime('now','localtime') WHERE id=? AND version=?`)
                .run(b.result,b.action_taken||null,b.diagnosis||null,b.completed_at||null,b.next_due_date||null,
                    req.session.nguoiDung.id,order.id,order.version);
            if (!changed.changes) throw Object.assign(new Error('Công việc đã thay đổi; vui lòng tải lại'), { status: 409 });
            const otherActive = db.prepare(`SELECT 1 FROM technical_work_orders WHERE device_id=? AND id<>?
                AND operation_type IN('REPAIR','MAINTENANCE') AND status='IN_PROGRESS' LIMIT 1`)
                .get(order.device_id, order.id);
            const state = b.result === 'FAIL' ? ['dang_sua','hong']
                : b.result === 'CONDITIONAL' ? ['hoat_dong','trung_binh'] : ['hoat_dong','tot'];
            if (b.result === 'FAIL' || !otherActive) {
                db.prepare(`UPDATE devices SET trang_thai=?,tinh_trang_ky_thuat=?,version=version+1,
                    nguoi_sua_id=?,ngay_sua=datetime('now','localtime') WHERE id=?`)
                    .run(state[0],state[1],req.session.nguoiDung.id,order.device_id);
                if (order.legacy_thiet_bi_id) db.prepare('UPDATE thiet_bi SET trang_thai=?,tinh_trang_kt=? WHERE id=?')
                    .run(state[0],state[1],order.legacy_thiet_bi_id);
            }
            const component = componentFor(order.device_id, order.primary_component_id);
            if (component) {
                const condition = b.result === 'FAIL' ? 'FAILED' : b.result === 'CONDITIONAL' ? 'FAIR' : 'GOOD';
                db.prepare(`UPDATE device_components SET condition=?,version=version+1,updated_by=?,
                    updated_at=datetime('now','localtime') WHERE id=?`).run(condition,req.session.nguoiDung.id,component.id);
                const updated = db.prepare('SELECT * FROM device_components WHERE id=?').get(component.id);
                const eventType = order.operation_type === 'REPAIR' ? 'REPAIR'
                    : order.operation_type === 'MAINTENANCE' ? 'MAINTENANCE' : 'INSPECT';
                componentEvent(updated,eventType,req.session.nguoiDung.id,
                    { work_order_id: order.id,result:b.result,next_due_date:b.next_due_date||null });
            }
            addEvent({ id: order.id, version }, 'COMPLETED', req.session.nguoiDung.id,
                order.status, 'COMPLETED', b.reason, { result:b.result,next_due_date:b.next_due_date||null });
        })();
        res.json({ ok: true, status: 'COMPLETED', version });
    } catch (error) { respondError(res, error); }
});

r.post('/work-orders/:id/cancel', coMaQuyenNay('technical_operation.create'), (req, res) => {
    const order = workOrder(req.params.id); const b = req.body || {};
    if (!order) return res.status(404).json({ loi: 'Không tìm thấy công việc kỹ thuật' });
    if (!allowed(req, order)) return res.status(403).json({ loi: 'Không có quyền' });
    if (!['DRAFT','RETURNED','APPROVED'].includes(order.status) || !b.reason?.trim()) {
        return res.status(409).json({ loi: 'Công việc không thể hủy hoặc chưa có lý do' });
    }
    if (db.prepare("SELECT 1 FROM technical_material_issues WHERE work_order_id=? AND status='POSTED'").get(order.id)) {
        return res.status(409).json({ loi: 'Phải reversal toàn bộ vật tư trước khi hủy' });
    }
    transition(req, res, { from: ['DRAFT','RETURNED','APPROVED'], to: 'CANCELLED', event: 'CANCELLED', reason: true });
});

module.exports = r;
