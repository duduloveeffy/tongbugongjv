#!/bin/bash

# 氚云表单连接测试脚本（Mac/Linux）

echo "=========================================="
echo "氚云 ERP 表单连接测试"
echo "=========================================="
echo ""

ENGINE_CODE="t4yq7mzi2zpe1rnn6etflbvm0"
ENGINE_SECRET="dbdrlWeVK9U1WkIJwDZ2pMlrCLsCKK6Dh3/T4puiKLJ/muZjEecXTA=="

# 测试函数
test_schema() {
    local name=$1
    local schema_code=$2

    echo "[$3] 测试 $name"
    echo "SchemaCode: $schema_code"
    echo ""

    RESPONSE=$(curl -s -X POST "https://www.h3yun.com/OpenApi/Invoke" \
        -H "Content-Type: application/json" \
        -H "EngineCode: $ENGINE_CODE" \
        -H "EngineSecret: $ENGINE_SECRET" \
        -d "{\"ActionName\":\"LoadBizObjects\",\"SchemaCode\":\"$schema_code\",\"Filter\":\"{\\\"FromRowNum\\\":0,\\\"ToRowNum\\\":1,\\\"RequireCount\\\":false,\\\"ReturnItems\\\":[],\\\"SortByCollection\\\":[],\\\"Matcher\\\":{\\\"Type\\\":\\\"And\\\",\\\"Matchers\\\":[]}}\"}")

    if command -v jq &> /dev/null; then
        # 使用 jq 美化输出
        echo "$RESPONSE" | jq '.'

        SUCCESSFUL=$(echo "$RESPONSE" | jq -r '.Successful')
        if [ "$SUCCESSFUL" = "true" ]; then
            echo ""
            echo "✅ 成功：$name 可以访问"
        else
            ERROR_MSG=$(echo "$RESPONSE" | jq -r '.ErrorMessage')
            echo ""
            echo "❌ 失败：$name 无法访问"
            echo "错误信息：$ERROR_MSG"
        fi
    else
        # 没有 jq，显示原始输出
        echo "$RESPONSE"

        if [[ "$RESPONSE" == *'"Successful":true'* ]]; then
            echo ""
            echo "✅ 成功：$name 可以访问"
        else
            echo ""
            echo "❌ 失败：$name 无法访问"
        fi
    fi

    echo ""
    echo "----------------------------------------"
    echo ""
}

# 执行测试
test_schema "库存表 (H3YUN_INVENTORY_SCHEMA_CODE)" "sirxt5xvsfeuamv3c2kdg" "1/3"
test_schema "仓库表 (H3YUN_WAREHOUSE_SCHEMA_CODE)" "svsphqmtteooobudbgy" "2/3"
test_schema "SKU映射表 (H3YUN_SKU_MAPPING_SCHEMA_CODE)" "e2ae2f1be3c7425cb1dc90a87131231a" "3/3"

echo "=========================================="
echo "测试完成"
echo "=========================================="
echo ""
echo "结果说明:"
echo "  ✅ = 表单可访问"
echo "  ❌ = 表单不存在或无权限"
echo ""

if ! command -v jq &> /dev/null; then
    echo "💡 提示：安装 jq 可以获得更好的显示效果"
    echo "   macOS: brew install jq"
    echo "   Ubuntu: sudo apt-get install jq"
    echo ""
fi
