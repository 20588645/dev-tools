/**
 * IP 纯净度检测 API — 基于 proxycheck.io 真实风控数据 + ip-api.com 中文地理信息
 *
 * proxycheck.io 免费无 Key：1,000 次/天
 *   - 返回真实 risk score (0-100)、proxy/VPN 检测、IP 类型、ASN、设备数等
 * ip-api.com 免费：45 次/分钟
 *   - 返回中文地理信息（国家、省、市、ISP）
 */
const express = require('express');
const router = express.Router();

/**
 * 根据 risk 分数确定风控等级标签
 */
function getRiskLabel(riskScore) {
  if (riskScore <= 15) return '极度纯净';
  if (riskScore <= 25) return '纯净';
  if (riskScore <= 50) return '风险';
  return '极高风险';
}

/**
 * 根据设备数、risk score 和 IP 类型综合推导共享人数
 * 优先使用 proxycheck 的 devices 实测数据，无数据时基于 risk + type 做合理评估
 */
function getSharedUsersInfo(devices, ipType, isProxy, riskScore) {
  const subnetDevices = devices?.subnet || 0;
  const addressDevices = devices?.address || 0;

  // 优先用实际观测设备数（proxycheck 有观测到时）
  if (subnetDevices > 0 || addressDevices > 0) {
    const count = Math.max(subnetDevices, addressDevices);
    if (count <= 5) return { text: `${count} 用户`, level: '独享级', percent: 10 };
    if (count <= 20) return { text: `${count} 用户`, level: '优质共享', percent: 35 };
    if (count <= 100) return { text: `${count} 用户`, level: '多户共用', percent: 65 };
    return { text: `${count}+ 用户`, level: '公用/基站', percent: 95 };
  }

  // 无观测数据时，基于 risk score + IP 类型做评估推导
  if (isProxy || ipType === 'VPN') {
    if (riskScore >= 70) return { text: '1000+ 用户', level: '公共代理', percent: 95 };
    if (riskScore >= 50) return { text: '100 - 1000 用户', level: '高共享', percent: 80 };
    return { text: '50 - 100 用户', level: '中度共享', percent: 65 };
  }

  if (ipType === 'Hosting') {
    if (riskScore >= 50) return { text: '100 - 500 用户', level: '机房共用', percent: 75 };
    if (riskScore >= 25) return { text: '50 - 100 用户', level: '多户共用', percent: 55 };
    return { text: '10 - 50 用户', level: '少量共用', percent: 40 };
  }

  if (ipType === 'Wireless') {
    return { text: '100 - 1000 用户', level: '基站共享', percent: 70 };
  }

  if (ipType === 'Residential') {
    if (riskScore >= 25) return { text: '10 - 20 用户', level: '优质共享', percent: 30 };
    return { text: '1 - 5 用户', level: '独享级', percent: 10 };
  }

  // Business 或其它
  if (riskScore >= 50) return { text: '50 - 100 用户', level: '多户共用', percent: 60 };
  if (riskScore >= 25) return { text: '10 - 50 用户', level: '少量共用', percent: 40 };
  return { text: '5 - 10 用户', level: '优质共享', percent: 25 };
}

/**
 * 根据风控数据评估各业务场景适用性
 */
