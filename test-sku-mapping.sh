#!/bin/bash

# SKU映射表测试脚本
# 用途：测试氚云ERP SKU映射表的访问权限和数据

echo "=========================================="
echo "氚云 SKU 映射表访问测试"
echo "=========================================="
echo ""

# 加载环境变量
if [ -f .env.local ]; then
    export $(cat .env.local | grep -v '^#' | xargs)
    echo "✓ 已加载 .env.local 环境变量"
else
    echo "⚠️  未找到 .env.local 文件，请确保环境变量已设置"
    exit 1
fi

# 检查必需的环境变量
if [ -z "$H3YUN_ENGINE_CODE" ] || [ -z "$H3YUN_ENGINE_SECRET" ]; then
    echo "❌ 缺少必需的环境变量: H3YUN_ENGINE_CODE 或 H3YUN_ENGINE_SECRET"
    exit 1
fi

# 使用默认值或配置的映射表编码
SKU_MAPPING_SCHEMA_CODE=${H3YUN_SKU_MAPPING_SCHEMA_CODE:-e2ae2f1be3c7425cb1dc90a87131231a}

echo "配置信息:"
echo "  - Engine Code: ${H3YUN_ENGINE_CODE:0:10}..."
echo "  - SKU映射表编码: $SKU_MAPPING_SCHEMA_CODE"
echo ""

# 构建氚云API请求
H3YUN_API_URL="https://www.h3yun.com/OpenApi/Invoke"

# 构建Filter JSON
FILTER_JSON=$(cat <<EOF
{
  "FromRowNum": 0,
  "ToRowNum": 10,
  "RequireCount": false,
  "ReturnItems": [],
  "SortByCollection": [],
  "Matcher": {
    "Type": "And",
    "Matchers": []
  }
}
EOF
)

# 构建完整请求体
REQUEST_BODY=$(cat <<EOF
{
  "ActionName": "LoadBizObjects",
  "SchemaCode": "$SKU_MAPPING_SCHEMA_CODE",
  "Filter": $(echo "$FILTER_JSON" | jq -c .)
}
EOF
)

echo "正在发送请求到氚云API..."
echo ""

# 发送curl请求
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -X POST "$H3YUN_API_URL" \
  -H "Content-Type: application/json" \
  -H "EngineCode: $H3YUN_ENGINE_CODE" \
  -H "EngineSecret: $H3YUN_ENGINE_SECRET" \
  -d "$REQUEST_BODY")

# 分离响应体和状态码
HTTP_BODY=$(echo "$RESPONSE" | sed -e 's/HTTP_STATUS\:.*//g')
HTTP_STATUS=$(echo "$RESPONSE" | tr -d '\n' | sed -e 's/.*HTTP_STATUS://')

echo "=========================================="
echo "响应结果"
echo "=========================================="
echo "HTTP状态码: $HTTP_STATUS"
echo ""

# 美化JSON输出
if command -v jq &> /dev/null; then
    echo "响应内容:"
    echo "$HTTP_BODY" | jq '.'

    # 分析响应
    SUCCESSFUL=$(echo "$HTTP_BODY" | jq -r '.Successful')
    ERROR_MSG=$(echo "$HTTP_BODY" | jq -r '.ErrorMessage // "无"')

    echo ""
    echo "=========================================="
    echo "分析结果"
    echo "=========================================="

    if [ "$SUCCESSFUL" = "true" ]; then
        RECORD_COUNT=$(echo "$HTTP_BODY" | jq -r '.ReturnData.BizObjectArray | length')
        echo "✅ 成功！找到 $RECORD_COUNT 条SKU映射记录"
        echo ""

        if [ "$RECORD_COUNT" -gt 0 ]; then
            echo "前3条记录示例:"
            echo "$HTTP_BODY" | jq -r '.ReturnData.BizObjectArray[0:3] | .[] | "  - WooCommerce SKU: \(.F0000001 // "未设置") | 氚云SKU: \(.F0000002 // "未设置") | 数量: \(.F0000003 // 1)"'

            # 统计有效记录
            VALID_COUNT=$(echo "$HTTP_BODY" | jq '[.ReturnData.BizObjectArray[] | select(.F0000001 != null and .F0000002 != null)] | length')
            echo ""
            echo "有效映射记录: $VALID_COUNT / $RECORD_COUNT"
        else
            echo "⚠️  映射表为空，请先添加映射数据"
        fi
    else
        echo "❌ 失败: $ERROR_MSG"
        echo ""
        echo "故障排查建议:"
        echo "  1. 检查表单编码是否正确: $SKU_MAPPING_SCHEMA_CODE"
        echo "  2. 确认当前账号是否有访问该表单的权限"
        echo "  3. 验证氚云ERP配置是否正确"
        echo "  4. 检查表单是否包含字段: F0000001, F0000002, F0000003"
    fi
else
    echo "⚠️  未安装 jq 工具，显示原始JSON:"
    echo "$HTTP_BODY"
    echo ""
    echo "建议安装 jq 以获得更好的显示效果:"
    echo "  macOS: brew install jq"
    echo "  Ubuntu: sudo apt-get install jq"
fi

echo ""
echo "=========================================="
echo "测试完成"
echo "=========================================="
