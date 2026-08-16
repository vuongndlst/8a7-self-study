import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { canReadXlsx, readSheet } from '../lib/xlsx'

// Qua BASE_URL, nếu không sẽ hỏng trên GitHub Pages (site nằm dưới /8a7-self-study/).
const TEMPLATE = `${import.meta.env.BASE_URL}templates/Mau_import_danh_sach_hoc_sinh.xlsx`

const HEADERS = ['STT', 'MSHS', 'Họ và tên học sinh']
const norm = (s) => String(s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()

// Nhãn cho từng kết luận. Ba loại cuối là "cần xử lý" — sẽ bị bỏ qua khi ghi.
const OUTCOME = {
  inserted:      { label: 'Học sinh mới',            tone: 'ok' },
  linked:        { label: 'Đã có — thêm vào lớp',    tone: 'ok' },
  already:       { label: 'Đã có trong lớp',         tone: 'muted' },
  name_mismatch: { label: 'Họ tên khác hệ thống',    tone: 'warn' },
  conflict:      { label: 'Xung đột lớp',            tone: 'err' },
  error:         { label: 'Lỗi',                     tone: 'err' },
}
const BLOCKED = ['name_mismatch', 'conflict', 'error']

export default function StudentImport({ classId, className, yearName, onClose, onDone }) {
  const [stage, setStage] = useState('pick')      // pick | preview | done
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState([])            // dòng đọc từ file
  const [preview, setPreview] = useState([])      // kết luận do CSDL trả về
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const fileRef = useRef(null)
  // Khóa chống bấm hai lần: sinh MỘT lần cho mỗi file đã đọc.
  const [token, setToken] = useState('')

  const pick = async (file) => {
    if (!file) return
    setErr(''); setRows([]); setPreview([]); setFileName(file.name)
    if (!/\.xlsx$/i.test(file.name)) return setErr('Chỉ nhận file .xlsx. Hãy dùng đúng file mẫu.')
    if (file.size > 5 * 1024 * 1024) return setErr('File vượt quá 5 MB.')
    if (!canReadXlsx()) return setErr('Trình duyệt này quá cũ để đọc file Excel. Hãy dùng Chrome hoặc Edge bản mới.')

    setBusy('Đang đọc file…')
    let sheet
    try { sheet = await readSheet(file) }
    catch (e) { setBusy(''); return setErr('Không đọc được file: ' + (e.message ?? e)) }

    if (!sheet.length) { setBusy(''); return setErr('File không có dữ liệu.') }
    const head = (sheet[0] ?? []).map(norm)
    if (HEADERS.some((h, i) => head[i] !== norm(h))) {
      setBusy('')
      return setErr(`File chưa đúng mẫu. Dòng đầu phải là: ${HEADERS.join(' · ')}`)
    }
    if ((sheet[0] ?? []).length > HEADERS.length) {
      setErr('Lưu ý: file có thêm cột ngoài mẫu — các cột đó sẽ được bỏ qua.')
    }

    // STT chỉ dùng để hiển thị, KHÔNG bao giờ là khóa dữ liệu.
    const parsed = sheet.slice(1).map((r, i) => ({
      stt: String(r[0] ?? '').trim() || String(i + 1),
      mshs: String(r[1] ?? '').trim(),
      full_name: String(r[2] ?? '').trim(),
    })).filter((r) => r.mshs || r.full_name)

    if (!parsed.length) { setBusy(''); return setErr('File không có dòng nào có dữ liệu.') }

    // Xem trước do CSDL tính, KHÔNG phải trình duyệt tự đoán — để những gì thầy
    // cô nhìn thấy đúng bằng những gì sẽ được ghi.
    setBusy('Đang kiểm tra dữ liệu…')
    const { data, error } = await supabase.rpc('preview_class_roster', { p_class: classId, p_rows: parsed })
    setBusy('')
    if (error) return setErr('Không kiểm tra được: ' + error.message)

    setRows(parsed)
    setPreview(data ?? [])
    setToken(crypto.randomUUID())
    setStage('preview')
  }

  const stats = useMemo(() => {
    const c = { inserted: 0, linked: 0, already: 0, name_mismatch: 0, conflict: 0, error: 0 }
    for (const p of preview) c[p.outcome] = (c[p.outcome] ?? 0) + 1
    return c
  }, [preview])

  const blocked = stats.name_mismatch + stats.conflict + stats.error
  const willWrite = stats.inserted + stats.linked

  const submit = async () => {
    setBusy('Đang import…'); setErr(''); setConfirming(false)
    const { data, error } = await supabase.rpc('import_class_roster', {
      p_class: classId, p_rows: rows, p_client_token: token, p_filename: fileName,
    })
    setBusy('')
    // Lỗi mạng/CSDL: GIỮ NGUYÊN bản xem trước để thầy cô bấm lại được. Token
    // không đổi nên bấm lại cũng không import hai lần.
    if (error) return setErr('Chưa thể hoàn tất import. Dữ liệu chưa được ghi đầy đủ. ' + error.message)
    setResult(data); setStage('done')
  }

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-head"><div>
        <span className="eyebrow">IMPORT DANH SÁCH HỌC SINH</span>
        <h2>{className} · Năm học {yearName}</h2>
      </div><button className="icon-button" onClick={onClose}><X size={18} /></button></div>

      {stage === 'pick' && <>
        <div className="notice"><FileSpreadsheet size={18} /><span>
          Chưa có file đúng định dạng? File cần đúng 3 cột: <strong>STT</strong> · <strong>MSHS</strong> ·
          {' '}<strong>Họ và tên học sinh</strong>. Giữ nguyên tên các cột ở dòng đầu.
        </span></div>
        <a className="button ghost full" href={TEMPLATE} download><Download size={17} /> Tải file mẫu Excel</a>

        <div className="drop-zone">
          <Upload size={26} />
          <p>Chọn file <strong>.xlsx</strong> danh sách lớp {className}</p>
          <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => pick(e.target.files?.[0])} />
          <button className="button primary" onClick={() => fileRef.current?.click()}>Chọn file</button>
          {fileName && <small className="muted-text">{fileName}
            <button className="link-button" onClick={() => { setFileName(''); setErr('') }}> · Xóa file</button></small>}
        </div>

        <div className="detail-box">
          <strong>Lớp</strong><p>{className}</p>
          <strong>Năm học</strong><p>{yearName} <small className="muted-text">— luôn là năm hiện tại</small></p>
        </div>
      </>}

      {stage === 'preview' && <>
        <div className="import-summary">
          <div className="sum-card ok"><strong>{stats.inserted}</strong><span>Học sinh mới</span></div>
          <div className="sum-card ok"><strong>{stats.linked}</strong><span>Đã có — thêm vào lớp</span></div>
          <div className="sum-card"><strong>{stats.already}</strong><span>Đã có trong lớp</span></div>
          <div className={`sum-card ${stats.name_mismatch ? 'warn' : ''}`}><strong>{stats.name_mismatch}</strong><span>Họ tên khác</span></div>
          <div className={`sum-card ${stats.conflict + stats.error ? 'err' : ''}`}><strong>{stats.conflict + stats.error}</strong><span>Xung đột / lỗi</span></div>
        </div>

        <div className="table-wrap import-table"><table>
          <thead><tr><th>STT</th><th>MSHS</th><th>Họ và tên</th><th>Trạng thái</th></tr></thead>
          <tbody>{preview.map((p, i) => {
            const o = OUTCOME[p.outcome] ?? { label: p.outcome, tone: '' }
            return <tr key={i} className={o.tone === 'err' ? 'row-err' : o.tone === 'warn' ? 'row-warn' : ''}>
              <td>{p.row_no ?? i + 1}</td>
              <td><code>{p.mshs ?? '—'}</code></td>
              <td>{p.full_name ?? '—'}</td>
              <td><small><strong>{o.label}</strong>{p.note ? ` — ${p.note}` : ''}</small></td>
            </tr>
          })}</tbody>
        </table></div>

        {stats.conflict > 0 && <div className="notice warning"><AlertTriangle size={17} /><span>
          <strong>Xung đột lớp:</strong> những em này đang thuộc lớp khác trong năm học {yearName}.
          Hệ thống <strong>không tự chuyển lớp</strong> — hãy báo quản trị viên xử lý.
        </span></div>}
        {stats.name_mismatch > 0 && <div className="notice warning"><AlertTriangle size={17} /><span>
          <strong>Họ tên khác:</strong> MSHS đã tồn tại nhưng tên trong file khác tên chính thức.
          Hệ thống <strong>không ghi đè</strong> tên chính thức. Sửa lại file hoặc báo quản trị viên.
        </span></div>}
        {err && <div className="form-error">{err}</div>}

        <div className="form-actions spread">
          <button className="button ghost" onClick={() => { setStage('pick'); setRows([]); setPreview([]) }}>Chọn file khác</button>
          <span>
            <button className="button ghost" onClick={onClose}>Hủy</button>
            <button className="button primary" onClick={() => setConfirming(true)} disabled={!!busy || willWrite === 0}>
              {busy || `Import ${willWrite} học sinh`}
            </button>
          </span>
        </div>
        {willWrite === 0 && <p className="muted-text small">
          Không có dòng nào để ghi. Vui lòng xử lý các dòng lỗi trước khi tiếp tục.
        </p>}
        {blocked > 0 && willWrite > 0 && <p className="muted-text small">
          {blocked} dòng cần xử lý sẽ được bỏ qua; các dòng còn lại vẫn import bình thường.
        </p>}
      </>}

      {stage === 'done' && result && <>
        <div className="notice"><CheckCircle2 size={18} /><span>
          Đã xử lý <strong>{result.tong}</strong> dòng cho lớp <strong>{className}</strong>.
        </span></div>
        <div className="import-summary">
          <div className="sum-card ok"><strong>{result.them_moi}</strong><span>Học sinh mới</span></div>
          <div className="sum-card ok"><strong>{result.gan_vao_lop}</strong><span>Thêm vào lớp</span></div>
          <div className="sum-card"><strong>{result.da_co_san}</strong><span>Đã có sẵn</span></div>
          <div className={`sum-card ${result.bo_qua ? 'warn' : ''}`}><strong>{result.bo_qua}</strong><span>Bỏ qua</span></div>
        </div>
        {result.lap_lai && <div className="notice warning"><AlertTriangle size={17} /><span>
          File này đã được import trước đó — hệ thống trả lại kết quả cũ thay vì ghi lần hai.
        </span></div>}
        <div className="form-actions">
          <button className="button primary" onClick={() => { onDone(); onClose() }}>Xem danh sách lớp</button>
        </div>
      </>}

      {/* Xác nhận cuối: nói rõ LỚP, NĂM HỌC và số lượng trước khi ghi. */}
      {confirming && <div className="modal-backdrop" onMouseDown={() => setConfirming(false)}>
        <div className="modal small" onMouseDown={(e) => e.stopPropagation()}>
          <div className="modal-head"><div><span className="eyebrow">XÁC NHẬN</span>
            <h2>Import {willWrite} học sinh vào {className}?</h2></div>
            <button className="icon-button" onClick={() => setConfirming(false)}>✕</button></div>
          <div className="detail-box">
            <strong>Lớp</strong><p>{className}</p>
            <strong>Năm học</strong><p>{yearName}</p>
            <strong>Học sinh mới</strong><p>{stats.inserted}</p>
            <strong>Đã có trên hệ thống</strong><p>{stats.linked}</p>
            {blocked > 0 && <><strong>Bỏ qua</strong><p>{blocked} dòng cần xử lý</p></>}
          </div>
          <div className="form-actions">
            <button className="button ghost" onClick={() => setConfirming(false)}>Hủy</button>
            <button className="button primary" onClick={submit}>Import {willWrite} học sinh</button>
          </div>
        </div>
      </div>}
    </div>
  </div>
}
