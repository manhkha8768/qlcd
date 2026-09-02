const fs = require('fs');
const path = require('path');

const GROUPS = {
    documents: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.txt', '.csv'],
    spreadsheets: ['.xls', '.xlsx', '.xlsm', '.csv'],
    images: ['.png', '.jpg', '.jpeg', '.gif', '.webp']
};

function extension(filename) {
    const base = path.basename(String(filename || '')).normalize('NFKC');
    if (!base || /[\0-\x1f\x7f]/.test(base) || base.length > 180) return null;
    return path.extname(base).toLowerCase();
}

function fileFilter(group, message = 'Định dạng tệp không được phép') {
    const allowed = new Set(GROUPS[group] || group);
    return (req, file, cb) => {
        const ext = extension(file.originalname);
        cb(ext && allowed.has(ext) ? null : new Error(message), !!ext && allowed.has(ext));
    };
}

function starts(buffer, bytes) {
    return buffer.length >= bytes.length && bytes.every((x, i) => buffer[i] === x);
}

function contentMatches(buffer, ext) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) return false;
    if (ext === '.pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
    if (['.docx', '.xlsx', '.xlsm'].includes(ext)) return starts(buffer, [0x50, 0x4b, 0x03, 0x04]);
    if (['.doc', '.xls'].includes(ext)) return starts(buffer, [0xd0, 0xcf, 0x11, 0xe0]);
    if (ext === '.png') return starts(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (['.jpg', '.jpeg'].includes(ext)) return starts(buffer, [0xff, 0xd8, 0xff]);
    if (ext === '.gif') return ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString());
    if (ext === '.webp') return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
    if (['.txt', '.csv'].includes(ext)) return !buffer.subarray(0, 8192).includes(0);
    return false;
}

function validateMemory(group) {
    const allowed = new Set(GROUPS[group] || group);
    return (req, res, next) => {
        if (!req.file) return next();
        const ext = extension(req.file.originalname);
        if (!ext || !allowed.has(ext) || !contentMatches(req.file.buffer, ext)) {
            return res.status(400).json({ loi: 'Nội dung tệp không khớp với định dạng đã chọn' });
        }
        req.file.originalname = path.basename(req.file.originalname).normalize('NFKC');
        next();
    };
}

function secureMemoryStorage(group) {
    const allowed = new Set(GROUPS[group] || group);
    return {
        _handleFile(req, file, cb) {
            const chunks = [];
            file.stream.on('data', chunk => chunks.push(chunk));
            file.stream.on('error', cb);
            file.stream.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const ext = extension(file.originalname);
                if (!ext || !allowed.has(ext) || !contentMatches(buffer, ext)) {
                    const error = new Error('Nội dung tệp không khớp với định dạng đã chọn');
                    error.code = 'INVALID_FILE_CONTENT';
                    return cb(error);
                }
                cb(null, { buffer, size: buffer.length });
            });
        },
        _removeFile(req, file, cb) { delete file.buffer; cb(null); }
    };
}

function validateDisk(group) {
    const allowed = new Set(GROUPS[group] || group);
    return (req, res, next) => {
        if (!req.file) return next();
        try {
            const ext = extension(req.file.originalname);
            const sample = Buffer.alloc(Math.min(8192, req.file.size || 8192));
            const handle = fs.openSync(req.file.path, 'r');
            const read = fs.readSync(handle, sample, 0, sample.length, 0);
            fs.closeSync(handle);
            if (!ext || !allowed.has(ext) || !contentMatches(sample.subarray(0, read), ext)) {
                try { fs.unlinkSync(req.file.path); } catch (_) {}
                return res.status(400).json({ loi: 'Nội dung tệp không khớp với định dạng đã chọn' });
            }
            req.file.originalname = path.basename(req.file.originalname).normalize('NFKC');
            next();
        } catch (error) {
            try { fs.unlinkSync(req.file.path); } catch (_) {}
            next(error);
        }
    };
}

module.exports = { GROUPS, extension, fileFilter, contentMatches, secureMemoryStorage, validateMemory, validateDisk };
