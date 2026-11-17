// 小程序内名单文件的生成与分享：真 .xlsx / CSV 兼容版 / 剪贴板表格兜底。
// 数据构造在 utils/roster.js，本模块只负责写文件与打开、转发、复制。
const xlsx = require('./xlsx');
const roster = require('./roster');

function writeFile(filePath, data, encoding) {
    return new Promise((resolve, reject) => {
        const options = {
            filePath,
            data,
            success: resolve,
            fail: error => reject(new Error((error && error.errMsg) || '写入文件失败')),
        };
        if (encoding) options.encoding = encoding;
        wx.getFileSystemManager().writeFile(options);
    });
}

function names(prefix, label, ext) {
    const stamp = roster.fileStamp();
    return {
        filePath: `${wx.env.USER_DATA_PATH}/${prefix}_${stamp}.${ext}`,
        fileName: `${label}_${stamp}.${ext}`,
    };
}

async function workbook(sheets, prefix, label) {
    const buffer = xlsx.buildWorkbook(sheets);
    const file = names(prefix, label, 'xlsx');
    await writeFile(file.filePath, buffer);
    return file;
}

async function textFile(content, prefix, label, ext, encoding) {
    const file = names(prefix, label, ext);
    await writeFile(file.filePath, content, encoding);
    return file;
}

// 优先在小程序内预览（右上角菜单可转发 / 保存），不支持时降级为转发文件。
function open(file) {
    return new Promise(resolve => {
        if (!wx.openDocument) { resolve(false); return; }
        wx.openDocument({
            filePath: file.filePath,
            fileType: 'xlsx',
            showMenu: true,
            success: () => resolve(true),
            fail: () => resolve(false),
        });
    });
}

function share(file) {
    return new Promise(resolve => {
        if (!wx.shareFileMessage) {
            wx.showToast({ title: '当前环境不支持文件转发，请改用「复制表格内容」', icon: 'none' });
            resolve(false);
            return;
        }
        wx.shareFileMessage({
            filePath: file.filePath,
            fileName: file.fileName,
            success: () => resolve(true),
            fail: () => {
                wx.showToast({ title: '文件转发失败，请改用「复制表格内容」', icon: 'none' });
                resolve(false);
            },
        });
    });
}

async function downloadWorkbook(sheets, prefix, label) {
    const file = await workbook(sheets, prefix, label);
    const opened = await open(file);
    if (!opened) await share(file);
    return file;
}

async function shareWorkbook(sheets, prefix, label) {
    const file = await workbook(sheets, prefix, label);
    await share(file);
    return file;
}

async function shareCsv(sheet, prefix, label) {
    const csv = xlsx.toCsv(xlsx.tableRows(sheet));
    const file = await textFile(csv, prefix, label, 'csv', 'utf8');
    await share(file);
    return file;
}

function copySheet(sheet) {
    wx.setClipboardData({ data: xlsx.toTsv(xlsx.tableRows(sheet)) });
}

module.exports = {
    workbook,
    textFile,
    open,
    share,
    downloadWorkbook,
    shareWorkbook,
    shareCsv,
    copySheet,
};
