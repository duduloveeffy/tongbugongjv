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
- 智能同步建议：
  - 🔴 有货但净库存<0 → 建议同步为无货
  - 🔵 无货但净库存>0 → 建议同步为有货
  - ⚪ 状态正常 → 无需同步

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