export default function StatusBadge({value}) {
  const map={'Đúng hạn':'success','Trễ':'warning','Hoàn thành':'success','Một phần':'warning','Chưa hoàn thành':'danger','Cao':'danger','Trung bình':'warning','Thấp':'muted'}
  return <span className={`badge ${map[value]||'muted'}`}>{value||'—'}</span>
}
