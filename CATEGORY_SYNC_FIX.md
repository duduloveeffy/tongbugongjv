# 品类趋势功能修复说明

## 问题描述
用户反馈品类趋势图表中，SKU趋势正常显示但品类平均线始终为0。

## 根本原因
1. `product_categories` 表设计包含了 `site_id` 字段，导致品类映射与站点绑定
2. 查询时因为 site_id 不匹配，无法找到对应品类的SKU
3. 品类映射数据未与实际库存数据同步

## 解决方案

### 1. 数据库结构修复
- 移除 `product_categories` 表的 `site_id` 字段依赖
- 品类映射现在是全局的，不再区分站点
- 更新相关查询函数以适应新结构

### 2. 自动同步机制
- 库存文件上传时自动同步品类映射
- 添加了 `syncCategoryMappings` 函数
- 同步过程在后台静默执行

### 3. 用户界面优化
- 添加提示卡片引导用户重新上传
- 显示同步进度和结果
- 提供手动同步按钮作为备选方案

## 使用说明

### 立即修复步骤
1. **重新上传库存文件**
   - 在"库存分析"标签页
   - 点击"选择CSV文件"
   - 上传您的库存数据文件
   - 系统会自动同步品类映射

2. **验证修复效果**
   - 展开任意SKU的趋势图
   - 确认品类平均线显示正常数据
   - 检查品类排名信息是否正确

### 技术细节

#### 修改的文件
- `/supabase/migrations/20250810_fix_category_mapping_site_issue.sql` - 数据库迁移
- `/src/components/inventory/InventoryUpload.tsx` - 添加自动同步
- `/src/app/api/categories/sync/route.ts` - 品类同步API
- `/src/components/inventory/CategorySyncButton.tsx` - 手动同步按钮

#### 数据库变更
```sql
-- 移除 site_id 列
ALTER TABLE product_categories 
DROP COLUMN IF EXISTS site_id;

-- 更新主键
ALTER TABLE product_categories 
ADD PRIMARY KEY (sku);
```

#### API 调用流程
1. 用户上传CSV文件
2. 解析库存数据
3. 提取SKU和品类映射
4. 调用 `/api/categories/sync` 同步到数据库
5. 品类查询函数使用映射数据计算趋势

## 测试验证

运行以下脚本验证修复：
```bash
node fix-category-sync.js
node sync-inventory-categories.js
```

## 注意事项
- 品类映射现在是全局的，所有站点共享
- 首次使用需要重新上传库存文件
- 同步过程是增量的，不会影响现有数据