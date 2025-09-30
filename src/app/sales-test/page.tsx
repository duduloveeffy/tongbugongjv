'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SalesTestPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = async (endpoint: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(endpoint);
      const result = await response.json();
      setData(result);
      console.log(`[Test] ${endpoint} result:`, result);
    } catch (err: any) {
      setError(err.message);
      console.error(`[Test] ${endpoint} error:`, err);
    } finally {
      setLoading(false);
    }
  };

  const testSalesQuery = async () => {
    setLoading(true);
    setError(null);
    try {
      // 获取昨天的日期
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const yesterdayEnd = new Date(now);
      yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
      yesterdayEnd.setHours(23, 59, 59, 999);

      const requestBody = {
        siteIds: [], // 空数组表示所有站点
        statuses: ['processing', 'completed', 'pending', 'on-hold', 'cancelled', 'refunded', 'failed'],
        dateStart: yesterday.toISOString(),
        dateEnd: yesterdayEnd.toISOString(),
        groupBy: 'day'
      };

      console.log('[Test Sales Query] Request:', requestBody);

      const response = await fetch('/api/sales/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();
      setData(result);
      console.log('[Test Sales Query] Response:', result);
    } catch (err: any) {
      setError(err.message);
      console.error('[Test Sales Query] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">销售数据测试页面</h1>

      <div className="grid gap-4 mb-6">
        <Button
          onClick={() => runTest('/api/sales/simple-test')}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          🔍 简单测试 - 快速诊断
        </Button>
        <Button onClick={() => runTest('/api/sales/debug')} disabled={loading}>
          测试 Debug API
        </Button>
        <Button onClick={() => runTest('/api/sales/test-yesterday')} disabled={loading}>
          测试昨天数据 API
        </Button>
        <Button onClick={() => runTest('/api/sales/raw-query')} disabled={loading}>
          测试原始查询 API
        </Button>
        <Button onClick={testSalesQuery} disabled={loading}>
          测试销量查询 API (POST)
        </Button>
        <Button onClick={() => runTest('/api/db/schema')} disabled={loading}>
          测试数据库结构 API
        </Button>
      </div>

      {error && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-red-600">错误</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm">{error}</pre>
          </CardContent>
        </Card>
      )}

      {data && (
        <Card>
          <CardHeader>
            <CardTitle>测试结果</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs overflow-auto max-h-96">
              {JSON.stringify(data, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}