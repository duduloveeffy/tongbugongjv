import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { url, filename } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // 动态导入 puppeteer（只在服务端运行）
    const puppeteer = await import('puppeteer');

    // 启动浏览器
    const browser = await puppeteer.default.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();

    // 设置视口大小（A4 宽度）
    await page.setViewport({
      width: 1200,
      height: 1600,
      deviceScaleFactor: 2,
    });

    // 访问页面
    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });

    // 等待图表渲染完成
    await page.waitForSelector('.recharts-wrapper', { timeout: 10000 }).catch(() => {
      console.log('No recharts found, continuing...');
    });

    // 额外等待确保图表动画完成
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 隐藏不需要导出的元素
    await page.evaluate(() => {
      // 隐藏顶部固定栏
      const header = document.querySelector('.sticky.top-0');
      if (header) (header as HTMLElement).style.display = 'none';

      // 隐藏所有 no-print 元素
      document.querySelectorAll('.no-print').forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });

      // 移除 sticky 定位
      document.querySelectorAll('.sticky').forEach(el => {
        (el as HTMLElement).style.position = 'relative';
      });
    });

    // 生成 PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '10mm',
        left: '10mm',
      },
      preferCSSPageSize: false,
    });

    await browser.close();

    // 返回 PDF
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename || 'report.pdf'}"`,
      },
    });
  } catch (error: any) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: error.message },
      { status: 500 }
    );
  }
}
