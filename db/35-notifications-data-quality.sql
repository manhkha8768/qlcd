-- TASK 22: canonical notifications, ownership, triage, escalation and data-quality findings.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS notification_rules (
    code TEXT PRIMARY KEY,
    category TEXT NOT NULL CHECK(category IN('NOTIFICATION','DATA_QUALITY')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    default_severity TEXT NOT NULL CHECK(default_severity IN('INFO','WARNING','HIGH','CRITICAL')),
    lead_days INTEGER NOT NULL DEFAULT 0 CHECK(lead_days>=0),
    escalation_hours INTEGER NOT NULL DEFAULT 24 CHECK(escalation_hours>=1),
    owner_strategy TEXT NOT NULL CHECK(owner_strategy IN('ASSIGNED_REVIEWER','UNIT_OPERATOR','ROLE')),
    default_owner_role TEXT NOT NULL CHECK(default_owner_role IN('admin','cd_cty','px')),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT(datetime('now','localtime'))
);

INSERT OR IGNORE INTO notification_rules
(code,category,title,description,default_severity,lead_days,escalation_hours,owner_strategy,default_owner_role) VALUES
('TECHNICAL_DUE','NOTIFICATION','Công việc kỹ thuật đến hạn','Theo dõi next_due_date của work order kỹ thuật đã hoàn thành','WARNING',30,24,'UNIT_OPERATOR','cd_cty'),
('NCVT_REVIEW_PENDING','NOTIFICATION','NCVT chờ review','Submission đã gửi nhưng chưa có quyết định','WARNING',2,24,'ASSIGNED_REVIEWER','cd_cty'),
('MATERIAL_MAPPING_REVIEW','DATA_QUALITY','Mapping vật tư cần xử lý','Nguồn vật tư chưa map hoặc đang chờ review','HIGH',0,48,'ROLE','cd_cty'),
('MATERIAL_DUPLICATE_PENDING','DATA_QUALITY','Material nghi trùng','Ứng viên trùng chưa có quyết định của người review','WARNING',0,72,'ROLE','cd_cty'),
('DOCUMENT_HASH_MISSING','DATA_QUALITY','File thiếu mã kiểm tra','Phiên bản file chưa có SHA-256 hợp lệ','HIGH',0,48,'ROLE','cd_cty');

CREATE TABLE IF NOT EXISTS notification_job_runs (
    id TEXT PRIMARY KEY,
    trigger_type TEXT NOT NULL CHECK(trigger_type IN('SCHEDULED','MANUAL','TEST')),
    status TEXT NOT NULL CHECK(status IN('RUNNING','SUCCEEDED','FAILED')),
    rules_evaluated INTEGER NOT NULL DEFAULT 0,
    findings_seen INTEGER NOT NULL DEFAULT 0,
    cases_created INTEGER NOT NULL DEFAULT 0,
    cases_reopened INTEGER NOT NULL DEFAULT 0,
    cases_auto_resolved INTEGER NOT NULL DEFAULT 0,
    cases_escalated INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    started_by INTEGER REFERENCES nguoi_dung(id),
    started_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),
    finished_at TEXT
);
CREATE TRIGGER IF NOT EXISTS trg_notification_job_runs_no_delete
BEFORE DELETE ON notification_job_runs BEGIN SELECT RAISE(ABORT,'Notification job run is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_notification_job_runs_terminal_no_update
BEFORE UPDATE ON notification_job_runs WHEN OLD.status<>'RUNNING'
BEGIN SELECT RAISE(ABORT,'Completed notification job run is immutable'); END;

CREATE TABLE IF NOT EXISTS notification_cases (
    id TEXT PRIMARY KEY,
    rule_code TEXT NOT NULL REFERENCES notification_rules(code) ON DELETE RESTRICT,
    fingerprint TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL CHECK(category IN('NOTIFICATION','DATA_QUALITY')),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    don_vi_id INTEGER REFERENCES phan_xuong(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    details TEXT,
    severity TEXT NOT NULL CHECK(severity IN('INFO','WARNING','HIGH','CRITICAL')),
    status TEXT NOT NULL DEFAULT 'OPEN'
        CHECK(status IN('OPEN','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','DISMISSED')),
    owner_user_id INTEGER REFERENCES nguoi_dung(id) ON DELETE RESTRICT,
    owner_role TEXT NOT NULL,
    source_due_at TEXT,
    next_escalation_at TEXT,
    escalation_level INTEGER NOT NULL DEFAULT 0 CHECK(escalation_level>=0),
    occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK(occurrence_count>=1),
    first_detected_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),
    last_detected_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),
    acknowledged_by INTEGER REFERENCES nguoi_dung(id),
    acknowledged_at TEXT,
    resolved_by INTEGER REFERENCES nguoi_dung(id),
    resolved_at TEXT,
    resolution_note TEXT,
    version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_notification_cases_queue
    ON notification_cases(status,severity,owner_user_id,don_vi_id,last_detected_at);
CREATE INDEX IF NOT EXISTS idx_notification_cases_entity
    ON notification_cases(entity_type,entity_id,rule_code);

CREATE TABLE IF NOT EXISTS notification_case_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id TEXT NOT NULL REFERENCES notification_cases(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL CHECK(event_type IN
        ('DETECTED','REOPENED','ACKNOWLEDGED','STARTED','REASSIGNED','ESCALATED','RESOLVED','AUTO_RESOLVED','DISMISSED')),
    from_status TEXT,
    to_status TEXT,
    case_version INTEGER NOT NULL,
    actor_id INTEGER REFERENCES nguoi_dung(id),
    reason TEXT,
    details_json TEXT,
    event_time TEXT NOT NULL DEFAULT(datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_notification_case_events ON notification_case_events(case_id,id);
CREATE TRIGGER IF NOT EXISTS trg_notification_case_events_no_update
BEFORE UPDATE ON notification_case_events BEGIN SELECT RAISE(ABORT,'Notification case event is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_notification_case_events_no_delete
BEFORE DELETE ON notification_case_events BEGIN SELECT RAISE(ABORT,'Notification case event is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_notification_cases_no_delete
BEFORE DELETE ON notification_cases BEGIN SELECT RAISE(ABORT,'Notification case cannot be deleted'); END;

CREATE TABLE IF NOT EXISTS notification_deliveries (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES notification_cases(id) ON DELETE RESTRICT,
    recipient_user_id INTEGER NOT NULL REFERENCES nguoi_dung(id) ON DELETE RESTRICT,
    delivery_event TEXT NOT NULL CHECK(delivery_event IN('DETECTED','REOPENED','REASSIGNED','ESCALATED','RESOLVED')),
    escalation_level INTEGER NOT NULL DEFAULT 0,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),
    UNIQUE(case_id,recipient_user_id,delivery_event,escalation_level)
);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_recipient
    ON notification_deliveries(recipient_user_id,read_at,created_at);

CREATE TABLE IF NOT EXISTS notification_rule_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_code TEXT NOT NULL REFERENCES notification_rules(code) ON DELETE RESTRICT,
    from_version INTEGER NOT NULL,
    to_version INTEGER NOT NULL,
    before_json TEXT NOT NULL,
    after_json TEXT NOT NULL,
    actor_id INTEGER NOT NULL REFERENCES nguoi_dung(id),
    reason TEXT NOT NULL CHECK(length(trim(reason))>0),
    event_time TEXT NOT NULL DEFAULT(datetime('now','localtime'))
);
CREATE TRIGGER IF NOT EXISTS trg_notification_rule_events_no_update
BEFORE UPDATE ON notification_rule_events BEGIN SELECT RAISE(ABORT,'Notification rule event is immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_notification_rule_events_no_delete
BEFORE DELETE ON notification_rule_events BEGIN SELECT RAISE(ABORT,'Notification rule event is immutable'); END;

INSERT OR IGNORE INTO ma_quyen(ma,ten,mo_ta,hang_muc) VALUES
('notification.view','Xem thông báo','Xem thông báo và vấn đề chất lượng dữ liệu theo scope','notification'),
('notification.triage','Xử lý thông báo','Acknowledge, start và resolve case được giao','notification'),
('notification.assign','Phân công thông báo','Đổi người chịu trách nhiệm và escalation','notification'),
('notification.manage','Quản lý rule','Cấu hình rule và chạy job đánh giá','notification');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma IN('admin','cd_cty') AND q.hang_muc='notification';
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma='px' AND q.ma IN('notification.view','notification.triage');
INSERT OR IGNORE INTO vai_tro_quyen(vai_tro_id,ma_quyen,donvi_id)
SELECT vai_tro.id,q.ma,NULL FROM vai_tro CROSS JOIN ma_quyen q
WHERE vai_tro.ma='xem' AND q.ma='notification.view';