function evaluateScenarios(riskScore, ipType, isProxy, isForbiddenArea) {
  const scenarios = [];

  // TikTok
  let tiktokStars, tiktokAdvice;
  if (isForbiddenArea) { tiktokStars = '★★☆☆☆'; tiktokAdvice = '地区限制'; }
  else if (isProxy || riskScore > 50) { tiktokStars = '★☆☆☆☆'; tiktokAdvice = '高危/限制'; }
  else if (riskScore > 25) { tiktokStars = '★★★☆☆'; tiktokAdvice = '可以尝试'; }
  else if (ipType === 'Residential') { tiktokStars = '★★★★★'; tiktokAdvice = '非常适合'; }
  else if (ipType === 'Wireless' || ipType === 'Business') { tiktokStars = '★★★★☆'; tiktokAdvice = '非常适合'; }
  else { tiktokStars = '★★★☆☆'; tiktokAdvice = '可以尝试'; }
  scenarios.push({ name: 'TikTok', stars: tiktokStars, advice: tiktokAdvice });

  // 跨境电商
  let shopStars, shopAdvice;
  if (isForbiddenArea) { shopStars = '★★☆☆☆'; shopAdvice = '不推荐'; }
  else if (isProxy || riskScore > 50) { shopStars = '★☆☆☆☆'; shopAdvice = '高危/封号风险'; }
  else if (riskScore > 25) { shopStars = '★★★☆☆'; shopAdvice = '有风险'; }
  else if (ipType === 'Residential') { shopStars = '★★★★★'; shopAdvice = '非常适合'; }
  else if (ipType === 'Wireless' || ipType === 'Business') { shopStars = '★★★★☆'; shopAdvice = '非常适合'; }
  else { shopStars = '★★★☆☆'; shopAdvice = '可以尝试'; }
  scenarios.push({ name: '跨境电商', stars: shopStars, advice: shopAdvice });

  // 社媒运营
  let snsStars, snsAdvice;
  if (isForbiddenArea) { snsStars = '★★☆☆☆'; snsAdvice = '地区限制'; }
  else if (isProxy || riskScore > 50) { snsStars = '★☆☆☆☆'; snsAdvice = '高危/限制'; }
  else if (riskScore > 25) { snsStars = '★★★☆☆'; snsAdvice = '可以尝试'; }
  else if (ipType === 'Residential') { snsStars = '★★★★★'; snsAdvice = '非常适合'; }
  else if (ipType === 'Business') { snsStars = '★★★★☆'; snsAdvice = '适合'; }
  else { snsStars = '★★★☆☆'; snsAdvice = '可以尝试'; }
  scenarios.push({ name: '社媒运营', stars: snsStars, advice: snsAdvice });

  // AI 应用
  let aiStars, aiAdvice;
  if (isForbiddenArea) { aiStars = '★☆☆☆☆'; aiAdvice = '地区限制'; }
  else if (isProxy && riskScore > 50) { aiStars = '★★☆☆☆'; aiAdvice = '高危/阻断风险'; }
  else if (isProxy) { aiStars = '★★★☆☆'; aiAdvice = '有阻断风险'; }
  else if (riskScore <= 25) { aiStars = '★★★★★'; aiAdvice = '完美支持'; }
  else { aiStars = '★★★★☆'; aiAdvice = '支持'; }
  scenarios.push({ name: 'AI 应用', stars: aiStars, advice: aiAdvice });

  return scenarios;
}

