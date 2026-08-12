import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Download, Info, RefreshCw, TriangleAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate, todayISO } from '../utils/date'
import Avatar from './Avatar'

// ---------- Tiện ích chung ----------

const shift = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) : null)
const showPct = (a, b) => (b ? `${pct(a, b)}%` : '—')
const num = (v, unit = '') => (v == null ? '—' : `${v}${unit}`)

// Giờ báo trước khi đăng ký. Âm nghĩa là đăng ký sau khi ngày học đã bắt đầu.
const leadLabel = (h) => {
  if (h == null) return '—'
  if (h < 0) return 'trong ngày'
  if (h < 24) return `${Math.round(h)} giờ`
  return `${(h / 24).toFixed(1)} ngày`
}

const csvLine = (arr) => arr.map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')
const downloadCsv = (lines, filename) => {
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href)
}

// ---------- Khối vẽ ----------
// Tự vẽ bằng CSS/SVG thay vì thêm thư viện biểu đồ: mấy hình này đều đơn giản,
// và gói biểu đồ nào cũng nặng hơn toàn bộ phần còn lại của trang cộng lại.

function Kpi({ label, value, sub, tone }) {
  return <div className={`kpi-card ${tone || ''}`}>
    <span>{label}</span><strong>{value}</strong>
    {sub && <small>{sub}</small>}
  </div>
}

function Panel({ title, hint, children, actions }) {
  return <section className="card chart-card">
    <div className="chart-head">
      <div><h3>{title}</h3>{hint && <p className="muted-text small">{hint}</p>}</div>
      {actions}
    </div>
    {children}
  </section>
}

function Empty({ text = 'Chưa đủ dữ liệu để vẽ.' }) {
  return <div className="chart-empty">{text}</div>
}

// Thanh ngang xếp theo giá trị — dùng cho môn, tiết, thói quen lập kế hoạch.
function HBars({ rows, max }) {
  if (!rows.length) return <Empty />
  const top = max ?? Math.max(...rows.map((r) => r.value), 1)
  return <ul className="hbars">{rows.map((r) => <li key={r.key}>
    <span className="hbar-label" title={r.label}>{r.label}</span>
    <span className="hbar-track">
      <span className="hbar-fill" style={{ width: `${Math.max(2, (r.value / top) * 100)}%` }} />
    </span>
    <span className="hbar-value">{r.display ?? r.value}</span>
  </li>)}</ul>
}

// Cột theo ngày: phần đậm là đã tự cập nhật, phần nhạt là chưa.
function DayColumns({ rows }) {
  if (!rows.length) return <Empty />
  const top = Math.max(...rows.map((r) => r.so_nhiem_vu), 1)
  return <div className="day-cols">
    {rows.map((r) => {
      const doneH = r.da_qua ? (r.tu_cap_nhat / r.so_nhiem_vu) * 100 : 0
      return <div key={r.ngay} className="day-col"
        title={`${formatDate(r.ngay)} · ${r.so_nhiem_vu} nhiệm vụ · đã qua ${r.da_qua} · tự cập nhật ${r.tu_cap_nhat}`}>
        <span className="day-col-bar" style={{ height: `${Math.max(4, (r.so_nhiem_vu / top) * 100)}%` }}>
          <span className="day-col-done" style={{ height: `${doneH}%` }} />
        </span>
        <small>{r.ngay.slice(8)}/{r.ngay.slice(5, 7)}</small>
      </div>
    })}
  </div>
}

// Phân bố sao: tách sao thầy cô chấm khỏi sao hệ thống tự ghi.
function RatingBars({ rows }) {
  const total = rows.reduce((s, r) => s + r.thu_cong + r.tu_dong, 0)
  if (!total) return <Empty text="Chưa có lượt chấm nào trong khoảng này." />
  const top = Math.max(...rows.map((r) => r.thu_cong + r.tu_dong), 1)
  return <>
    <ul className="hbars rating-bars">{[...rows].reverse().map((r) => <li key={r.sao}>
      <span className="hbar-label">{'★'.repeat(r.sao)}</span>
      <span className="hbar-track">
        <span className="hbar-fill" style={{ width: `${(r.thu_cong / top) * 100}%` }} />
        <span className="hbar-fill auto" style={{ width: `${(r.tu_dong / top) * 100}%` }} />
      </span>
      <span className="hbar-value">{r.thu_cong + r.tu_dong}</span>
    </li>)}</ul>
    <div className="legend">
      <span><i className="sw" /> Thầy cô chấm</span>
      <span><i className="sw auto" /> Hệ thống tự ghi khi quá hạn</span>
    </div>
  </>
}

