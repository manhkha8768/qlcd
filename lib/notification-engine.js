const crypto = require('crypto');
const db = require('../db');

const uuid = () => crypto.randomUUID();
const ACTIVE = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'];
const SEVERITY = ['INFO', 'WARNING', 'HIGH', 'CRITICAL'];

function sqlDate(date) {
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
        + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
function addHours(date, hours) {
    return sqlDate(new Date(date.getTime() + Number(hours) * 3600000));
}
function addDaysText(value, days) {
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + Number(days));
    return date.toISOString().slice(0, 10);
}

function findingsFor(rule, today) {
    if (rule.code === 'TECHNICAL_DUE') {
        return db.prepare(`SELECT w.id entity_id,w.next_due_date source_due_at,d.don_vi_id,
            w.work_order_code,d.ma_thiet_bi,d.ten device_name,w.operation_type
            FROM technical_work_orders w JOIN devices d ON d.id=w.device_id
            WHERE w.status='COMPLETED' AND w.next_due_date IS NOT NULL
              AND date(w.next_due_date)<=date(?, '+'||?||' days')`).all(today, rule.lead_days).map(x => ({
                ...x, entity_type: 'TECHNICAL_WORK_ORDER',
                fingerprint: `${rule.code}:${x.entity_id}:${x.source_due_at}`,
                title: `${x.ma_thiet_bi} đến hạn ${x.operation_type === 'INSPECTION' ? 'kiểm định' : 'bảo dưỡng'}`,
                details: `${x.work_order_code} · ${x.device_name} · hạn ${x.source_due_at}`,
                severity: x.source_due_at < today ? 'HIGH' : rule.default_severity
            }));
    }
    if (rule.code === 'NCVT_REVIEW_PENDING') {
        return db.prepare(`SELECT s.id entity_id,s.submission_code,s.don_vi_id,s.period_id,s.submitted_at,
            p.period_code,px.ten unit_name FROM ncvt_submissions s
            JOIN ncvt_periods p ON p.id=s.period_id JOIN phan_xuong px ON px.id=s.don_vi_id
            WHERE s.status='SUBMITTED'`).all().map(x => ({
                ...x, entity_type: 'NCVT_SUBMISSION', fingerprint: `${rule.code}:${x.entity_id}`,
                source_due_at: addDaysText(x.submitted_at || today, rule.lead_days),
                title: `${x.submission_code} đang chờ review`,
                details: `${x.unit_name} · kỳ ${x.period_code}`,
                severity: addDaysText(x.submitted_at || today, rule.lead_days) < today ? 'HIGH' : rule.default_severity
            }));
    }
    if (rule.code === 'MATERIAL_MAPPING_REVIEW') {
        return db.prepare(`SELECT id entity_id,material_id,source_type,source_id,source_code,source_name,mapping_status
            FROM material_source_mappings WHERE mapping_status<>'MAPPED' OR material_id IS NULL`).all().map(x => ({
                ...x, entity_type: 'MATERIAL_SOURCE_MAPPING', fingerprint: `${rule.code}:${x.entity_id}`,
                title: `${x.source_code || x.source_id} chưa map Material chuẩn`,
                details: `${x.source_type} · ${x.source_name || 'Chưa có tên'} · ${x.mapping_status}`,
                severity: x.mapping_status === 'UNMAPPED' || !x.material_id ? 'HIGH' : rule.default_severity
            }));
    }
    if (rule.code === 'MATERIAL_DUPLICATE_PENDING') {
        return db.prepare(`SELECT c.id entity_id,c.reason,c.score,a.material_code code_a,a.name name_a,
            b.material_code code_b,b.name name_b FROM material_duplicate_candidates c
            JOIN materials a ON a.id=c.material_a_id JOIN materials b ON b.id=c.material_b_id
            WHERE c.status='PENDING'`).all().map(x => ({
                ...x, entity_type: 'MATERIAL_DUPLICATE', fingerprint: `${rule.code}:${x.entity_id}`,
                title: `${x.code_a} và ${x.code_b} nghi trùng`,
                details: `${x.name_a} / ${x.name_b} · độ tin cậy ${Math.round(Number(x.score) * 100)}%`,
                severity: rule.default_severity
            }));
    }
    if (rule.code === 'DOCUMENT_HASH_MISSING') {
        return db.prepare(`SELECT v.id entity_id,v.document_id,v.version_number,v.original_filename,
            d.document_code,d.title FROM document_versions v JOIN documents d ON d.id=v.document_id
            WHERE d.status='ACTIVE' AND (v.sha256 IS NULL OR length(v.sha256)<>64)`).all().map(x => ({
                ...x, entity_type: 'DOCUMENT_VERSION', fingerprint: `${rule.code}:${x.entity_id}`,
                title: `${x.document_code} thiếu SHA-256`,
                details: `${x.original_filename} · phiên bản ${x.version_number}`,
                severity: rule.default_severity
            }));
    }
    return [];
}

