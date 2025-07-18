# 并行查询问题修复

## 问题描述

用户报告了一个重要问题：在WooCommerce上架检测中，每次检测都会有部分SKU显示错误结果，而且每次错误的SKU都不固定。例如，JNRR2802-04在WooCommerce上是上架的，但检测结果显示是"未上架"和"没有库存"。

## 问题分析

经过分析，发现问题的根源是**并行查询导致的竞态条件**：

1. **原始实现问题**：
   - 使用 `Promise.all()` 同时发起大量API请求到WooCommerce
   - 没有并发控制，可能导致同时发起几十个甚至上百个请求
   - WooCommerce API可能有请求频率限制
   - 某些请求可能因为并发过高而失败或返回错误数据

2. **具体表现**：
   - 每次检测都有部分SKU显示错误
   - 错误不是固定的同一个SKU
   - 这符合并发请求导致的竞态条件特征

## 解决方案

### 1. 添加并发控制

将原来的并行查询改为**批次并发查询**：

```javascript
// 并发控制：每次最多同时查询3个SKU
const batchSize = 3;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

for (let i = 0; i < skus.length; i += batchSize) {
  const batch = skus.slice(i, i + batchSize);
  
  // 并发查询当前批次
  const batchPromises = batch.map(async (sku) => {
    // 查询逻辑
  });
  
  // 等待当前批次完成
  const batchResults = await Promise.all(batchPromises);
  
  // 批次间延迟，避免API频率限制
  if (i + batchSize < skus.length) {
    await delay(1000);
  }
}
```

### 2. 添加重试机制

为每个SKU查询添加重试机制：

```javascript
const retryCount = 3; // 重试3次

for (let retry = 0; retry < retryCount; retry++) {
  try {
    const response = await fetch(`/api/wc-products?${params.toString()}`);
    
    if (response.ok) {
      return { sku, products, success: true };
    } else if (response.status === 429) {
      // 如果遇到频率限制，等待更长时间
      await delay(2000 * (retry + 1));
      continue;
    }
  } catch (error) {
    if (retry < retryCount - 1) {
      await delay(1000 * (retry + 1));
      continue;
    }
  }
}
```

### 3. 改进错误处理

- 针对429状态码（频率限制）进行特殊处理
- 为不同类型的错误提供不同的重试策略
- 添加详细的日志记录

### 4. 改进用户体验

- 显示批次进度信息
- 显示成功率统计
- 提供更详细的进度反馈

## 修复效果

### 修复前
- 每次检测都有随机SKU显示错误
- 无法预测哪些SKU会出错
- 用户体验差，结果不可靠

### 修复后
- 通过并发控制避免API频率限制
- 通过重试机制提高成功率
- 显示成功率统计，让用户了解检测质量
- 提供详细的进度反馈

## 技术细节

### 并发控制参数
- **批次大小**: 3个SKU同时查询
- **批次间延迟**: 1秒
- **重试次数**: 3次
- **重试延迟**: 递增延迟（1秒、2秒、3秒）

### 错误处理策略
- **429状态码**: 频率限制，使用递增延迟重试
- **其他错误**: 网络错误等，使用固定延迟重试
- **最终失败**: 记录错误但不中断整个检测过程

### 性能优化
- 保持适度的并发以提高效率
- 避免过度并发导致API限制
- 通过重试机制提高成功率

## 使用建议

1. **检测前准备**：
   - 确保WooCommerce API配置正确
   - 建议在非高峰期进行大量SKU检测

2. **检测过程**：
   - 观察进度信息，了解检测状态
   - 注意成功率统计，如果成功率过低可能需要检查API配置

3. **结果验证**：
   - 对于重要的SKU，可以单独重新检测
   - 如果某个SKU持续显示错误，可能需要检查该产品在WooCommerce中的状态

## 相关文件

- `src/app/page.tsx`: 主要修复文件
- `src/app/api/wc-products/route.ts`: 后端API（无需修改）

## 测试建议

1. **小批量测试**：先用少量SKU测试修复效果
2. **大批量测试**：测试大量SKU的检测稳定性
3. **重复测试**：多次运行相同检测，验证结果一致性
4. **错误场景测试**：模拟网络错误和API限制场景 