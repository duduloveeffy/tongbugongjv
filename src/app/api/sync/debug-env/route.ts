/**
 * 环境变量诊断 API
 * 用于检查 Vercel 部署时的 URL 配置
 */

import { NextResponse } from 'next/server';

export async function GET() {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL
    ? process.env.NEXT_PUBLIC_APP_URL
    : 'http://localhost:3000';

  return NextResponse.json({
    success: true,
    env: {
      VERCEL_URL: process.env.VERCEL_URL || null,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || null,
      computed_baseUrl: baseUrl,
      computed_apiUrl: `${baseUrl}/api/sync/site`,
    },
  });
}
