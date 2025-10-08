/**
 * 国家代码工具函数
 * 用于将ISO 3166-1 alpha-2国家代码转换为中文名称
 */

/**
 * 国家代码到中文名称的映射表
 * 包含常见的电商销售国家
 */
export const countryNameMap: Record<string, string> = {
  // 北美
  US: '美国',
  CA: '加拿大',
  MX: '墨西哥',

  // 欧洲
  GB: '英国',
  DE: '德国',
  FR: '法国',
  IT: '意大利',
  ES: '西班牙',
  NL: '荷兰',
  BE: '比利时',
  AT: '奥地利',
  CH: '瑞士',
  SE: '瑞典',
  NO: '挪威',
  DK: '丹麦',
  FI: '芬兰',
  IE: '爱尔兰',
  PT: '葡萄牙',
  GR: '希腊',
  PL: '波兰',
  CZ: '捷克',
  HU: '匈牙利',
  RO: '罗马尼亚',
  BG: '保加利亚',
  HR: '克罗地亚',
  SK: '斯洛伐克',
  SI: '斯洛文尼亚',
  LT: '立陶宛',
  LV: '拉脱维亚',
  EE: '爱沙尼亚',
  LU: '卢森堡',
  MT: '马耳他',
  CY: '塞浦路斯',

  // 亚太
  CN: '中国',
  JP: '日本',
  KR: '韩国',
  TW: '台湾',
  HK: '香港',
  MO: '澳门',
  SG: '新加坡',
  MY: '马来西亚',
  TH: '泰国',
  VN: '越南',
  PH: '菲律宾',
  ID: '印度尼西亚',
  IN: '印度',
  AU: '澳大利亚',
  NZ: '新西兰',
  PK: '巴基斯坦',
  BD: '孟加拉国',
  LK: '斯里兰卡',
  MM: '缅甸',
  KH: '柬埔寨',
  LA: '老挝',
  BN: '文莱',

  // 中东
  AE: '阿联酋',
  SA: '沙特阿拉伯',
  IL: '以色列',
  TR: '土耳其',
  QA: '卡塔尔',
  KW: '科威特',
  OM: '阿曼',
  BH: '巴林',
  JO: '约旦',
  LB: '黎巴嫩',

  // 南美
  BR: '巴西',
  AR: '阿根廷',
  CL: '智利',
  CO: '哥伦比亚',
  PE: '秘鲁',
  VE: '委内瑞拉',
  UY: '乌拉圭',
  PY: '巴拉圭',
  BO: '玻利维亚',
  EC: '厄瓜多尔',

  // 非洲
  ZA: '南非',
  EG: '埃及',
  NG: '尼日利亚',
  KE: '肯尼亚',
  MA: '摩洛哥',
  TN: '突尼斯',
  DZ: '阿尔及利亚',
  GH: '加纳',
  ET: '埃塞俄比亚',
  UG: '乌干达',

  // 其他
  RU: '俄罗斯',
  UA: '乌克兰',
  BY: '白俄罗斯',
  KZ: '哈萨克斯坦',
  UZ: '乌兹别克斯坦',
  GE: '格鲁吉亚',
  AM: '亚美尼亚',
  AZ: '阿塞拜疆',
};

/**
 * 国家代码到英文名称的映射表
 */