function fallbackOwner(role) {
    return db.prepare(`SELECT id FROM nguoi_dung WHERE hoat_dong=1 AND vai_tro=?
        ORDER BY id LIMIT 1`).get(role)?.id
        || db.prepare("SELECT id FROM nguoi_dung WHERE hoat_dong=1 AND vai_tro='admin' ORDER BY id LIMIT 1").get()?.id
        || null;
}
function ownerFor(rule, finding) {
    if (rule.owner_strategy === 'ASSIGNED_REVIEWER' && finding.entity_type === 'NCVT_SUBMISSION') {
        const assigned = db.prepare(`SELECT reviewer_user_id id FROM ncvt_review_assignments
            WHERE period_id=? AND don_vi_id=? AND status='ACTIVE' ORDER BY assigned_at DESC LIMIT 1`)
            .get(finding.period_id, finding.don_vi_id);
        if (assigned) return assigned.id;
    }
    if (rule.owner_strategy === 'UNIT_OPERATOR' && finding.don_vi_id) {
        const assigned = db.prepare(`SELECT n.id FROM nguoi_dung n
            WHERE n.hoat_dong=1 AND n.vai_tro='px' AND
            (n.phan_xuong_id=? OR EXISTS(SELECT 1 FROM nguoi_dung_don_vi a
              WHERE a.nguoi_dung_id=n.id AND a.don_vi_id=? AND a.hoat_dong=1
              AND (a.tu_ngay IS NULL OR a.tu_ngay<=date('now','localtime'))
              AND (a.den_ngay IS NULL OR a.den_ngay>=date('now','localtime'))))
            ORDER BY n.id LIMIT 1`).get(finding.don_vi_id, finding.don_vi_id);
        if (assigned) return assigned.id;
    }
    return fallbackOwner(rule.default_owner_role);
}
function addEvent(caseId, eventType, fromStatus, toStatus, version, actorId, reason, details) {
    db.prepare(`INSERT INTO notification_case_events
        (case_id,event_type,from_status,to_status,case_version,actor_id,reason,details_json)
        VALUES (?,?,?,?,?,?,?,?)`).run(caseId, eventType, fromStatus || null, toStatus || null,
        version, actorId || null, reason || null, details ? JSON.stringify(details) : null);
}
function deliver(caseId, recipientId, event, escalationLevel = 0) {
    if (!recipientId) return;
    db.prepare(`INSERT OR IGNORE INTO notification_deliveries
        (id,case_id,recipient_user_id,delivery_event,escalation_level) VALUES (?,?,?,?,?)`)
        .run(uuid(), caseId, recipientId, event, escalationLevel);
}

