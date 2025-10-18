/**
 * 氚云ERP集成类型定义
 */
import type { InventoryItem } from '../inventory-utils';

// 氚云API配置
export interface H3YunConfig {
  engineCode: string;
  engineSecret: string;
  schemaCode: string; // 库存表单编码
  warehouseSchemaCode?: string; // 仓库表单编码 (可选，默认 svsphqmtteooobudbgy)
  baseUrl?: string;
}

// 氚云业务对象（原始API返回格式）
export interface H3YunBizObject {
  ObjectId: string;              // 记录ID
  Name: string;                  // 数据标题
  CreatedBy: string;             // 创建人
  ModifiedTime: string;          // 修改时间
  CreatedTime: string;           // 创建时间

  // 核心字段
  F0000001: string;              // 产品SKU
  F0000002: string;              // 产品品类
  F0000003: string;              // 产品分类
  F0000063: string;              // 尼古丁
  F0000064: string;              // flavor
  F0000025: string;              // Pcs
  F0000007: string;              // 所属仓库 (ID)
  F0000030: number;              // 可用SKU库存
  F0000083: number;              // 可用SKU库存(不含待出库)
  F0000079: number;              // SKU*SKU(PCS)
  F0000065: number;              // 产品SKU(PCS)数量

  // 其他字段...
  [key: string]: any;
}

// 氚云API响应
export interface H3YunApiResponse {
  Successful: boolean;
  ErrorMessage: string | null;
  ReturnData?: {
    BizObjectArray?: H3YunBizObject[];
    BizObject?: H3YunBizObject; // 单个对象查询时使用
  };
}

// 氚云API请求参数
export interface H3YunLoadRequest {
  ActionName: 'LoadBizObjects';
  SchemaCode: string;
  Filter: string; // JSON字符串
}

// 分页过滤器
export interface H3YunFilter {
  FromRowNum: number;
  ToRowNum: number;
  RequireCount: boolean;
  ReturnItems: string[];
  SortByCollection: Array<{
    PropertyName: string;
    Direction: 'Ascending' | 'Descending';
  }>;
  Matcher: {
    Type: 'And' | 'Or';
    Matchers: any[];
  };
}

// 仓库映射
export interface WarehouseMapping {
  id: string;           // 氚云仓库ID
  name: string;         // 仓库名称
  code?: string;        // 仓库代码
}

// 同步选项
export interface H3YunSyncOptions {
  config: H3YunConfig;
  pageSize?: number;           // 分页大小 (默认1000)
  warehouseMappings?: WarehouseMapping[];
  onProgress?: (current: number, total: number, status: string) => void;
}

// 同步结果
export interface H3YunSyncResult {
  success: boolean;
  data?: InventoryItem[];
  error?: string;
  stats?: {
    totalRecords: number;
    validRecords: number;
    skippedRecords: number;
    processingTime: number;
  };
}
