# 数据保留问题修复

## 问题描述

用户反馈在使用"在途检测"或"SKU筛选"功能时，已经检测到的"上架状态"和"库存状态"会丢失，需要重新进行检测。

## 问题分析

经过分析发现，问题出现在以下几个函数中：

1. **在途检测时**：`updateInventoryWithTransitData` 函数更新数据时没有保留已有的 `productData`
2. **SKU筛选时**：`useEffect` 中的筛选逻辑重新构建数据时丢失了 `productData` 和 `salesData`
3. **仓库合并时**：`mergeWarehouseData` 函数合并数据时没有保留 `productData` 和 `salesData`

## 解决方案

### 1. 修复在途检测数据保留

在 `updateInventoryWithTransitData` 函数中，确保在更新数据时保留已有的产品数据：

```javascript
// 确保所有项目都有在途数量和在途库存字段，同时保留productData和salesData
filtered = filtered.map(item => {
  const 在途数量 = item.在途数量 || 0;
  const 净可售库存 = calculateNetStock(item);
  
  // 查找对应的原始数据以保留productData和salesData
  const originalData = filteredData.find(original => original.产品代码 === item.产品代码);
  
  return {
    ...item,
    在途数量: 在途数量,
    在途库存: 净可售库存 + 在途数量,
    // 保留已有的productData和salesData
    productData: originalData?.productData || item.productData,
    salesData: originalData?.salesData || item.salesData,
  };
});
```

### 2. 修复筛选逻辑数据保留

在 `useEffect` 中的筛选逻辑中，确保保留已有的产品数据：

```javascript
// 确保所有项目都有在途数量和在途库存字段，同时保留productData和salesData
filtered = filtered.map(item => {
  const 在途数量 = item.在途数量 || 0;
  const 净可售库存 = calculateNetStock(item);
  
  // 查找对应的原始数据以保留productData和salesData
  const originalData = filteredData.find(original => original.产品代码 === item.产品代码);
  
  return {
    ...item,
    在途数量: 在途数量,
    在途库存: 净可售库存 + 在途数量,
    // 保留已有的productData和salesData
    productData: originalData?.productData || item.productData,
    salesData: originalData?.salesData || item.salesData,
  };
});
```

### 3. 修复仓库合并数据保留

在 `mergeWarehouseData` 函数中，确保在合并仓库数据时保留产品数据：

```javascript
// 多个仓库的数据，需要合并
const warehouses = items.map(item => item.仓库).filter(w => w).join(', ');

// 查找是否有已有的productData或salesData
const itemWithProductData = items.find(item => item.productData);
const itemWithSalesData = items.find(item => item.salesData);

const mergedItem: InventoryItem = {
  // ... 其他字段
  // 保留已有的productData和salesData
  productData: itemWithProductData?.productData,
  salesData: itemWithSalesData?.salesData,
};
```

## 修复效果

### 修复前
- 点击"在途检测"后，上架状态和库存状态丢失
- 进行SKU筛选后，产品检测数据丢失
- 切换仓库合并模式后，所有检测数据丢失

### 修复后
- 在途检测保留所有已有的产品数据
- SKU筛选保留所有检测结果
- 仓库合并保留产品数据和销量数据
- 用户无需重新进行检测

## 数据保留机制

### 1. 原理
通过查找原始数据中对应SKU的 `productData` 和 `salesData`，在数据更新时进行保留。

### 2. 实现方式
```javascript
// 查找对应的原始数据
const originalData = filteredData.find(original => original.产品代码 === item.产品代码);

// 保留已有的数据
productData: originalData?.productData || item.productData,
salesData: originalData?.salesData || item.salesData,
```

### 3. 适用场景
- 在途检测更新
- SKU筛选操作
- 仓库筛选操作
- 品类筛选操作
- 仓库合并模式切换

## 技术细节

### 数据查找策略
- 使用 `find()` 方法查找对应的原始数据
- 以 `产品代码` 作为唯一标识
- 使用 `||` 运算符确保数据存在时才保留

### 性能考虑
- 查找操作在数据量较大时可能影响性能
- 但相比重新检测的成本，查找操作的开销是可接受的
- 保证了用户体验的连续性

### 错误处理
- 使用可选链操作符 `?.` 避免空值错误
- 提供默认值确保数据结构完整
- 保证在各种情况下都能正常工作

## 测试建议

1. **基本功能测试**：
   - 进行产品检测后，执行在途检测，验证数据保留
   - 进行销量检测后，执行SKU筛选，验证数据保留
   - 切换仓库合并模式，验证数据保留

2. **边界情况测试**：
   - 空数据情况下的保留机制
   - 部分数据缺失情况下的处理
   - 大量数据情况下的性能表现

3. **用户体验测试**：
   - 验证用户不需要重新检测
   - 确认所有检测结果正确显示
   - 检查数据一致性

## 相关文件

- `src/app/page.tsx`: 主要修复文件
- `docs/parallel-query-fix.md`: 并行查询问题修复
- `docs/performance-optimization.md`: 性能优化文档 