function SplitBar({ parts, total }) {
  if (!total) return <Empty />
  return <>
    <div className="split-bar">{parts.filter((p) => p.value > 0).map((p) => <span key={p.label}
      className={p.tone} style={{ width: `${(p.value / total) * 100}%` }} title={`${p.label}: ${p.value}`} />)}</div>
    <div className="legend">{parts.map((p) => <span key={p.label}>
      <i className={`sw ${p.tone}`} /> {p.label}: <strong>{p.value}</strong>
    </span>)}</div>
  </>
}

// ---------- Chọn khoảng thời gian ----------

export function useRange(defaultDays = 30) {
  const [from, setFrom] = useState(shift(todayISO(), -defaultDays))
  const [to, setTo] = useState(shift(todayISO(), 14))
  return { from, to, setFrom, setTo }
}

function RangePicker({ from, to, setFrom, setTo, onReload, busy }) {
  const preset = (back, fwd) => { setFrom(shift(todayISO(), -back)); setTo(shift(todayISO(), fwd)) }
  return <div className="range-bar">
    <span className="muted-text">Khoảng thời gian:</span>
    <button className="chip-btn" onClick={() => preset(6, 0)}>7 ngày qua</button>
    <button className="chip-btn" onClick={() => preset(29, 0)}>30 ngày qua</button>
    <button className="chip-btn" onClick={() => preset(29, 14)}>30 ngày qua + sắp tới</button>
    <button className="chip-btn" onClick={() => preset(365, 365)}>Cả năm học</button>
    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
    <span>→</span>
    <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
    <button className="icon-button" title="Tải lại" onClick={onReload} disabled={busy}><RefreshCw size={16} /></button>
  </div>
}

// ---------- Nạp dữ liệu ----------

function useAnalytics(rpc, args, deps) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(true)
  const [err, setErr] = useState('')
  const load = async () => {
    setBusy(true); setErr('')
    const { data: d, error } = await supabase.rpc(rpc, args)
    setBusy(false)
    if (error) { setErr(error.message || 'Không tải được số liệu.'); setData(null); return }
    setData(d)
  }
  useEffect(() => { load() }, deps)
  return { data, busy, err, reload: load }
}

// ---------- Phase 9: phân tích cả lớp ----------

export function ClassAnalytics({ classId, className }) {
  const r = useRange(30)
  const { data, busy, err, reload } = useAnalytics('class_analytics',
    { p_class: classId, p_from: r.from, p_to: r.to }, [classId, r.from, r.to])
  return <ClassAnalyticsView data={data} busy={busy} err={err} reload={reload} range={r} className={className} />
}

