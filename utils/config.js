// 后端服务地址集中配置。
// 三端（小程序 / 一体化服务 / 网页后台）共用同一个服务，地址只在这里维护一处。
//
// ● 本地联调（默认）：指向本机一体化服务，手机与电脑需在同一局域网。
//   - 一键启动：server/ 目录执行 `npm run demo`
//   - 换电脑/网络时，把下面的 IP 改成新的本机 IPv4
//     （Windows 用 ipconfig 查「以太网 IPv4 地址」）。
//   - 微信开发者工具需勾选「不校验合法域名」（project.config.json 已设 urlCheck:false）。
//
// ● 正式部署：改成已备案的 HTTPS 域名（如 https://ski.example.com），
//   同时把 project.config.json 的 urlCheck 改回 true，并在微信公众平台配置 request 合法域名。

const API_BASE_URL = 'http://192.168.1.38:3001';

module.exports = { API_BASE_URL };
