/**
 * 环境变量诊断 API
 * 用于检查 Vercel 部署时的 URL 配置
 */

import { NextResponse } from 'next/server';

export async function GET() {
  // 修复后的优先级: NEXT_PUBLIC_APP_URL > VERCEL_URL > localhost
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    ? process.env.NEXT_PUBLIC_APP_URL
    : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  return NextResponse.json({
    success: true,
    env: {
      VERCEL_URL: process.env.VERCEL_URL || null,
      VERCEL_ENV: process.env.VERCEL_ENV || null,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || null,
      computed_baseUrl: baseUrl,
      computed_apiUrl: `${baseUrl}/api/sync/site`,
    },
    recommendation: process.env.NEXT_PUBLIC_APP_URL
      ? '✅ 使用生产域名'
      : '⚠️ 建议在 Vercel 设置 NEXT_PUBLIC_APP_URL=https://restore-analysis.vercel.app',
  });
}
