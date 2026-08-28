/**
 * Tạo 2 file Excel mẫu mô phỏng file TSCĐ/CCDC thật của phân xưởng:
 * cấu trúc khác nhau, có dòng tiêu đề rác phía trên, tên cột khác nhau,
 * ngày tháng nhiều định dạng, số có dấu phân cách.
 */
const XLSX = require('xlsx');
const path = require('path');

function taoFile1(duongDan) {
    const rows = [
        ['CÔNG TY XÂY LẮP MỎ - TKV'],
        ['PHÂN XƯỞNG ĐÀO LÒ 1'],
        [],
        ['BẢNG KÊ TÀI SẢN CỐ ĐỊNH VÀ CÔNG CỤ DỤNG CỤ'],
        ['Tính đến ngày 30/06/2026'],
        [],
        ['STT', 'Mã tài sản', 'Tên tài sản', 'ĐVT', 'Số lượng', 'Số seri',
         'Năm SX', 'Nước sản xuất', 'Nguyên giá', 'Giá trị còn lại',
         'Ngày đưa vào sử dụng', 'Vị trí sử dụng', 'Loại tài sản', 'Ghi chú'],
        [1, 'TS-DL1-001', 'Máng cào SGB-620/40T', 'Bộ', 1, 'MC2022-441', 2022, 'Trung Quốc',
         850000000, 520000000, '15/06/2022', 'Lò XV mức -50', 'TSCĐ', 'Đang hoạt động'],
        [2, 'TS-DL1-002', 'Băng tải cao su B800 dài 120m', 'Bộ', 1, 'BT-118', 2021, 'Việt Nam',
         1240000000, 680000000, '20/03/2021', 'Lò XV mức -50', 'TSCĐ', ''],
        [3, 'TS-DL1-003', 'Tời trục tải JD-25 công suất 25kW', 'Cái', 1, 'JD25-007', 2020, 'Trung Quốc',
         420000000, 180000000, '10/11/2020', 'Sân ga mức -50', 'TSCĐ', 'Đã kiểm định 7/2025'],
        [4, 'TS-DL1-004', 'Tời hỗ trợ JH-14', 'Cái', 2, 'JH14-22', 2023, 'Trung Quốc',
         96000000, 74000000, '05/2023', 'Lò DV mức -110', 'TSCĐ', ''],
        [5, 'TS-DL1-005', 'Quạt gió cục bộ YBT-11kW', 'Cái', 3, '', 2023, 'Trung Quốc',
         52000000, 41000000, '12/08/2023', 'Gương lò XV', 'TSCĐ', ''],
        [6, 'TS-DL1-006', 'Máy bơm nước 55kW MD155', 'Cái', 2, 'MD-882', 2022, 'Trung Quốc',
         78000000, 49000000, '30/09/2022', 'Hầm bơm mức -50', 'TSCĐ', ''],
        [7, 'TS-DL1-007', 'Trạm biến áp phòng nổ KBSG-400/6', 'Trạm', 1, 'KB400-19', 2021, 'Trung Quốc',
         310000000, 175000000, '18/07/2021', 'Lò XV mức -50', 'TSCĐ', ''],
        [8, 'TS-DL1-008', 'Khởi động từ phòng nổ QBZ-120', 'Cái', 6, '', 2022, 'Trung Quốc',
         18500000, 12000000, '2022', 'Các gương lò', 'TSCĐ', ''],
        [9, 'CC-DL1-101', 'Đèn lò cá nhân KL5LM', 'Cái', 45, '', 2024, 'Trung Quốc',
         1850000, 1200000, '01/2024', 'Phân xưởng', 'CCDC', 'Cấp cho công nhân'],
        [10, 'CC-DL1-102', 'Máy đo khí CH4 cầm tay', 'Cái', 8, '', 2024, 'Trung Quốc',
         12500000, 9800000, '15/02/2024', 'Phân xưởng', 'CCDC', ''],
        [11, 'TS-DL1-009', 'Máy khoan xoay cầu MYT-125', 'Cái', 2, 'MYT-771', 2023, 'Trung Quốc',
         145000000, 118000000, '22/05/2023', 'Gương lò XV', 'TSCĐ', ''],
        [12, 'TS-DL1-010', 'Palăng xích 5 tấn', 'Cái', 3, '', 2020, 'Việt Nam',
         14000000, 5500000, '2020', 'Xưởng cơ điện', 'TSCĐ', ''],
        [13, 'TS-DL1-011', 'Bàn ghế làm việc văn phòng', 'Bộ', 4, '', 2019, 'Việt Nam',
         6500000, 1200000, '2019', 'Văn phòng PX', 'CCDC', 'Không thuộc cơ điện'],
        [14, 'TS-DL1-012', '', 'Cái', 1, '', 2021, '', 0, 0, '', '', 'TSCĐ', 'Dòng thiếu tên'],
        [15, 'TS-DL1-013', 'Cáp điện cao su 3x35+1x16', 'm', 850, '', 2023, 'Việt Nam',
         420000, 310000, '08/2023', 'Lò XV', 'TSCĐ', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TSCD-CCDC');
    XLSX.writeFile(wb, duongDan);
}

function taoFile2(duongDan) {
    // Mẫu khác: tiêu đề ở dòng 1, tên cột viết tắt khác
    const rows = [
        ['STT', 'Mã TS', 'Tên thiết bị', 'Đơn vị tính', 'SL', 'Nguyên giá (đ)',
         'Ngày tăng TS', 'Nơi sử dụng', 'Ghi chú'],
        [1, 'DL2.001', 'Máng cào SGZ-730/220', 'Bộ', 1, '1.450.000.000', '2023-04-12', 'Lò CV -120', ''],
        [2, 'DL2.002', 'Tàu điện ắc quy CTY5/6G', 'Cái', 2, '2.100.000.000', '2022-08-30', 'Đường lò chính', ''],
        [3, 'DL2.003', 'Máy nén khí trục vít 22kW', 'Cái', 1, '185.000.000', '2024-01-15', 'Mặt bằng +25', ''],
        [4, 'DL2.004', 'Quạt gió cục bộ FBD-2x30', 'Cái', 4, '68.000.000', '2023-06-01', 'Gương lò', ''],
        [5, 'DL2.005', 'Rơ le rò JY82', 'Cái', 5, '9.500.000', '2023-09-20', 'Trạm điện', ''],
        [6, 'DL2.006', 'Goòng 3 tấn', 'Cái', 25, '18.000.000', '2021-05-10', 'Đường lò', ''],
        [7, 'DL2.007', 'Combai đào lò EBZ-160', 'Bộ', 1, '12.500.000.000', '2024-03-01', 'Gương lò CV', ''],
        [8, 'DL2.008', 'Thiết bị lạ không rõ loại', 'Cái', 1, '5.000.000', '2022-01-01', 'Kho', 'Test không đoán được nhóm'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, duongDan);
}

if (require.main === module) {
    taoFile1(path.join(__dirname, 'mau-dl1.xlsx'));
    taoFile2(path.join(__dirname, 'mau-dl2.xlsx'));
    console.log('Đã tạo test/mau-dl1.xlsx và test/mau-dl2.xlsx');
}

module.exports = { taoFile1, taoFile2 };