// GET /api/ipcheck/lookup
router.get('/lookup', async (req, res) => {
  const ip = req.query.ip ? req.query.ip.trim() : '';

  try {
    // 1. 并行请求两个 API
    const [ipApiResult, proxyResult] = await Promise.allSettled([
      // ip-api.com：中文地理信息
      fetch(`http://ip-api.com/json/${ip}?lang=zh-CN&fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
      // proxycheck.io：真实风控数据（risk + devices + proxy + type + asn）
      fetch(`https://proxycheck.io/v2/${ip || 'check'}?vpn=1&asn=1&risk=1&port=1&seen=1&days=7&tag=devtools`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
    ]);

    const ipApiData = ipApiResult.status === 'fulfilled' ? ipApiResult.value : null;
    const proxyRaw = proxyResult.status === 'fulfilled' ? proxyResult.value : null;

    if (!ipApiData || ipApiData.status !== 'success') {
      return res.status(502).json({ error: ipApiData?.message || '无法获取 IP 地理信息，请检查网络或输入' });
    }

    const resolvedIp = ipApiData.query;
    const proxyData = (proxyRaw && proxyRaw.status === 'ok') ? proxyRaw[resolvedIp] : null;

    // 2. 提取真实数据
    const countryCode = (ipApiData.countryCode || '').toUpperCase();
    const country = ipApiData.country || '未知';
    const regionName = ipApiData.regionName || '';
    const city = ipApiData.city || '';
    const isp = ipApiData.isp || '';
    const org = ipApiData.org || '';
    const location = [country, regionName, city].filter(Boolean).join(' ');

    // ASN
    let asn = '未知';
    let asnOwner = '未知';
    if (proxyData?.asn) {
      asn = proxyData.asn;
      asnOwner = proxyData.provider || proxyData.organisation || org || '未知';
    } else if (ipApiData.as) {
      const match = ipApiData.as.match(/^(AS\d+)\s+(.*)$/);
      if (match) { asn = match[1]; asnOwner = match[2]; }
      else { asn = ipApiData.as; asnOwner = org || isp; }
    }

    // 代理状态和类型（来自 proxycheck 真实检测）
    const isProxy = proxyData?.proxy === 'yes';
    const rawType = proxyData?.type || 'unknown';
    const riskScore = typeof proxyData?.risk === 'number' ? proxyData.risk : (isProxy ? 80 : 15);
    const devices = proxyData?.devices || null;

    // 3. IP 类型中文标签
    let ipTypeLabel = '普通公网 IP';
    if (rawType === 'VPN') ipTypeLabel = 'VPN 代理 IP';
    else if (rawType === 'Hosting') ipTypeLabel = 'IDC机房 IP';
    else if (rawType === 'Residential') ipTypeLabel = '住宅 IP';
    else if (rawType === 'Wireless') ipTypeLabel = '移动网络 IP';
    else if (rawType === 'Business') ipTypeLabel = '企业专线 IP';
    else if (rawType === 'SOCKS' || rawType === 'SOCKS4' || rawType === 'SOCKS5') ipTypeLabel = 'SOCKS 代理 IP';
    else if (rawType === 'HTTP') ipTypeLabel = 'HTTP 代理 IP';

    // 4. 风控等级
    const riskLabel = getRiskLabel(riskScore);

    // 5. 原生 IP 判定
    const isNative = (rawType === 'Residential' || rawType === 'Wireless') && !isProxy;
    const nativeIpLabel = isNative ? '原生 IP' : '非原生 IP';

    // 6. 共享人数（基于真实设备观测数据 + risk score 综合推导）
    const sharedInfo = getSharedUsersInfo(devices, rawType, isProxy, riskScore);

    // 7. 大模型可用性
    const isForbiddenArea = ['CN', 'HK', 'MO', 'RU', 'IR', 'KP', 'SY'].includes(countryCode);
    let openaiSupport = '❌ 地区限制';
    if (!isForbiddenArea) {
      if (isProxy && riskScore > 50) openaiSupport = '⚠️ 高危代理';
      else if (isProxy) openaiSupport = '⚠️ 代理风险';
      else if (rawType === 'Hosting' && riskScore > 30) openaiSupport = '⚠️ 机房限制风险';
      else openaiSupport = '✅ 完美支持';
    }

    // 8. 场景推荐
    const scenarios = evaluateScenarios(riskScore, rawType, isProxy, isForbiddenArea);

    // 9. 返回结果
    res.json({
      ip: resolvedIp,
      location,
      asn,
      asn_owner_type: (rawType === 'Hosting' || rawType === 'VPN') ? 'IDC' : 'ISP',
      asn_owner: asnOwner,
      org_type: (rawType === 'Hosting' || rawType === 'VPN') ? 'IDC' : 'ISP',
      org: proxyData?.organisation || org || asnOwner || '未知',
      longitude: ipApiData.lat ? String(ipApiData.lat) : '未知',
      latitude: ipApiData.lon ? String(ipApiData.lon) : '未知',
      ip_type: ipTypeLabel,
      risk_score: `${riskScore}%`,
      risk_label: riskLabel,
      native_ip: nativeIpLabel,
      shared_users: sharedInfo.text,
      shared_users_level: sharedInfo.level,
      shared_users_percent: sharedInfo.percent,
      openai_support: openaiSupport,
      scenarios,
      // 额外暴露原始数据供前端灵活渲染
      _raw: {
        proxy: isProxy,
        vpn: rawType === 'VPN',
        type: rawType,
        risk: riskScore,
        devices_address: devices?.address || 0,
        devices_subnet: devices?.subnet || 0,
        isp,
        country_code: countryCode,
      }
    });
  } catch (error) {
    console.error('[IPCheck] Internal system error:', error);
    res.status(500).json({ error: `风控计算系统错误: ${error.message}` });
  }
});

module.exports = router;
