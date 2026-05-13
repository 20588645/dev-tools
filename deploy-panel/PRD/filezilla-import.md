# FileZilla 服务器配置导入

## 需求背景
用户原有的服务器连接配置全部在 FileZilla 站台管理器中维护，手动逐个录入到 Deploy Panel 效率低下。

## 实现方案

### 数据源
- 自动读取本机 FileZilla 配置文件 `~/.config/filezilla/sitemanager.xml`
- 兼容 macOS 两种存储路径：`~/.config/filezilla/` 和 `~/Library/Application Support/FileZilla/`

### 关键设计
1. **协议过滤**：只导入 `Protocol=1`（SFTP）的服务器，自动跳过 FTP (Protocol=0)
2. **密码解码**：FileZilla 以 base64 编码存储密码，导入时解码后用 AES-256-GCM 重新加密存储
3. **重复检测**：按 `host + port` 判重，已导入的服务器在 UI 中显示为灰色禁选状态
4. **批量选择**：支持全选/全不选/单独勾选，一次导入多台服务器

### API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/servers/filezilla` | 解析本地配置，返回可导入的 SFTP 服务器列表 |
| POST | `/api/servers/filezilla/import` | 批量导入选中的服务器，body: `{ selected: string[] }` |

### FileZilla XML 结构
```xml
<Server>
  <Host>192.168.1.100</Host>
  <Port>22</Port>
  <Protocol>1</Protocol>     <!-- 0=FTP, 1=SFTP -->
  <User>root</User>
  <Pass encoding="base64">cGFzc3dvcmQ=</Pass>
  <Name>服务器名称</Name>
</Server>
```

### 安全说明
- FileZilla 密码以 **base64 编码**（非加密）存储，导出文件同样包含明文密码
- Deploy Panel 导入后使用 **AES-256-GCM** 加密存储，安全性更高
