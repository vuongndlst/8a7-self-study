// Bộ đọc .xlsx tối giản, KHÔNG phụ thuộc thư viện ngoài.
//
// Vì sao không dùng SheetJS: bản trên npm registry đã dừng ở 0.18.5 và còn CVE
// khi phân tích file không tin cậy; các bản vá chỉ phát hành ngoài npm. Ở đây ta
// chỉ cần đọc ba cột chữ, nên tự đọc gọn hơn và không kéo theo rủi ro nào.
//
// .xlsx là một file ZIP chứa XML. Giải nén bằng DecompressionStream có sẵn trong
// trình duyệt (Chrome 103+, Firefox 113+, Safari 16.4+).

const td = new TextDecoder('utf-8')

// ---------- ZIP ----------
// Đọc bảng thư mục ở cuối file (End of Central Directory) rồi lấy từng entry.
async function unzip(buffer) {
  const dv = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  // EOCD nằm ở cuối, có thể bị đẩy lên bởi comment (tối đa 65535 byte).
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Đây không phải file .xlsx hợp lệ.')

  const count = dv.getUint16(eocd + 10, true)
  let ptr = dv.getUint32(eocd + 16, true)
  const out = {}

  for (let n = 0; n < count; n++) {
    if (dv.getUint32(ptr, true) !== 0x02014b50) break
    const method = dv.getUint16(ptr + 10, true)
    const compSize = dv.getUint32(ptr + 20, true)
    const nameLen = dv.getUint16(ptr + 28, true)
    const extraLen = dv.getUint16(ptr + 30, true)
    const commentLen = dv.getUint16(ptr + 32, true)
    const localOff = dv.getUint32(ptr + 42, true)
    const name = td.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen))

    // Header cục bộ có độ dài extra riêng, phải đọc lại chứ không dùng của central.
    const lNameLen = dv.getUint16(localOff + 26, true)
    const lExtraLen = dv.getUint16(localOff + 28, true)
    const dataStart = localOff + 30 + lNameLen + lExtraLen
    const raw = bytes.subarray(dataStart, dataStart + compSize)

    if (method === 0) {
      out[name] = td.decode(raw)
    } else if (method === 8) {
      const ds = new DecompressionStream('deflate-raw')
      const blob = new Blob([raw]).stream().pipeThrough(ds)
      out[name] = td.decode(await new Response(blob).arrayBuffer())
    }
    ptr += 46 + nameLen + extraLen + commentLen
  }
  return out
}

// ---------- XML ----------
const parse = (xml) => new DOMParser().parseFromString(xml, 'application/xml')
// Excel dùng nhiều namespace khác nhau (x:, s:, không tiền tố) nên so theo localName.
const kids = (node, tag) => [...node.children].filter((c) => c.localName === tag)
const kid = (node, tag) => kids(node, tag)[0] ?? null

// "BC12" -> 54 (chỉ số cột, bắt đầu từ 0)
function colIndex(ref) {
  let n = 0
  for (const ch of ref) {
    const c = ch.charCodeAt(0)
    if (c < 65 || c > 90) break
    n = n * 26 + (c - 64)
  }
  return n - 1
}

// Ghép hết phần tử <t> trong một node (chuỗi có định dạng bị chia thành nhiều run).
const textOf = (node) => (node ? [...node.getElementsByTagName('*')]
  .filter((e) => e.localName === 't').map((e) => e.textContent).join('') || node.textContent : '')

/**
 * Đọc sheet đầu tiên của file .xlsx thành mảng mảng chuỗi.
 * MSHS luôn trả về dạng CHUỖI để không mất số 0 ở đầu.
 */
export async function readSheet(file) {
  const files = await unzip(await file.arrayBuffer())

  // Bảng chuỗi dùng chung — ô kiểu "s" chỉ chứa chỉ số trỏ vào đây.
  const shared = []
  const ssXml = files['xl/sharedStrings.xml']
  if (ssXml) {
    for (const si of kids(parse(ssXml).documentElement, 'si')) shared.push(textOf(si))
  }

  const sheetName = Object.keys(files).find((k) => /^xl\/worksheets\/sheet1\.xml$/.test(k))
    ?? Object.keys(files).find((k) => /^xl\/worksheets\/.*\.xml$/.test(k))
  if (!sheetName) throw new Error('Không tìm thấy sheet nào trong file.')

  const data = kid(parse(files[sheetName]).documentElement, 'sheetData')
  if (!data) return []

  const rows = []
  for (const row of kids(data, 'row')) {
    const cells = []
    for (const c of kids(row, 'c')) {
      const i = colIndex(c.getAttribute('r') ?? '')
      const t = c.getAttribute('t')
      let v = ''
      if (t === 's') {
        const idx = Number(kid(c, 'v')?.textContent ?? -1)
        v = shared[idx] ?? ''
      } else if (t === 'inlineStr') {
        v = textOf(kid(c, 'is'))
      } else {
        // t="str" (kết quả công thức), t="n", hoặc không có t: lấy thẳng <v>.
        v = kid(c, 'v')?.textContent ?? ''
      }
      if (i >= 0) cells[i] = String(v).trim()
    }
    rows.push(cells)
  }
  // Bỏ các dòng trống hoàn toàn ở cuối, để file mẫu 50 dòng vẫn dùng được.
  while (rows.length && rows[rows.length - 1].every((x) => !x)) rows.pop()
  return rows
}

/** Trình duyệt có đủ khả năng giải nén không. */
export const canReadXlsx = () => typeof DecompressionStream !== 'undefined'