// Phần vẽ tách khỏi phần nạp: nhận sẵn dữ liệu, không biết gì về Supabase.
export function ClassAnalyticsView({ data, busy, err, reload, range: r, className }) {
  const [sortBy, setSortBy] = useState('ho_ten')
  const [onlyEnough, setOnlyEnough] = useState(false)

  const hs = useMemo(() => {
    const list = (data?.hoc_sinh ?? []).filter((x) => !onlyEnough || x.du_mau)
    const cmp = {
      ho_ten: (a, b) => a.ho_ten.localeCompare(b.ho_ten, 'vi'),
      so_nhiem_vu: (a, b) => b.so_nhiem_vu - a.so_nhiem_vu,
      cap_nhat: (a, b) => (pct(b.tu_cap_nhat, b.da_qua) ?? -1) - (pct(a.tu_cap_nhat, a.da_qua) ?? -1),
      dung_han: (a, b) => (pct(b.dung_han, b.so_nhiem_vu) ?? -1) - (pct(a.dung_han, a.so_nhiem_vu) ?? -1),
      diem_tb: (a, b) => (b.diem_tb ?? -1) - (a.diem_tb ?? -1),
      tre_han: (a, b) => b.tre_han - a.tre_han,
    }[sortBy]
    return [...list].sort(cmp)
  }, [data, sortBy, onlyEnough])

  const exportCsv = () => {
    const lines = [csvLine(['MSHS', 'Họ tên', 'Số buổi', 'Số nhiệm vụ', 'Đã qua', 'Tự cập nhật',
      'Tỷ lệ cập nhật', 'Hoàn thành', 'Đúng hạn', 'Tỷ lệ đúng hạn', 'Trễ hạn', 'Hệ thống tự đánh giá',
      'Bị 1–2 sao', 'Điểm TB', 'Báo trước TB (giờ)', 'Đủ mẫu xếp hạng'])]
    hs.forEach((x) => lines.push(csvLine([x.mshs, x.ho_ten, x.so_buoi, x.so_nhiem_vu, x.da_qua, x.tu_cap_nhat,
      showPct(x.tu_cap_nhat, x.da_qua), x.hoan_thanh, x.dung_han, showPct(x.dung_han, x.so_nhiem_vu),
      x.tre_han, x.tu_dong, x.sao_thap, x.diem_tb ?? '', x.lead_time_tb ?? '', x.du_mau ? 'Có' : 'Chưa'])))
    downloadCsv(lines, `phan-tich-${className || 'lop'}-${r.from}_${r.to}.csv`)
  }

  if (err) return <section className="card"><div className="form-error">{err}</div></section>

  const k = data?.kpi
  const nguong = data?.pham_vi?.nguong_xep_hang ?? 5

  return <div className="analytics">
    <RangePicker {...r} onReload={reload} busy={busy} />

    {busy && !data ? <section className="card empty-state">Đang tính số liệu…</section>
    : !k || k.so_nhiem_vu === 0 ? <section className="card empty-state">
        <p>Không có nhiệm vụ nào trong khoảng {formatDate(r.from)} – {formatDate(r.to)}.</p>
      </section>
    : <>
      <div className="kpi-grid">
        <Kpi label="Buổi tự học" value={k.so_buoi} sub={`${k.so_nhiem_vu} nhiệm vụ · ${k.so_hoc_sinh} em`} />
        <Kpi label="Tỷ lệ tự cập nhật" value={showPct(k.tu_cap_nhat, k.da_qua)}
             sub={`${k.tu_cap_nhat}/${k.da_qua} nhiệm vụ đã qua`}
             tone={pct(k.tu_cap_nhat, k.da_qua) < 60 ? 'warn' : 'ok'} />
        <Kpi label="Tỷ lệ hoàn thành" value={showPct(k.hoan_thanh, k.da_qua)}
             sub={`${k.hoan_thanh}/${k.da_qua} · chỉ tính nhiệm vụ đã qua ngày`} />
        <Kpi label="Đăng ký đúng hạn" value={showPct(k.dung_han, k.so_nhiem_vu)}
             sub={`báo trước trung vị ${leadLabel(k.lead_time_giua)}`}
             tone={pct(k.dung_han, k.so_nhiem_vu) < 50 ? 'warn' : ''} />
        <Kpi label="Điểm trung bình" value={k.diem_tb != null ? `${k.diem_tb}/5` : '—'}
             sub={`${k.so_luot_cham} lượt thầy cô chấm`} />
        <Kpi label="Trễ hạn cập nhật" value={k.tre_han} tone={k.tre_han > 0 ? 'danger' : ''}
             sub={`${k.tu_dong} tiết hệ thống đã tự đánh giá`} />
      </div>

      <div className="chart-grid">
        <Panel title="Nhịp đăng ký theo ngày"
               hint="Cột là số nhiệm vụ. Phần đậm là số đã được em tự cập nhật kết quả.">
          <DayColumns rows={data.theo_ngay} />
        </Panel>

        <Panel title="Thói quen lập kế hoạch"
               hint="Đăng ký trước bao lâu. Đăng ký trong ngày bị tính là trễ.">
          <HBars rows={data.lead_time.map((x) => ({ key: x.nhom, label: x.nhom, value: x.so_luong }))} />
          <p className="muted-text small">Trung bình cả lớp báo trước {leadLabel(k.lead_time_tb)}.</p>
        </Panel>

        <Panel title="Môn / hoạt động"
               hint="Số nhiệm vụ đã đăng ký; điểm trung bình chỉ tính lượt thầy cô chấm.">
          <HBars rows={data.theo_mon.map((x) => ({
            key: x.mon, label: x.mon, value: x.so_nhiem_vu,
            display: `${x.so_nhiem_vu}${x.diem_tb != null ? ` · ${x.diem_tb}★` : ''}`,
          }))} />
        </Panel>

        <Panel title="Theo tiết trong ngày" hint="Tiết nào lớp hay đăng ký, và cập nhật kết quả tốt tới đâu.">
          <HBars rows={data.theo_tiet.map((x) => ({
            key: x.tiet, label: `Tiết ${x.tiet}`, value: x.so_nhiem_vu,
            display: `${x.so_nhiem_vu}${x.da_qua ? ` · cập nhật ${showPct(x.tu_cap_nhat, x.da_qua)}` : ''}`,
          }))} />
        </Panel>

        <Panel title="Chất lượng — phân bố sao"
               hint="Sao hệ thống tự ghi khi quá hạn được tách riêng, vì nó nói về việc quên cập nhật chứ không nói về chất lượng học.">
          <RatingBars rows={data.phan_bo_sao} />
          {data.kpi.diem_tb != null && data.kpi.diem_tb_gom_tu_dong != null
            && data.kpi.diem_tb !== data.kpi.diem_tb_gom_tu_dong
            && <p className="muted-text small">
              Gộp cả sao tự động thì trung bình tụt xuống {data.kpi.diem_tb_gom_tu_dong}/5.
            </p>}
        </Panel>

        <Panel title="Thiết bị điện tử" hint="Tỷ lệ nhiệm vụ có đăng ký dùng thiết bị và kết quả đi kèm.">
          <SplitBar total={data.thiet_bi.co + data.thiet_bi.khong} parts={[
            { label: 'Có dùng thiết bị', value: data.thiet_bi.co, tone: 'a' },
            { label: 'Không dùng', value: data.thiet_bi.khong, tone: 'b' },
          ]} />
          <div className="mini-stats">
            <span>Đã duyệt <strong>{data.thiet_bi.da_duyet}</strong></span>
            <span>Chờ duyệt <strong className={data.thiet_bi.cho_duyet ? 'help-flag' : ''}>{data.thiet_bi.cho_duyet}</strong></span>
            <span>Từ chối <strong>{data.thiet_bi.tu_choi}</strong></span>
          </div>
          {data.thiet_bi.diem_tb_co != null && data.thiet_bi.diem_tb_khong != null && <p className="muted-text small">
            Điểm trung bình: có thiết bị <strong>{data.thiet_bi.diem_tb_co}</strong> · không thiết bị <strong>{data.thiet_bi.diem_tb_khong}</strong>.
          </p>}
        </Panel>

        <Panel title="Số nhiệm vụ mỗi buổi" hint="Lớp đang dùng tính năng nhiều nhiệm vụ ở mức nào.">
          <HBars rows={data.nhiem_vu_moi_buoi.map((x) => ({
            key: x.so_nhiem_vu, label: `${x.so_nhiem_vu} nhiệm vụ`, value: x.so_buoi,
            display: `${x.so_buoi} buổi`,
          }))} />
        </Panel>

        <Panel title="Việc còn tồn" hint="Bấm vào tab Theo kế hoạch để xử lý.">
          <div className="mini-stats column">
            <span>Chờ duyệt <strong className={k.cho_duyet ? 'help-flag' : ''}>{k.cho_duyet}</strong></span>
            <span>Cần điều chỉnh <strong className={k.can_dieu_chinh ? 'help-flag' : ''}>{k.can_dieu_chinh}</strong></span>
            <span>Đang cần hỗ trợ <strong className={k.can_ho_tro ? 'help-flag' : ''}>{k.can_ho_tro}</strong></span>
            <span>Trễ hạn cập nhật <strong className={k.tre_han ? 'alarm-red' : ''}>{k.tre_han}</strong></span>
            <span>Sắp tới, chưa đến ngày <strong>{k.sap_toi}</strong></span>
          </div>
        </Panel>
      </div>

      <Panel title="Từng học sinh"
             hint={`Em có dưới ${nguong} nhiệm vụ trong khoảng này được đánh dấu "ít dữ liệu" — đừng xếp hạng các em đó.`}
             actions={<button className="button ghost" onClick={exportCsv}><Download size={16} /> Xuất CSV</button>}>
        <div className="table-toolbar">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="ho_ten">Sắp xếp: tên A–Z</option>
            <option value="so_nhiem_vu">Số nhiệm vụ</option>
            <option value="cap_nhat">Tỷ lệ tự cập nhật</option>
            <option value="dung_han">Tỷ lệ đúng hạn</option>
            <option value="diem_tb">Điểm trung bình</option>
            <option value="tre_han">Trễ hạn nhiều nhất</option>
          </select>
          <label className="inline-check">
            <input type="checkbox" checked={onlyEnough} onChange={(e) => setOnlyEnough(e.target.checked)} />
            Chỉ hiện em đủ {nguong} nhiệm vụ trở lên
          </label>
        </div>
        <div className="table-wrap"><table>
          <thead><tr><th>Học sinh</th><th>Buổi</th><th>Nhiệm vụ</th><th>Tự cập nhật</th>
            <th>Hoàn thành</th><th>Đúng hạn</th><th>Điểm TB</th><th>Trễ hạn</th><th>1–2★</th></tr></thead>
          <tbody>{hs.map((x) => <tr key={x.student_id} className={x.du_mau ? '' : 'thin-sample'}>
            <td><span className="cell-with-avatar"><Avatar name={x.ho_ten} path={x.avatar_path} size={30} />
              <span><strong>{x.ho_ten}</strong><small>{x.mshs}{x.du_mau ? '' : ' · ít dữ liệu'}</small></span></span></td>
            <td>{x.so_buoi}</td>
            <td>{x.so_nhiem_vu}</td>
            <td>{x.da_qua ? <>{showPct(x.tu_cap_nhat, x.da_qua)}<small>{x.tu_cap_nhat}/{x.da_qua}</small></> : '—'}</td>
            <td>{x.da_qua ? showPct(x.hoan_thanh, x.da_qua) : '—'}</td>
            <td>{showPct(x.dung_han, x.so_nhiem_vu)}</td>
            <td>{x.diem_tb != null ? `${x.diem_tb}` : '—'}</td>
            <td>{x.tre_han > 0 ? <strong className="help-flag">{x.tre_han}</strong> : '—'}</td>
            <td>{x.sao_thap > 0 ? <strong className="alarm-red">{x.sao_thap}</strong> : '—'}</td>
          </tr>)}</tbody>
        </table>{hs.length === 0 && <div className="empty-state">Không có em nào phù hợp.</div>}</div>
      </Panel>

      <div className="notice compact"><Info size={16} /><span>
        Nhiệm vụ <strong>chưa tới ngày</strong> không được tính vào tỷ lệ cập nhật và tỷ lệ hoàn thành —
        các em chưa có cơ hội làm. Mọi con số đều tính lại từ CSDL theo đúng khoảng ngày đang chọn.
      </span></div>
    </>}
  </div>
}

