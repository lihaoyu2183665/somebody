// 轻量 XLSX 生成器：直接构造 OOXML（ZIP + SpreadsheetML），不依赖任何第三方库，
// 因此在小程序运行时与 Node 测试环境都能用。生成的是真正的 .xlsx 文件，
// 可被 Excel / WPS / 微信内置文档预览直接打开。
// 单元格一律用 inlineStr，身份证号、手机号等长数字不会被 Excel 转成科学计数法。

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
            value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
        }
        table[index] = value >>> 0;
    }
    return table;
})();

function utf8Bytes(text) {
    const value = String(text === undefined || text === null ? '' : text);
    const bytes = [];
    for (let index = 0; index < value.length; index += 1) {
        let code = value.charCodeAt(index);
        if (code >= 0xD800 && code <= 0xDBFF && index + 1 < value.length) {
            const next = value.charCodeAt(index + 1);
            if (next >= 0xDC00 && next <= 0xDFFF) {
                code = 0x10000 + ((code - 0xD800) << 10) + (next - 0xDC00);
                index += 1;
            }
        }
        if (code < 0x80) bytes.push(code);
        else if (code < 0x800) bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
        else if (code < 0x10000) bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
        else bytes.push(0xF0 | (code >> 18), 0x80 | ((code >> 12) & 0x3F), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
    }
    return Uint8Array.from(bytes);
}

function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let index = 0; index < bytes.length; index += 1) {
        crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[index]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ZIP 使用 STORE（不压缩），避免引入 deflate 实现；Excel 完全支持。
function zip(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    entries.forEach(entry => {
        const name = utf8Bytes(entry.name);
        const data = entry.data;
        const checksum = crc32(data);
        const size = data.length;

        const local = new Uint8Array(30 + name.length + size);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034B50, true);
        lv.setUint16(4, 20, true);
        lv.setUint16(6, 0x0800, true); // UTF-8 文件名
        lv.setUint16(8, 0, true);      // STORE
        lv.setUint16(10, 0, true);
        lv.setUint16(12, 0, true);
        lv.setUint32(14, checksum, true);
        lv.setUint32(18, size, true);
        lv.setUint32(22, size, true);
        lv.setUint16(26, name.length, true);
        lv.setUint16(28, 0, true);
        local.set(name, 30);
        local.set(data, 30 + name.length);
        locals.push(local);

        const central = new Uint8Array(46 + name.length);
        const cv = new DataView(central.buffer);
        cv.setUint32(0, 0x02014B50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint16(8, 0x0800, true);
        cv.setUint16(10, 0, true);
        cv.setUint16(12, 0, true);
        cv.setUint16(14, 0, true);
        cv.setUint32(16, checksum, true);
        cv.setUint32(20, size, true);
        cv.setUint32(24, size, true);
        cv.setUint16(28, name.length, true);
        cv.setUint16(30, 0, true);
        cv.setUint16(32, 0, true);
        cv.setUint16(34, 0, true);
        cv.setUint16(36, 0, true);
        cv.setUint32(38, 0, true);
        cv.setUint32(42, offset, true);
        central.set(name, 46);
        centrals.push(central);
        offset += local.length;
    });

    const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054B50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    const output = new Uint8Array(offset + centralSize + end.length);
    let cursor = 0;
    locals.forEach(item => { output.set(item, cursor); cursor += item.length; });
    centrals.forEach(item => { output.set(item, cursor); cursor += item.length; });
    output.set(end, cursor);
    return output.buffer;
}

function xmlEscape(value) {
    return String(value === undefined || value === null ? '' : value)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function columnName(index) {
    let number = index + 1;
    let name = '';
    while (number > 0) {
        const remainder = (number - 1) % 26;
        name = String.fromCharCode(65 + remainder) + name;
        number = Math.floor((number - 1) / 26);
    }
    return name;
}

function safeSheetName(value, index) {
    const cleaned = String(value || `Sheet${index + 1}`).replace(/[\[\]:*?/\\]/g, '_');
    return (cleaned || `Sheet${index + 1}`).slice(0, 31);
}

function cellXml(ref, value, style) {
    const attr = style ? ` s="${style}"` : '';
    if (typeof value === 'number' && Number.isFinite(value)) {
        return `<c r="${ref}"${attr}><v>${value}</v></c>`;
    }
    const text = xmlEscape(value);
    return `<c r="${ref}"${attr} t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
}

function sheetXml(sheet) {
    const columns = sheet.columns || [];
    const rows = sheet.rows || [];
    const width = Math.max(columns.length, 1);
    const cols = columns.length
        ? `<cols>${columns.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${Number(column.width) || 16}" customWidth="1"/>`).join('')}</cols>`
        : '';
    const header = columns.map((column, index) => cellXml(`${columnName(index)}1`, column.title, 1)).join('');
    const body = rows.map((row, rowIndex) => {
        const number = rowIndex + 2;
        const cells = [];
        for (let index = 0; index < width; index += 1) {
            cells.push(cellXml(`${columnName(index)}${number}`, row[index] === undefined ? '' : row[index], 0));
        }
        return `<row r="${number}">${cells.join('')}</row>`;
    }).join('');
    const dimension = `A1:${columnName(width - 1)}${rows.length + 1}`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
        + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
        + `<dimension ref="${dimension}"/>`
        + `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
        + `<sheetFormatPr defaultRowHeight="18"/>${cols}<sheetData><row r="1">${header}</row>${body}</sheetData>`
        + `</worksheet>`;
}

const CONTENT_TYPES_HEAD = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`;
const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
    + `</Relationships>`;
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>`
    + `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>`
    + `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>`
    + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
    + `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`
    + `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>`
    + `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`
    + `</styleSheet>`;

function buildWorkbook(sheets) {
    const list = (sheets || []).filter(Boolean);
    if (list.length === 0) list.push({ name: '导出数据', columns: [{ title: '说明' }], rows: [['暂无数据']] });

    const overrides = list.map((sheet, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    const contentTypes = CONTENT_TYPES_HEAD
        + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
        + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
        + overrides + `</Types>`;

    const sheetsXml = list.map((sheet, index) =>
        `<sheet name="${xmlEscape(safeSheetName(sheet.name, index))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
    const workbook = `${WORKBOOK_XML}<sheets>${sheetsXml}</sheets></workbook>`;
    const worksheetRels = list.map((sheet, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');
    const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
        + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
        + worksheetRels
        + `<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
        + `</Relationships>`;

    const entries = [
        { name: '[Content_Types].xml', data: utf8Bytes(contentTypes) },
        { name: '_rels/.rels', data: utf8Bytes(ROOT_RELS) },
        { name: 'xl/workbook.xml', data: utf8Bytes(workbook) },
        { name: 'xl/_rels/workbook.xml.rels', data: utf8Bytes(workbookRels) },
        { name: 'xl/styles.xml', data: utf8Bytes(STYLES_XML) },
    ];
    list.forEach((sheet, index) => {
        entries.push({ name: `xl/worksheets/sheet${index + 1}.xml`, data: utf8Bytes(sheetXml(sheet)) });
    });
    return zip(entries);
}

// 表格内容复制 / CSV 兜底：粘贴到 Excel 时按列对齐。
function tableRows(sheet) {
    const columns = sheet.columns || [];
    return [columns.map(column => column.title)].concat(sheet.rows || []);
}

function csvCell(value) {
    let text = String(value === undefined || value === null ? '' : value).replace(/\r?\n/g, ' ');
    if (/^[=+@]/.test(text)) text = `'${text}`; // 防表格公式注入
    return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows) {
    return `\ufeff${(rows || []).map(row => row.map(csvCell).join(',')).join('\r\n')}`;
}

function toTsv(rows) {
    return (rows || []).map(row => row.map(value =>
        String(value === undefined || value === null ? '' : value).replace(/[\t\r\n]/g, ' ')).join('\t')).join('\n');
}

module.exports = {
    buildWorkbook,
    tableRows,
    toCsv,
    toTsv,
};
