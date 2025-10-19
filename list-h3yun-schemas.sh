#!/bin/bash

# 氚云表单列表查询脚本
# 用途：列出当前账号可访问的所有表单

echo "=========================================="
echo "氚云 ERP 表单列表查询"
echo "=========================================="
echo ""

# 加载环境变量
if [ -f .env.local ]; then
    export $(cat .env.local | grep -v '^#' | xargs)
    echo "✓ 已加载 .env.local 环境变量"
else
    echo "⚠️  未找到 .env.local 文件"
    read -p "请输入 H3YUN_ENGINE_CODE: " H3YUN_ENGINE_CODE
    read -p "请输入 H3YUN_ENGINE_SECRET: " H3YUN_ENGINE_SECRET
fi

echo ""
echo "配置信息:"
echo "  - Engine Code: ${H3YUN_ENGINE_CODE:0:10}..."
echo ""

# 氚云API地址
H3YUN_API_URL="https://www.h3yun.com/OpenApi/Invoke"

echo "正在查询表单列表..."
echo ""

# 请求获取表单列表（氚云API可能需要特定的ActionName）
# 注意：氚云可能没有直接列出所有表单的API，这里尝试常见方法

# 方法1: 尝试获取工作流表单列表
REQUEST_BODY='{
  "ActionName": "LoadBizObjectSchemas"
}'

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -X POST "$H3YUN_API_URL" \
  -H "Content-Type: application/json" \
  -H "EngineCode: $H3YUN_ENGINE_CODE" \
  -H "EngineSecret: $H3YUN_ENGINE_SECRET" \
  -d "$REQUEST_BODY")

HTTP_BODY=$(echo "$RESPONSE" | sed -e 's/HTTP_STATUS\:.*//g')
HTTP_STATUS=$(echo "$RESPONSE" | tr -d '\n' | sed -e 's/.*HTTP_STATUS://')

echo "=========================================="
echo "响应结果"
echo "=========================================="
echo "HTTP状态码: $HTTP_STATUS"
echo ""

if command -v jq &> /dev/null; then
    echo "响应内容:"
    echo "$HTTP_BODY" | jq '.'

    SUCCESSFUL=$(echo "$HTTP_BODY" | jq -r '.Successful')

    if [ "$SUCCESSFUL" = "true" ]; then
        echo ""
        echo "=========================================="
        echo "可用表单列表"
        echo "=========================================="
        echo "$HTTP_BODY" | jq -r '.ReturnData[] | "SchemaCode: \(.SchemaCode) - 名称: \(.DisplayName // .Name)"'
    else
        ERROR_MSG=$(echo "$HTTP_BODY" | jq -r '.ErrorMessage // "未知错误"')
        echo "❌ 查询失败: $ERROR_MSG"
        echo ""
        echo "提示: 氚云API可能不支持直接列出表单"
        echo "请在氚云ERP管理后台查看表单编码："
        echo "  1. 登录氚云ERP: https://www.h3yun.com"
        echo "  2. 进入应用设置 -> 表单设置"
        echo "  3. 找到SKU映射表，查看其表单编码（SchemaCode）"
    fi
else
    echo "原始JSON响应:"
    echo "$HTTP_BODY"
    echo ""
    echo "⚠️  建议安装 jq 工具以获得更好的显示效果"
fi

echo ""
echo "=========================================="
echo "手动查找表单编码的步骤"
echo "=========================================="
echo "1. 登录氚云ERP: https://www.h3yun.com"
echo "2. 进入应用管理 -> 表单管理"
echo "3. 找到您的SKU映射表单"
echo "4. 查看表单设置/属性，找到 SchemaCode"
echo "5. 将正确的 SchemaCode 更新到 .env.local:"
echo "   H3YUN_SKU_MAPPING_SCHEMA_CODE=正确的编码"
echo ""
