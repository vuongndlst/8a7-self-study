import { useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardCopy, Download, FileSpreadsheet, Upload, X } from 'lucide-react'
import { callFunction } from '../lib/supabase'
import { canReadXlsx, readSheet } from '../lib/xlsx'

// Đường dẫn file mẫu phải đi qua BASE_URL, nếu không sẽ hỏng trên GitHub Pages
// (site nằm dưới /8a7-self-study/ chứ không phải gốc tên miền).
const TEMPLATE = `${import.meta.env.BASE_URL}templates/Mau_import_giao_vien.xlsx`

const HEADERS = ['Họ và tên', 'Email', 'Lớp chủ nhiệm']
const norm = (s) => String(s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()

const OUTCOME = {
  created: { label: 'Tạo mới', tone: 'ok' },
  reused: { label: 'Đã có — gán lớp', tone: 'ok' },
  partial: { label: 'Tạo được, chưa gán lớp', tone: 'warn' },
  error: { label: 'Lỗi', tone: 'err' },
}

// Ba bước bắt buộc: đọc file → kiểm tra và xem trước → xác nhận mới ghi.
// Không bao giờ upload-rồi-ghi-thẳng.
export default function TeacherImport({ catalog, takenCodes, yearName, onClose, onDone }) {
  const [stage, setStage] = useState('pick')     // pick | preview | done
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const fileRef = useRef(null)

  const codes = new Set(catalog.map((c) => c.class_code.toUpperCase()))

  const pick = async (file) => {
    if (!file) return
    setErr(''); setRows([]); setFileName(file.name)
    if (!/\.xlsx$/i.test(file.name)) return setErr('Chỉ nhận file .xlsx. Hãy dùng đúng file mẫu.')
    if (file.size > 5 * 1024 * 1024) return setErr('File vượt quá 5 MB.')
    if (!canReadXlsx()) return setErr('Trình duyệt này quá cũ để đọc file Excel. Hãy dùng Chrome hoặc Edge bản mới.')

    setBusy(true)
    try {
      const sheet = await readSheet(file)
      setBusy(false)
      if (!sheet.length) return setErr('File không có dữ liệu.')

      const head = (sheet[0] ?? []).map(norm)
      if (HEADERS.some((h, i) => head[i] !== norm(h))) {
        return setErr(`File chưa đúng mẫu. Dòng đầu phải là: ${HEADERS.join(' · ')}`)
      }

      const seen = new Set()
      const parsed = sheet.slice(1).map((r, i) => {
        const fullName = String(r[0] ?? '').trim().replace(/\s+/g, ' ')
        const email = String(r[1] ?? '').trim().toLowerCase()
        const classCode = String(r[2] ?? '').trim().toUpperCase()
        const line = { no: i + 1, fullName, email, classCode }

        if (!fullName && !email && !classCode) return { ...line, skip: true }
        if (!fullName || !email) line.problem = 'Thiếu họ tên hoặc email'
        else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) line.problem = 'Email không hợp lệ'
        else if (seen.has(email)) line.problem = 'Email trùng trong file'
        else if (classCode && !codes.has(classCode)) line.problem = `Lớp ${classCode} không có trong danh mục`
        else {
          seen.add(email)
          // Không chặn: lớp đã có chủ nhiệm vẫn cho import để tạo tài khoản,
          // chỉ báo trước rằng phần gán lớp sẽ bị từ chối.
          if (classCode && takenCodes.has(classCode)) line.warn = `Lớp ${classCode} đã có giáo viên phụ trách`
        }
        return line
      }).filter((r) => !r.skip)

      if (!parsed.length) return setErr('File không có dòng nào có dữ liệu.')
      setRows(parsed); setStage('preview')
    } catch (e) {
      setBusy(false)
      setErr('Không đọc được file: ' + (e.message ?? e))
    }
  }

  const bad = rows.filter((r) => r.problem)
  const warn = rows.filter((r) => r.warn && !r.problem)
  const good = rows.filter((r) => !r.problem)

  const submit = async () => {
    setBusy(true); setErr('')
    const { ok, data } = await callFunction('admin-manage-teacher', {
      action: 'bulk',
      rows: good.map((r) => ({ fullName: r.fullName, email: r.email, classCode: r.classCode })),
    })
    setBusy(false)
    if (!ok) return setErr(data?.error || 'Không import được.')
    setResult(data); setStage('done')
  }

  const passwords = (result?.dong ?? []).filter((d) => d.matKhauTam)
  const copyAll = async () => {
    const text = passwords.map((d) => `${d.fullName}\t${d.email}\t${d.matKhauTam}${d.lop ? '\t' + d.lop : ''}`).join('\n')
    try { await navigator.clipboard.writeText(text) } catch { /* trình duyệt chặn thì thôi */ }
  }

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-head"><div>
        <span className="eyebrow">IMPORT GIÁO VIÊN</span>
        <h2>{stage === 'done' ? 'Kết quả import' : 'Thêm giáo viên từ file Excel'}</h2>
      </div><button className="icon-button" onClick={onClose}><X size={18} /></button></div>

      {stage === 'pick' && <>
        <div className="notice"><FileSpreadsheet size={18} /><span>
          File cần đúng 3 cột: <strong>Họ và tên</strong> · <strong>Email</strong> · <strong>Lớp chủ nhiệm</strong>.
          Giữ nguyên tên các cột ở dòng đầu. Cột lớp có thể để trống nếu chưa phân công.
        </span></div>
        <a className="button ghost full" href={TEMPLATE} download><Download size={17} /> Tải file mẫu Excel</a>

        <div className="drop-zone">
          <Upload size={26} />
          <p>Chọn file <strong>.xlsx</strong> đã điền danh sách</p>
          <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => pick(e.target.files?.[0])} />
          <button className="button primary" onClick={() => fileRef.current?.click()}>Chọn file</button>
          {fileName && <small className="muted-text">{fileName}</small>}
        </div>
        <p className="muted-text small">Năm học: <strong>{yearName}</strong> — luôn là năm hiện tại, không cần chọn.</p>
        {busy && <div className="notice compact"><span>Đang đọc file…</span></div>}
      </>}

      {stage === 'preview' && <>
        <div className="import-summary">
          <div className="sum-card ok"><strong>{good.length}</strong><span>Sẽ import</span></div>
          <div className={`sum-card ${warn.length ? 'warn' : ''}`}><strong>{warn.length}</strong><span>Cảnh báo</span></div>
          <div className={`sum-card ${bad.length ? 'err' : ''}`}><strong>{bad.length}</strong><span>Lỗi — bỏ qua</span></div>
        </div>

        <div className="table-wrap import-table"><table>
          <thead><tr><th>#</th><th>Họ và tên</th><th>Email</th><th>Lớp</th><th>Trạng thái</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.no} className={r.problem ? 'row-err' : r.warn ? 'row-warn' : ''}>
            <td>{r.no}</td><td>{r.fullName || '—'}</td><td><small>{r.email || '—'}</small></td>
            <td>{r.classCode || '—'}</td>
            <td><small>{r.problem ?? r.warn ?? '✓ Hợp lệ'}</small></td>
          </tr>)}</tbody>
        </table></div>

        {bad.length > 0 && <div className="notice warning"><AlertTriangle size={17} /><span>
          {bad.length} dòng có lỗi sẽ được <strong>bỏ qua</strong>. Các dòng còn lại vẫn import bình thường.
        </span></div>}
        {err && <div className="form-error">{err}</div>}

        <div className="form-actions spread">
          <button className="button ghost" onClick={() => { setStage('pick'); setRows([]) }}>Chọn file khác</button>
          <span>
            <button className="button ghost" onClick={onClose}>Hủy</button>
            <button className="button primary" onClick={submit} disabled={busy || good.length === 0}>
              {busy ? 'Đang import…' : `Import ${good.length} giáo viên`}
            </button>
          </span>
        </div>
      </>}

      {stage === 'done' && result && <>
        <div className="notice"><CheckCircle2 size={18} /><span>
          Đã xử lý <strong>{result.tong}</strong> dòng: <strong>{result.taoMoi}</strong> tài khoản mới,
          {' '}<strong>{result.dungLai}</strong> tài khoản đã có (chỉ gán lớp),
          {' '}<strong>{result.loi}</strong> lỗi.
        </span></div>

        {passwords.length > 0 && <>
          <div className="notice warning"><AlertTriangle size={17} /><span>
            Mật khẩu tạm dưới đây <strong>chỉ hiện một lần</strong>. Hãy chép lại và gửi cho từng thầy/cô ngay.
          </span></div>
          <div className="table-wrap import-table"><table>
            <thead><tr><th>Họ và tên</th><th>Email</th><th>Lớp</th><th>Mật khẩu tạm</th></tr></thead>
            <tbody>{passwords.map((d) => <tr key={d.email}>
              <td>{d.fullName}</td><td><small>{d.email}</small></td><td>{d.lop ?? '—'}</td>
              <td><code className="pw-cell">{d.matKhauTam}</code></td>
            </tr>)}</tbody>
          </table></div>
          <button className="button ghost full" onClick={copyAll}><ClipboardCopy size={16} /> Chép toàn bộ danh sách</button>
        </>}

        {result.loi > 0 && <div className="table-wrap import-table"><table>
          <thead><tr><th>Email</th><th>Vấn đề</th></tr></thead>
          <tbody>{result.dong.filter((d) => d.outcome === 'error' || d.outcome === 'partial').map((d, i) =>
            <tr key={i} className="row-err"><td><small>{d.email}</small></td><td><small>{d.note}</small></td></tr>)}</tbody>
        </table></div>}

        <div className="form-actions">
          <button className="button primary" onClick={() => { onDone(); onClose() }}>Xong</button>
        </div>
      </>}
    </div>
  </div>
}
