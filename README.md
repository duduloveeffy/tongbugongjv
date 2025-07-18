# ERP数据分析系统

一个基于 Next.js 的库存分析与销量检测工具，支持 WooCommerce 集成。

## 主要功能

### 🏪 库存分析
- CSV文件导入（支持GB2312编码）
- 多仓库数据合并
- 智能筛选（SKU、仓库、品类）
- 在途订单管理
- Excel导出功能

### 📊 销量检测
- WooCommerce API集成
- 多订单状态筛选
- 时间范围查询
- 30天销量统计
- 热销产品排行

### 🔄 库存同步
- 产品上架状态检测
- 智能库存状态同步
- 单个/批量同步操作
- 实时状态更新
- 支持变体产品（Product Variations）

## 技术栈

- **前端**: Next.js 15, React 19, TypeScript
- **UI组件**: shadcn/ui, Tailwind CSS
- **状态管理**: Zustand
- **数据处理**: Papa Parse, xlsx, iconv-lite
- **通知**: Sonner

## 安装使用

1. 克隆项目
```bash
git clone https://github.com/shen963789/restore-analysis.git
cd restore-analysis
```

2. 安装依赖
```bash
npm install
```

3. 启动开发服务器
```bash
npm run dev
```

4. 访问 http://localhost:3000

## 配置说明

### WooCommerce API配置
1. 进入"网站配置"页面
2. 填写以下信息：
   - 网站URL
   - Consumer Key
   - Consumer Secret

### 数据导入格式
- **库存数据**: CSV格式，GB2312编码
- **在途订单**: Excel格式，包含产品型号、产品英文名称、数量三列

### 📚 详细文档
- [库存同步功能说明](./库存同步功能说明.md)
- [WooCommerce API设置指南](./WooCommerce_API_Setup_Guide.md)
- [变体产品同步指南](./Product_Variations_Guide.md)
- [品牌更新说明](./品牌更新说明.md)
- [图标修复说明](./图标修复说明.md)
- [并行查询问题修复](./docs/parallel-query-fix.md)
- [性能优化方案](./docs/performance-optimization.md)
- [数据保留问题修复](./docs/data-preservation-fix.md)

## 功能特色

### 库存分析
- 支持净可售库存计算
- 在途库存预测
- 缺货预警
- 多维度筛选

### 销量检测
- 支持多种订单状态
- 灵活的时间范围查询
- 30天销量对比
- 自动销量统计

### 库存同步
- 智能提示功能：
  - 🔴 有货但净库存<0 → 建议同步为无货（红色按钮）
  - 🔵 无货但净库存>0 → 建议同步为有货（蓝色按钮）
  - ⚪ 状态正常 → 灰色按钮
- 同步功能：
  - ✅ 所有SKU都可以点击切换状态
  - ✅ 单个同步：点击按钮切换有货/无货
  - ✅ 批量同步：选择多个SKU进行状态切换
- 同步行为：
  - ✅ 只修改库存状态（有货/无货）
  - ❌ 不修改库存数量
  - ❌ 不修改库存管理设置
- 产品类型支持：
  - ✅ 简单产品（Simple Products）
  - ✅ 变体产品（Product Variations）
  - ✅ 自动检测产品类型并使用正确的API端点

## 项目结构

```
src/
├── app/
│   ├── api/           # API路由
│   ├── layout.tsx     # 根布局
│   └── page.tsx       # 主页面
├── components/ui/     # UI组件
├── store/            # 状态管理
└── styles/           # 样式文件
```

## 许可证

MIT License