import * as XLSX from 'xlsx';

/**
 * 导出数据到Excel文件
 * @param data 要导出的数据数组
 * @param filename 文件名（不含扩展名）
 * @param sheetName 工作表名称（可选，默认为"Sheet1"）
 * @param columnMapping 列映射（可选，用于重命名列）
 */
export function exportToExcel<T extends Record<string, any>>(
  data: T[],
  filename: string,
  sheetName = 'Sheet1',
  columnMapping?: Record<string, string>
) {
  if (!data || data.length === 0) {
    throw new Error('没有可导出的数据');
  }

  // 如果提供了列映射，重命名列
  let exportData = data;
  if (columnMapping) {
    exportData = data.map(row => {
      const newRow: Record<string, any> = {};
      Object.keys(row).forEach(key => {
        const newKey = columnMapping[key] || key;
        newRow[newKey] = row[key];
      });
      return newRow as T;
    });
  }

  // 创建工作表
  const worksheet = XLSX.utils.json_to_sheet(exportData);

  // 创建工作簿
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // 生成带时间戳的文件名
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').split('.')[0];
  const fullFilename = `${filename}_${timestamp}.xlsx`;

  // 下载文件
  XLSX.writeFile(workbook, fullFilename);
}

/**
 * 导出多个工作表到一个Excel文件
 * @param sheets 工作表数组，每个元素包含 {data, sheetName, columnMapping?}
 * @param filename 文件名（不含扩展名）
 */
export function exportMultipleSheetsToExcel(
  sheets: Array<{
    data: Record<string, any>[];
    sheetName: string;
    columnMapping?: Record<string, string>;
  }>,
  filename: string
) {
  if (!sheets || sheets.length === 0) {
    throw new Error('没有可导出的数据');
  }

  // 创建工作簿
  const workbook = XLSX.utils.book_new();

  // 为每个工作表添加数据
  sheets.forEach(({ data, sheetName, columnMapping }) => {
    if (!data || data.length === 0) {
      return;
    }

    // 如果提供了列映射，重命名列
    let exportData = data;
    if (columnMapping) {
      exportData = data.map(row => {
        const newRow: Record<string, any> = {};
        Object.keys(row).forEach(key => {
          const newKey = columnMapping[key] || key;
          newRow[newKey] = row[key];
        });
        return newRow;
      });
    }

    // 创建工作表并添加到工作簿
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  });

  // 生成带时间戳的文件名
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').split('.')[0];
  const fullFilename = `${filename}_${timestamp}.xlsx`;

  // 下载文件
  XLSX.writeFile(workbook, fullFilename);
}

/**
 * 格式化货币（欧元）
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(value);
}

/**
 * 格式化数字
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}
