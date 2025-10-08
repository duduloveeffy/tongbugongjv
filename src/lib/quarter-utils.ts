/**
 * 季度工具函数
 * 用于 Vapsolo 季度报表
 */

export interface QuarterPeriod {
  year: number;
  quarter: number;
  start: string; // ISO 8601 格式
  end: string;   // ISO 8601 格式
}

/**
 * 获取季度的日期范围
 * @param year 年份
 * @param quarter 季度 (1-4)
 * @returns 季度的开始和结束日期
 */
export function getQuarterRange(year: number, quarter: number): QuarterPeriod {
  if (quarter < 1 || quarter > 4) {
    throw new Error('Quarter must be between 1 and 4');
  }

  const startMonth = (quarter - 1) * 3 + 1; // Q1:1, Q2:4, Q3:7, Q4:10
  const endMonth = quarter * 3;             // Q1:3, Q2:6, Q3:9, Q4:12

  // 计算开始日期：季度第一个月的第一天
  const startDate = new Date(year, startMonth - 1, 1);

  // 计算结束日期：季度最后一个月的最后一天
  const endDate = new Date(year, endMonth, 0, 23, 59, 59, 999);

  return {
    year,
    quarter,
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}

/**
 * 获取上一个季度（环比）
 * @param year 当前年份
 * @param quarter 当前季度 (1-4)
 * @returns 上一个季度的年份和季度
 */
export function getPreviousQuarter(year: number, quarter: number): { year: number; quarter: number } {
  if (quarter === 1) {
    return { year: year - 1, quarter: 4 };
  }
  return { year, quarter: quarter - 1 };
}

/**
 * 获取上一个季度的日期范围
 * @param year 当前年份
 * @param quarter 当前季度 (1-4)
 * @returns 上一个季度的日期范围
 */
export function getPreviousQuarterRange(year: number, quarter: number): QuarterPeriod {
  const { year: prevYear, quarter: prevQuarter } = getPreviousQuarter(year, quarter);
  return getQuarterRange(prevYear, prevQuarter);
}

/**
 * 格式化季度显示
 * @param year 年份
 * @param quarter 季度
 * @returns 格式化的季度字符串，如 "2024年 Q4"
 */
export function formatQuarter(year: number, quarter: number): string {
  return `${year}年 Q${quarter}`;
}

/**
 * 获取季度包含的月份列表
 * @param quarter 季度 (1-4)
 * @returns 月份数组，如 Q1 返回 [1, 2, 3]
 */
export function getQuarterMonths(quarter: number): number[] {
  const startMonth = (quarter - 1) * 3 + 1;
  return [startMonth, startMonth + 1, startMonth + 2];
}

/**
 * 获取季度名称
 * @param quarter 季度 (1-4)
 * @returns 季度名称，如 "Q1", "Q2", "Q3", "Q4"
 */
export function getQuarterName(quarter: number): string {
  return `Q${quarter}`;
}

/**
 * 判断指定季度是否是未来季度
 * @param year 年份
 * @param quarter 季度
 * @returns 如果是未来季度返回 true
 */
export function isFutureQuarter(year: number, quarter: number): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);

  if (year > currentYear) {
    return true;
  }

  if (year === currentYear && quarter > currentQuarter) {
    return true;
  }

  return false;
}

/**
 * 获取当前季度
 * @returns 当前年份和季度
 */
export function getCurrentQuarter(): { year: number; quarter: number } {
  const now = new Date();
  const year = now.getFullYear();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);

  return { year, quarter };
}

/**
 * 获取默认选中的季度（上一个完整季度）
 * @returns 默认年份和季度
 */
export function getDefaultQuarter(): { year: number; quarter: number } {
  const { year, quarter } = getCurrentQuarter();

  // 返回上一个季度
  return getPreviousQuarter(year, quarter);
}

/**
 * 计算季度的总天数
 * @param year 年份
 * @param quarter 季度
 * @returns 天数
 */
export function getQuarterDays(year: number, quarter: number): number {
  const { start, end } = getQuarterRange(year, quarter);
  const startDate = new Date(start);
  const endDate = new Date(end);

  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 包含最后一天

  return diffDays;
}
