@echo off
chcp 65001 >nul
REM 氚云表单连接测试脚本（Windows CMD）

echo ==========================================
echo 氚云 ERP 表单连接测试
echo ==========================================
echo.

set ENGINE_CODE=t4yq7mzi2zpe1rnn6etflbvm0
set ENGINE_SECRET=dbdrlWeVK9U1WkIJwDZ2pMlrCLsCKK6Dh3/T4puiKLJ/muZjEecXTA==

echo [1/3] 测试库存表 (H3YUN_INVENTORY_SCHEMA_CODE)
echo SchemaCode: sirxt5xvsfeuamv3c2kdg
echo.
curl -X POST "https://www.h3yun.com/OpenApi/Invoke" ^
  -H "Content-Type: application/json" ^
  -H "EngineCode: %ENGINE_CODE%" ^
  -H "EngineSecret: %ENGINE_SECRET%" ^
  -d "{\"ActionName\":\"LoadBizObjects\",\"SchemaCode\":\"sirxt5xvsfeuamv3c2kdg\",\"Filter\":\"{\\\"FromRowNum\\\":0,\\\"ToRowNum\\\":1,\\\"RequireCount\\\":false,\\\"ReturnItems\\\":[],\\\"SortByCollection\\\":[],\\\"Matcher\\\":{\\\"Type\\\":\\\"And\\\",\\\"Matchers\\\":[]}}\"}"
echo.
echo.

echo [2/3] 测试仓库表 (H3YUN_WAREHOUSE_SCHEMA_CODE)
echo SchemaCode: svsphqmtteooobudbgy
echo.
curl -X POST "https://www.h3yun.com/OpenApi/Invoke" ^
  -H "Content-Type: application/json" ^
  -H "EngineCode: %ENGINE_CODE%" ^
  -H "EngineSecret: %ENGINE_SECRET%" ^
  -d "{\"ActionName\":\"LoadBizObjects\",\"SchemaCode\":\"svsphqmtteooobudbgy\",\"Filter\":\"{\\\"FromRowNum\\\":0,\\\"ToRowNum\\\":1,\\\"RequireCount\\\":false,\\\"ReturnItems\\\":[],\\\"SortByCollection\\\":[],\\\"Matcher\\\":{\\\"Type\\\":\\\"And\\\",\\\"Matchers\\\":[]}}\"}"
echo.
echo.

echo [3/3] 测试SKU映射表 (H3YUN_SKU_MAPPING_SCHEMA_CODE)
echo SchemaCode: e2ae2f1be3c7425cb1dc90a87131231a
echo.
curl -X POST "https://www.h3yun.com/OpenApi/Invoke" ^
  -H "Content-Type: application/json" ^
  -H "EngineCode: %ENGINE_CODE%" ^
  -H "EngineSecret: %ENGINE_SECRET%" ^
  -d "{\"ActionName\":\"LoadBizObjects\",\"SchemaCode\":\"e2ae2f1be3c7425cb1dc90a87131231a\",\"Filter\":\"{\\\"FromRowNum\\\":0,\\\"ToRowNum\\\":1,\\\"RequireCount\\\":false,\\\"ReturnItems\\\":[],\\\"SortByCollection\\\":[],\\\"Matcher\\\":{\\\"Type\\\":\\\"And\\\",\\\"Matchers\\\":[]}}\"}"
echo.
echo.

echo ==========================================
echo 测试完成
echo ==========================================
echo.
echo 结果说明:
echo   "Successful":true  = 表单可访问 ✓
echo   "Successful":false = 表单不存在或无权限 ✗
echo.
pause
