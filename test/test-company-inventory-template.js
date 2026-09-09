const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ExcelJS = require('exceljs');
const xl = require('../lib/doc-excel');

(async () => {
  const file = path.join(os.tmpdir(), `qlcd-company-template-${Date.now()}.xlsx`);
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Sheet1');
  ws.addRow(['BIÊN BẢN KIỂM KÊ']); ws.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFF00'}};
  ws.addRow(['Tên thiết bị','ĐVT','Số kiểm kê','SL quản lý','Số chế tạo','Số quản lý','Ghi chú']);
  ws.addRow(['Băng tải','Bộ','KK-01',1,'SER-01','QL-01','Dùng']);
  const hidden=ws.addRow(['Máy bơm','Cái','KK-02',1,'SER-02','QL-02','Không hiện web']);
  hidden.getCell(7).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFF00'}};
  await wb.xlsx.writeFile(file);
  const rows=xl.docDuLieu(file,'Sheet1',1,{ten:0,dvt:1,so_kiem_ke:2,so_luong_quan_ly:3,so_seri:4,so_quan_ly:5,ghi_chu_kiem_ke:6});
  assert.equal(rows.length,2,'không nhận dòng tiêu đề bôi vàng là thiết bị');
  assert.equal(rows[0].hidden_from_web,false);
  assert.equal(rows[0].so_luong_quan_ly,1,'giữ nguyên số lượng 1');
  assert.equal(rows[1].hidden_from_web,true,'nhận màu vàng ở cột ghi chú phụ');
  assert.equal(rows[1].highlight_color,'FFFF00');
  fs.unlinkSync(file);
  console.log('company inventory template tests passed');
})().catch(e=>{ console.error(e); process.exit(1); });