export const countryEnglishNameMap: Record<string, string> = {
  US: 'United States',
  CA: 'Canada',
  MX: 'Mexico',
  GB: 'United Kingdom',
  DE: 'Germany',
  FR: 'France',
  IT: 'Italy',
  ES: 'Spain',
  NL: 'Netherlands',
  BE: 'Belgium',
  AT: 'Austria',
  CH: 'Switzerland',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  FI: 'Finland',
  IE: 'Ireland',
  PT: 'Portugal',
  GR: 'Greece',
  PL: 'Poland',
  CZ: 'Czech Republic',
  HU: 'Hungary',
  RO: 'Romania',
  BG: 'Bulgaria',
  HR: 'Croatia',
  SK: 'Slovakia',
  SI: 'Slovenia',
  LT: 'Lithuania',
  LV: 'Latvia',
  EE: 'Estonia',
  LU: 'Luxembourg',
  MT: 'Malta',
  CY: 'Cyprus',
  CN: 'China',
  JP: 'Japan',
  KR: 'South Korea',
  TW: 'Taiwan',
  HK: 'Hong Kong',
  MO: 'Macau',
  SG: 'Singapore',
  MY: 'Malaysia',
  TH: 'Thailand',
  VN: 'Vietnam',
  PH: 'Philippines',
  ID: 'Indonesia',
  IN: 'India',
  AU: 'Australia',
  NZ: 'New Zealand',
  PK: 'Pakistan',
  BD: 'Bangladesh',
  LK: 'Sri Lanka',
  MM: 'Myanmar',
  KH: 'Cambodia',
  LA: 'Laos',
  BN: 'Brunei',
  AE: 'United Arab Emirates',
  SA: 'Saudi Arabia',
  IL: 'Israel',
  TR: 'Turkey',
  QA: 'Qatar',
  KW: 'Kuwait',
  OM: 'Oman',
  BH: 'Bahrain',
  JO: 'Jordan',
  LB: 'Lebanon',
  BR: 'Brazil',
  AR: 'Argentina',
  CL: 'Chile',
  CO: 'Colombia',
  PE: 'Peru',
  VE: 'Venezuela',
  UY: 'Uruguay',
  PY: 'Paraguay',
  BO: 'Bolivia',
  EC: 'Ecuador',
  ZA: 'South Africa',
  EG: 'Egypt',
  NG: 'Nigeria',
  KE: 'Kenya',
  MA: 'Morocco',
  TN: 'Tunisia',
  DZ: 'Algeria',
  GH: 'Ghana',
  ET: 'Ethiopia',
  UG: 'Uganda',
  RU: 'Russia',
  UA: 'Ukraine',
  BY: 'Belarus',
  KZ: 'Kazakhstan',
  UZ: 'Uzbekistan',
  GE: 'Georgia',
  AM: 'Armenia',
  AZ: 'Azerbaijan',
};

/**
 * 获取国家的中文名称
 * @param countryCode ISO 3166-1 alpha-2 国家代码
 * @returns 中文名称，如果未找到则返回国家代码
 */
export function getCountryName(countryCode: string | null | undefined): string {
  if (!countryCode) return '未知';

  const upperCode = countryCode.toUpperCase().trim();
  return countryNameMap[upperCode] || upperCode;
}

/**
 * 获取国家的英文名称
 * @param countryCode ISO 3166-1 alpha-2 国家代码
 * @returns 英文名称，如果未找到则返回国家代码
 */
export function getCountryEnglishName(countryCode: string | null | undefined): string {
  if (!countryCode) return 'Unknown';

  const upperCode = countryCode.toUpperCase().trim();
  return countryEnglishNameMap[upperCode] || upperCode;
}

/**
 * 获取国家显示名称（中文 + 代码）
 * @param countryCode ISO 3166-1 alpha-2 国家代码
 * @returns 格式化的显示名称，例如 "美国 (US)"
 */
export function getCountryDisplayName(countryCode: string | null | undefined): string {
  if (!countryCode) return '未知';

  const upperCode = countryCode.toUpperCase().trim();
  const chineseName = countryNameMap[upperCode];

  if (chineseName) {
    return `${chineseName} (${upperCode})`;
  }

  return upperCode;
}

/**
 * 规范化国家代码
 * @param countryCode 原始国家代码
 * @returns 规范化后的国家代码（大写、去空格）
 */
export function normalizeCountryCode(countryCode: string | null | undefined): string {
  if (!countryCode) return 'UNKNOWN';

  return countryCode.toUpperCase().trim();
}

/**
 * 检查国家代码是否有效
 * @param countryCode 国家代码
 * @returns 是否为已知的国家代码
 */
export function isValidCountryCode(countryCode: string | null | undefined): boolean {
  if (!countryCode) return false;

  const upperCode = countryCode.toUpperCase().trim();
  return upperCode in countryNameMap;
}

/**
 * 获取所有支持的国家代码列表
 * @returns 国家代码数组
 */
export function getAllCountryCodes(): string[] {
  return Object.keys(countryNameMap);
}

/**
 * 按中文名称排序的国家列表
 * @returns 排序后的国家列表 [{ code, name, englishName }]
 */
export function getSortedCountries(): Array<{ code: string; name: string; englishName: string }> {
  return Object.keys(countryNameMap)
    .map(code => ({
      code,
      name: countryNameMap[code],
      englishName: countryEnglishNameMap[code] || code,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}