function evaluateNotifications({ triggerType = 'SCHEDULED', actorId = null, now = new Date() } = {}) {
    const jobId = uuid();
    const stats = { rules_evaluated: 0, findings_seen: 0, cases_created: 0,
        cases_reopened: 0, cases_auto_resolved: 0, cases_escalated: 0 };
    const nowText = sqlDate(now); const today = nowText.slice(0, 10);
    db.prepare(`INSERT INTO notification_job_runs(id,trigger_type,status,started_by,started_at)
        VALUES (?,?,'RUNNING',?,?)`).run(jobId, triggerType, actorId, nowText);
    try {
        db.transaction(() => {
            const rules = db.prepare('SELECT * FROM notification_rules WHERE enabled=1 ORDER BY code').all();
            for (const rule of rules) {
                stats.rules_evaluated++;
                const findings = findingsFor(rule, today);
                stats.findings_seen += findings.length;
                const seen = new Set(findings.map(x => x.fingerprint));
                for (const finding of findings) {
                    const existing = db.prepare('SELECT * FROM notification_cases WHERE fingerprint=?').get(finding.fingerprint);
                    const ownerId = ownerFor(rule, finding);
                    if (!existing) {
                        const id = uuid();
                        db.prepare(`INSERT INTO notification_cases
                            (id,rule_code,fingerprint,category,entity_type,entity_id,don_vi_id,title,details,
                             severity,owner_user_id,owner_role,source_due_at,next_escalation_at,
                             first_detected_at,last_detected_at)
                            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, rule.code, finding.fingerprint,
                            rule.category, finding.entity_type, String(finding.entity_id), finding.don_vi_id || null,
                            finding.title, finding.details || null, finding.severity || rule.default_severity,
                            ownerId, rule.default_owner_role, finding.source_due_at || null,
                            addHours(now, rule.escalation_hours), nowText, nowText);
                        addEvent(id, 'DETECTED', null, 'OPEN', 1, actorId, null, { job_id: jobId });
                        deliver(id, ownerId, 'DETECTED'); stats.cases_created++;
                    } else if (existing.status === 'RESOLVED') {
                        const version = existing.version + 1;
                        db.prepare(`UPDATE notification_cases SET status='OPEN',title=?,details=?,severity=?,
                            owner_user_id=COALESCE(owner_user_id,?),source_due_at=?,next_escalation_at=?,
                            escalation_level=0,occurrence_count=occurrence_count+1,last_detected_at=?,
                            resolved_by=NULL,resolved_at=NULL,resolution_note=NULL,version=? WHERE id=?`)
                            .run(finding.title, finding.details || null, finding.severity || rule.default_severity,
                                ownerId, finding.source_due_at || null, addHours(now, rule.escalation_hours),
                                nowText, version, existing.id);
                        addEvent(existing.id, 'REOPENED', 'RESOLVED', 'OPEN', version, actorId, null, { job_id: jobId });
                        deliver(existing.id, existing.owner_user_id || ownerId, 'REOPENED'); stats.cases_reopened++;
                    } else if (existing.status !== 'DISMISSED') {
                        const severity = SEVERITY.indexOf(finding.severity) > SEVERITY.indexOf(existing.severity)
                            ? finding.severity : existing.severity;
                        db.prepare(`UPDATE notification_cases SET title=?,details=?,severity=?,source_due_at=?,
                            last_detected_at=?,occurrence_count=occurrence_count+1 WHERE id=?`)
                            .run(finding.title, finding.details || null, severity,
                                finding.source_due_at || null, nowText, existing.id);
                    }
                }
                const openCases = db.prepare(`SELECT * FROM notification_cases
                    WHERE rule_code=? AND status IN('OPEN','ACKNOWLEDGED','IN_PROGRESS')`).all(rule.code);
                for (const item of openCases.filter(x => !seen.has(x.fingerprint))) {
                    const version = item.version + 1;
                    db.prepare(`UPDATE notification_cases SET status='RESOLVED',resolved_at=?,resolution_note=?,
                        version=? WHERE id=?`).run(nowText, 'Nguồn dữ liệu đã đạt yêu cầu', version, item.id);
                    addEvent(item.id, 'AUTO_RESOLVED', item.status, 'RESOLVED', version, actorId,
                        'Nguồn dữ liệu đã đạt yêu cầu', { job_id: jobId });
                    deliver(item.id, item.owner_user_id, 'RESOLVED', item.escalation_level);
                    stats.cases_auto_resolved++;
                }
            }
            const due = db.prepare(`SELECT c.*,r.escalation_hours FROM notification_cases c
                JOIN notification_rules r ON r.code=c.rule_code
                WHERE c.status IN('OPEN','ACKNOWLEDGED','IN_PROGRESS')
                  AND c.next_escalation_at IS NOT NULL AND c.next_escalation_at<=?`).all(nowText);
            for (const item of due) {
                const level = item.escalation_level + 1;
                const severity = SEVERITY[Math.min(SEVERITY.length - 1,
                    SEVERITY.indexOf(item.severity) + 1)];
                const version = item.version + 1;
                db.prepare(`UPDATE notification_cases SET escalation_level=?,severity=?,next_escalation_at=?,
                    version=? WHERE id=?`).run(level, severity, addHours(now, item.escalation_hours), version, item.id);
                addEvent(item.id, 'ESCALATED', item.status, item.status, version, actorId,
                    'Quá thời hạn xử lý', { job_id: jobId, escalation_level: level });
                deliver(item.id, item.owner_user_id, 'ESCALATED', level);
                const admin = fallbackOwner('admin');
                if (admin !== item.owner_user_id) deliver(item.id, admin, 'ESCALATED', level);
                stats.cases_escalated++;
            }
            db.prepare(`UPDATE notification_job_runs SET status='SUCCEEDED',rules_evaluated=?,findings_seen=?,
                cases_created=?,cases_reopened=?,cases_auto_resolved=?,cases_escalated=?,finished_at=? WHERE id=?`)
                .run(stats.rules_evaluated, stats.findings_seen, stats.cases_created, stats.cases_reopened,
                    stats.cases_auto_resolved, stats.cases_escalated, nowText, jobId);
        })();
        return { id: jobId, status: 'SUCCEEDED', ...stats };
    } catch (error) {
        db.prepare(`UPDATE notification_job_runs SET status='FAILED',error_message=?,finished_at=? WHERE id=?`)
            .run(String(error.message).slice(0, 1000), nowText, jobId);
        throw error;
    }
}

let timer = null;
function startNotificationScheduler() {
    if (timer || process.env.NODE_ENV === 'test') return timer;
    const minutes = Number(process.env.QLCD_NOTIFICATION_INTERVAL_MINUTES || 15);
    if (!(minutes > 0)) return null;
    timer = setInterval(() => {
        try { evaluateNotifications({ triggerType: 'SCHEDULED' }); }
        catch (error) { console.error('[NOTIFICATION JOB]', error.message); }
    }, minutes * 60000);
    timer.unref();
    return timer;
}

module.exports = { evaluateNotifications, startNotificationScheduler, addEvent, deliver, ACTIVE };
