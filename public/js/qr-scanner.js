let qrStream=null,qrFrame=null,qrDangXuLy=false,qrFacing='environment';
async function mhQrScan(el){dungQrCamera();el.innerHTML=`<div class="dau-trang"><div><div class="eyebrow">QR thiết bị</div><h2>Quét bằng camera</h2><div class="phu">Mã được kiểm tra lại trên server và tuân Data Scope</div></div></div>
 <div id="vung-bao"></div><div class="qr-layout"><div class="the qr-camera"><video id="qr-video" playsinline muted></video><div class="qr-target" aria-hidden="true"></div>
 <div class="than-the"><button class="chinh-nut" id="qr-start" onclick="batDauQrCamera()">Bật camera</button> <button onclick="doiQrCamera()">Đổi camera</button> <button id="qr-torch" onclick="batTatDenQr()">Bật/tắt đèn</button> <button onclick="dungQrCamera()">Dừng</button></div></div>
 <div class="the"><h3>Nhập mã dự phòng</h3><div class="o-nhap"><label>Mã tài sản hoặc QR payload</label><input id="qr-manual" placeholder="NAV-A1 hoặc QLCD:ASSET:..."></div>
 <button class="chinh-nut" onclick="xuLyMaQr(gt('qr-manual'))">Mở Asset 360</button><p class="ghi-nho">Nếu trình duyệt không hỗ trợ nhận diện QR, bạn vẫn có thể dùng máy quét bàn phím hoặc nhập mã.</p></div></div>`;
 document.getElementById('qr-manual').onkeydown=e=>{if(e.key==='Enter')xuLyMaQr(e.target.value);};
}
async function batDauQrCamera(){try{if(!navigator.mediaDevices?.getUserMedia)throw new Error('Thiết bị không hỗ trợ truy cập camera');
 qrStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:qrFacing}},audio:false});const video=document.getElementById('qr-video');video.srcObject=qrStream;await video.play();
 if(!('BarcodeDetector' in window))throw new Error('Camera đã bật nhưng trình duyệt chưa hỗ trợ tự nhận QR; hãy nhập mã bên cạnh');
 const detector=new BarcodeDetector({formats:['qr_code']});const scan=async()=>{if(!qrStream)return;try{const codes=await detector.detect(video);if(codes[0]?.rawValue){dungQrCamera();await xuLyMaQr(codes[0].rawValue);return;}}catch(_){}qrFrame=requestAnimationFrame(scan);};scan();
 }catch(e){dungQrCamera();const msg=e?.name==='NotAllowedError'?'Bạn chưa cấp quyền camera. Hãy cho phép camera trong trình duyệt rồi thử lại.':e?.name==='NotFoundError'?'Không tìm thấy camera trên thiết bị.':e.message;bao(msg,'loi');}}
async function doiQrCamera(){qrFacing=qrFacing==='environment'?'user':'environment';dungQrCamera();await batDauQrCamera();}
async function batTatDenQr(){try{const track=qrStream?.getVideoTracks?.()[0],caps=track?.getCapabilities?.();if(!track||!caps?.torch)throw new Error('Camera này không hỗ trợ đèn flash');const settings=track.getSettings();await track.applyConstraints({advanced:[{torch:!settings.torch}]});}catch(e){bao(e.message,'loi');}}
function dungQrCamera(){if(qrFrame)cancelAnimationFrame(qrFrame);qrFrame=null;if(qrStream)qrStream.getTracks().forEach(t=>t.stop());qrStream=null;}
function chuanHoaMaQr(value){const raw=String(value||'').trim();if(!raw)return {kind:'EMPTY',value:''};if(/^QLCD:ASSET:/i.test(raw))return {kind:'PAYLOAD',value:raw};try{const u=new URL(raw,location.origin),m=u.pathname.match(/^\/a\/([^/?#]+)\/?$/i);if(m)return {kind:'CODE',value:decodeURIComponent(m[1])};}catch(_){}return {kind:'CODE',value:raw};}
async function xuLyMaQr(value){const parsed=chuanHoaMaQr(value);if(parsed.kind==='EMPTY')return bao('Hãy quét hoặc nhập mã QR','loi');if(qrDangXuLy)return;qrDangXuLy=true;try{const asset=parsed.kind==='PAYLOAD'?await api('/inventory/qr/'+encodeURIComponent(parsed.value)):await api('/tai-san/by-code/'+encodeURIComponent(parsed.value));
 dungQrCamera();await dieuHuong('tai-san',{asset_id:asset.id});}catch(e){bao(e.message,'loi');}finally{qrDangXuLy=false;}}
window.addEventListener('pagehide',dungQrCamera);
document.addEventListener('visibilitychange',()=>{if(document.hidden)dungQrCamera();});
