/**
 * 氚云ERP API客户端
 */
import type {
  H3YunConfig,
  H3YunApiResponse,
  H3YunLoadRequest,
  H3YunFilter,
  H3YunBizObject,
} from './types';

export class H3YunClient {
  private config: H3YunConfig;
  private readonly BASE_URL = 'https://www.h3yun.com/OpenApi/Invoke';

  constructor(config: H3YunConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl || this.BASE_URL,
    };
  }

  /**
   * 测试API连接
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.loadBizObjects(0, 1);
      return { success: result.Successful };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '连接失败',
      };
    }
  }

  /**
   * 加载业务对象（分页）
   */
  async loadBizObjects(
    fromRow = 0,
    toRow = 1000
  ): Promise<H3YunApiResponse> {
    const filter: H3YunFilter = {
      FromRowNum: fromRow,
      ToRowNum: toRow,
      RequireCount: false,
      ReturnItems: [], // 氚云API不支持关联字段展开语法
      SortByCollection: [], // 修复：移除排序以避免氚云API空引用异常
      Matcher: {
        Type: 'And',
        Matchers: [],
      },
    };

    const requestBody: H3YunLoadRequest = {
      ActionName: 'LoadBizObjects',
      SchemaCode: this.config.schemaCode,
      Filter: JSON.stringify(filter),
    };

    const response = await fetch(this.config.baseUrl!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        EngineCode: this.config.engineCode,
        EngineSecret: this.config.engineSecret,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`氚云API请求失败: HTTP ${response.status}`);
    }

    const data: H3YunApiResponse = await response.json();

    if (!data.Successful) {
      throw new Error(`氚云API错误: ${data.ErrorMessage || '未知错误'}`);
    }

    return data;
  }

  /**
   * 获取所有库存数据（自动分页）
   */
  async fetchAllInventory(
    pageSize = 500, // 氚云API限制：单次最多返回500条
    onProgress?: (current: number, status: string) => void
  ): Promise<H3YunBizObject[]> {
    const allData: H3YunBizObject[] = [];
    let fromRow = 0;
    let hasMore = true;
    let batchCount = 0;

    console.log(`[H3Yun Client] 开始分页获取数据，每批 ${pageSize} 条`);

    while (hasMore) {
      batchCount++;
      onProgress?.(allData.length, `正在获取第 ${batchCount} 批数据...`);

      console.log(`[H3Yun Client] 第 ${batchCount} 批：请求 fromRow=${fromRow}, toRow=${fromRow + pageSize}`);

      const response = await this.loadBizObjects(fromRow, fromRow + pageSize);

      if (!response.ReturnData?.BizObjectArray) {
        console.log(`[H3Yun Client] 第 ${batchCount} 批：无数据返回`);
        break;
      }

      const batch = response.ReturnData.BizObjectArray;
      console.log(`[H3Yun Client] 第 ${batchCount} 批：实际返回 ${batch.length} 条记录`);

      // 调试：打印第一条记录的仓库字段
      if (batchCount === 1 && batch.length > 0) {
        console.log('[H3Yun Client] 第一条记录的仓库字段 F0000007:', batch[0].F0000007);
        console.log('[H3Yun Client] 第一条记录的仓库名称 F0000007_Name:', batch[0].F0000007_Name);
        console.log('[H3Yun Client] 第一条记录所有字段:', Object.keys(batch[0]).filter(k => k.includes('0000007')));
        console.log('[H3Yun Client] 第一条记录完整数据示例:', JSON.stringify(batch[0]).substring(0, 800));
      }

      if (batch.length === 0) {
        console.log(`[H3Yun Client] 第 ${batchCount} 批：返回0条，结束分页`);
        hasMore = false;
      } else {
        allData.push(...batch);
        fromRow += pageSize;

        // 如果返回数据少于pageSize，说明已经是最后一批
        if (batch.length < pageSize) {
          console.log(`[H3Yun Client] 第 ${batchCount} 批：返回 ${batch.length} < ${pageSize}，已到最后一批`);
          hasMore = false;
        }
      }

      console.log(`[H3Yun Client] 当前累计获取: ${allData.length} 条记录`);

      // 添加延迟，避免API限流
      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log(`[H3Yun Client] 分页获取完成，共 ${batchCount} 批，总计 ${allData.length} 条记录`);
    onProgress?.(allData.length, `获取完成，共 ${allData.length} 条记录`);

    return allData;
  }

  /**
   * 获取单个业务对象详情（用于获取关联字段的完整信息）
   * @param objectId 对象ID
   * @param schemaCode 表单编码（可选，默认使用库存表编码）
   */
  async loadBizObject(
    objectId: string,
    schemaCode?: string
  ): Promise<H3YunApiResponse> {
    const requestBody = {
      ActionName: 'LoadBizObject',
      SchemaCode: schemaCode || this.config.schemaCode,
      BizObjectId: objectId,
    };

    const response = await fetch(this.config.baseUrl!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        EngineCode: this.config.engineCode,
        EngineSecret: this.config.engineSecret,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`氚云API请求失败: HTTP ${response.status}`);
    }

    const data: H3YunApiResponse = await response.json();

    if (!data.Successful) {
      throw new Error(`氚云API错误: ${data.ErrorMessage || '未知错误'}`);
    }

    return data;
  }

  /**
   * 批量获取仓库名称（通过仓库ID列表）
   * @param warehouseIds 仓库ID数组
   * @returns Map<仓库ID, 仓库名称>
   */
  async fetchWarehouseNames(
    warehouseIds: string[]
  ): Promise<Map<string, string>> {
    if (warehouseIds.length === 0) {
      console.log('[H3Yun Client] 没有仓库ID需要查询');
      return new Map();
    }

    console.log(`[H3Yun Client] 开始获取 ${warehouseIds.length} 个仓库的名称`);

    // 获取仓库表单编码（默认值或用户配置）
    const warehouseSchemaCode = this.config.warehouseSchemaCode || 'svsphqmtteooobudbgy';
    console.log(`[H3Yun Client] 使用仓库表单编码: ${warehouseSchemaCode}`);

    const warehouseMap = new Map<string, string>();

    // 批量请求每个仓库的详情
    for (const warehouseId of warehouseIds) {
      try {
        const response = await this.loadBizObject(warehouseId, warehouseSchemaCode);
        const warehouseName = response.ReturnData?.BizObject?.Name || warehouseId;
        warehouseMap.set(warehouseId, warehouseName);
        console.log(`[H3Yun Client] 仓库 ${warehouseId.substring(0, 8)}... -> ${warehouseName}`);
      } catch (error) {
        console.warn(`[H3Yun Client] 无法获取仓库 ${warehouseId.substring(0, 8)}... 的名称:`, error);
        warehouseMap.set(warehouseId, `仓库_${warehouseId.substring(0, 8)}`); // 失败时使用简化ID
      }

      // 避免API限流（氚云限制 1-2次/秒）
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    console.log(`[H3Yun Client] 仓库名称获取完成，成功 ${warehouseMap.size}/${warehouseIds.length} 个`);
    return warehouseMap;
  }
}

/**
 * 创建氚云客户端实例（工厂函数）
 */
export function createH3YunClient(config: H3YunConfig): H3YunClient {
  return new H3YunClient(config);
}