// ---------- Phase 10 & 11: phân tích một học sinh ----------
// Dùng chung cho trang của em và cho popup chi tiết bên phía giáo viên.

export function StudentAnalytics({ studentId, name, embedded }) {
  const r = useRange(30)
  const { data, busy, err, reload } = useAnalytics('student_analytics',
    { p_student: studentId, p_from: r.from, p_to: r.to }, [studentId, r.from, r.to])
  return <StudentAnalyticsView data={data} busy={busy} err={err} reload={reload} range={r} name={name} embedded={embedded} />
}

export function StudentAnalyticsView({ data, busy, err, reload, range: r, name, embedded }) {
  if (err) return <div className="form-error">{err}</div>
  const k = data?.kpi

  const body = <>
    <RangePicker {...r} onReload={reload} busy={busy} />
    {busy && !data ? <div className="empty-state">Đang tính số liệu…</div>
    : !k || k.so_nhiem_vu === 0 ? <div className="empty-state">
        <p>Không có nhiệm vụ nào trong khoảng {formatDate(r.from)} – {formatDate(r.to)}.</p>
      </div>
    : <>
      <div className="kpi-grid">
        <Kpi label="Buổi tự học" value={k.so_buoi} sub={`${k.so_nhiem_vu} nhiệm vụ`} />
        <Kpi label="Đã cập nhật kết quả" value={showPct(k.tu_cap_nhat, k.da_qua)}
             sub={`${k.tu_cap_nhat}/${k.da_qua} buổi đã qua`}
             tone={pct(k.tu_cap_nhat, k.da_qua) < 60 ? 'warn' : 'ok'} />
        <Kpi label="Hoàn thành" value={showPct(k.hoan_thanh, k.da_qua)}
             sub={`${k.hoan_thanh} hoàn thành · ${k.mot_phan} một phần · ${k.chua_hoan_thanh} chưa xong`} />
        <Kpi label="Đăng ký đúng hạn" value={showPct(k.dung_han, k.so_nhiem_vu)}
             sub={`thường báo trước ${leadLabel(k.lead_time_giua)}`} />
        <Kpi label="Điểm trung bình" value={k.diem_tb != null ? `${k.diem_tb}/5` : '—'}
             sub={`${k.so_luot_cham} lượt được chấm`} />
        <Kpi label="Trễ hạn cập nhật" value={k.tre_han} tone={k.tre_han > 0 ? 'danger' : 'ok'}
             sub={k.tu_dong ? `${k.tu_dong} tiết bị hệ thống tự chấm` : 'chưa lần nào bị tự chấm'} />
      </div>

      {k.tre_han > 0 && <div className="notice warning compact"><TriangleAlert size={16} /><span>
        Còn <strong>{k.tre_han} nhiệm vụ</strong> quá hạn cập nhật. Bổ sung sớm để số liệu phản ánh đúng những gì đã làm.
      </span></div>}

      <div className="chart-grid">
        <Panel title="Nhịp học theo ngày" hint="Phần đậm là nhiệm vụ đã được cập nhật kết quả.">
          <DayColumns rows={data.theo_ngay} />
        </Panel>
        <Panel title="Môn / hoạt động" hint="Đang dồn thời gian tự học vào đâu.">
          <HBars rows={data.theo_mon.map((x) => ({
            key: x.mon, label: x.mon, value: x.so_nhiem_vu,
            display: `${x.so_nhiem_vu}${x.diem_tb != null ? ` · ${x.diem_tb}★` : ''}`,
          }))} />
        </Panel>
        <Panel title="Thói quen lập kế hoạch" hint="Đăng ký trước bao lâu so với ngày học.">
          <HBars rows={data.lead_time.map((x) => ({ key: x.nhom, label: x.nhom, value: x.so_luong }))} />
        </Panel>
        <Panel title="Điểm được chấm">
          <RatingBars rows={data.phan_bo_sao} />
        </Panel>
        <Panel title="Theo tiết">
          <HBars rows={data.theo_tiet.map((x) => ({
            key: x.tiet, label: `Tiết ${x.tiet}`, value: x.so_nhiem_vu,
          }))} />
        </Panel>
        <Panel title="Thiết bị điện tử">
          <SplitBar total={data.thiet_bi.co + data.thiet_bi.khong} parts={[
            { label: 'Có dùng', value: data.thiet_bi.co, tone: 'a' },
            { label: 'Không dùng', value: data.thiet_bi.khong, tone: 'b' },
          ]} />
        </Panel>
      </div>
    </>}
  </>

  if (embedded) return <div className="analytics embedded">{body}</div>
  return <section className="section-block">
    <div className="section-title"><div>
      <h2><BarChart3 size={20} /> Số liệu của {name ? name : 'em'}</h2>
      <p>Chỉ mình em và thầy cô chủ nhiệm xem được phần này. Số liệu tính lại từ đầu mỗi lần mở.</p>
    </div></div>
    <div className="analytics">{body}</div>
  </section>
}
