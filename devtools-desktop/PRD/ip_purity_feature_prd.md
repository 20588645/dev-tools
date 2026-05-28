# IP 纯净度检测模块需求文档 (PRD)

## 1. 概述
在跨境电商、TikTok 运营、网络爬虫及 AI 应用等场景下，IP 地址的“纯净度”（是否为机房 IP、是否被风控拉黑、是否是原生住宅 IP 等）直接影响业务稳定性。本模块旨在为 **DevTools Desktop** 添加一键查询本地公网 IP 或指定 IP 纯净度的功能，直观展示地理位置、ASN、IP 类型、风控值、原生 IP 属性、共享人数以及各大主流业务场景的适用建议。

## 2. 核心功能与技术方案

### 2.1 架构设计
```mermaid
graph TD
    A[前端 UI (ipcheck.js)] -->|GET /api/ipcheck/lookup?ip=xxx| B[Sidecar 后端 (routes/ipcheck.js)]
    B -->|HTTP Fetch with Headers| C[ping0.cc/ip/xxx]
    C -->|返回 HTML 页面| B
    B -->|正则解析提取字段| D[结构化 JSON 数据]
    D -->|返回响应| A
    A -->|高亮与微动画渲染| E[IP 纯净度控制面板]
```

### 2.2 技术点与稳定性保障
1. **轻量请求**：考虑到桌面端打包体积，**不**使用 Puppeteer 等无头浏览器。
2. **防 CF 拦截**：由于 DevTools Desktop 运行在用户本地 Mac 上，其发出请求的公网 IP 属于真实的本地宽带（住宅级 IP），被 Cloudflare Turnstile 拦截的概率极低。后端采用标准的 Chrome 浏览器 Header 伪装成正常访问。
3. **容错机制**：所有字段解析使用带捕获组的安全正则，若目标页面结构发生微调，提供默认值（`未知 / Unknown`）防止后端进程崩溃。

## 3. 具体修改设计

### 3.1 后端服务实现 (`sidecar/routes/ipcheck.js`)
* **提供接口**：`GET /api/ipcheck/lookup?ip=xxxx`
  * 若不传入 `ip` 参数，默认查询本地当前公网 IP 的纯净度。
* **解析字段**：
  * IP 地址
  * IP 位置 (包含国旗图标标识)
  * ASN 编号及所有者类型
  * 企业/ISP
  * 经纬度
  * IP 类型 (IDC机房 IP / 家庭宽带IP)
  * 风控值 (百分比及纯净度评级)
  * 原生 IP 判定
  * 共享人数级别
  * 适用场景评分 (TikTok、跨境电商、社媒运营、AI应用)

### 3.2 菜单注册与路由管理 (`src/js/app.js`, `src/index.html`)
* **菜单项定义**：在 `SIDEBAR_MENU_ITEMS` 中注册 `ipcheck`：
  ```javascript
  { 
    page: 'ipcheck', 
    label: 'IP 纯净度', 
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>' 
  }
  ```
* **默认排序**：在 `DEFAULT_MENU_ORDER` 末尾追加 `'ipcheck'`。
* **页面切入初始化**：在 `switchPage` 中拦截 `ipcheck`，调用前台脚本的 `initIpCheck()` 初始化本地 IP 查询。

### 3.3 前端页面及交互设计 (`src/index.html`, `src/js/ipcheck.js`, `src/css/style.css`)
* **UI 布局**：
  * **搜索栏**：顶部居中提供支持 IP / 域名输入的搜索框，以及一键查询“我的本地IP”的快捷按钮。
  * **双栏/网格布局**：
    * **左侧：IP 核心属性面板**。包括位置、ASN、类型、经纬度、共享人数等，以现代毛玻璃卡片（Glassmorphism）呈现。
    * **右侧：风控状态与适用场景看板**。
      * **风控仪表盘**：使用炫酷的多段颜色进度条（从绿色极度纯净到红色极度风险），直观显示风控得分。
      * **场景推荐卡片**：展示 TikTok、跨境电商等卡片，并绘制吉星（五星评级），以不同状态色（绿色适合、橙色尝试、红色高风险）标明建议。
  * **动态态势**：加入骨架屏加载动画（Skeleton Screen），防止网络查询延迟时界面卡顿。

## 4. 验证计划
1. **自动提取检测**：输入 `8.8.8.8` 和 `212.135.41.109`，验证所有解析信息能 100% 映射到前台。
2. **防呆测试**：输入无效格式 IP，前端能友好报错而不会导致 Sidecar 后端崩溃。
3. **主题适配**：切换应用外观（深色/浅色），确保 IP 面板文字可读性良好、对比度高。
