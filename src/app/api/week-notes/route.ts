import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// GET: 获取备注（支持单个或批量）
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Supabase not configured' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const week = searchParams.get('week');
    const weeks = searchParams.get('weeks'); // 批量查询：格式 "2025-50,2025-51,2025-52"

    // 批量查询模式
    if (weeks) {
      const weekPairs = weeks.split(',').map((w) => {
        const [y, wk] = w.split('-');
        return { year: parseInt(y), week: parseInt(wk) };
      });

      const { data, error } = await supabase
        .from('week_notes')
        .select('year, week, note, updated_at')
        .or(weekPairs.map((wp) => `and(year.eq.${wp.year},week.eq.${wp.week})`).join(','));

      if (error) {
        console.error('Error fetching week notes:', error);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }

      // 转换为 Map 格式方便前端使用
      const notesMap: Record<string, { note: string; updatedAt: string }> = {};
      for (const item of data || []) {
        notesMap[`${item.year}-${item.week}`] = {
          note: item.note,
          updatedAt: item.updated_at,
        };
      }

      return NextResponse.json({ success: true, data: notesMap });
    }

    // 单个查询模式
    if (!year || !week) {
      return NextResponse.json(
        { success: false, error: 'Missing year or week parameter' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('week_notes')
      .select('note, updated_at')
      .eq('year', parseInt(year))
      .eq('week', parseInt(week))
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = not found
      console.error('Error fetching week note:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data ? { note: data.note, updatedAt: data.updated_at } : null,
    });
  } catch (error: any) {
    console.error('Week notes GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST: 创建或更新备注
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Supabase not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { year, week, note } = body;

    if (!year || !week) {
      return NextResponse.json(
        { success: false, error: 'Missing year or week' },
        { status: 400 }
      );
    }

    // 如果备注为空，删除记录
    if (!note || note.trim() === '') {
      const { error } = await supabase
        .from('week_notes')
        .delete()
        .eq('year', year)
        .eq('week', week);

      if (error) {
        console.error('Error deleting week note:', error);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, data: null });
    }

    // Upsert 备注
    const { data, error } = await supabase
      .from('week_notes')
      .upsert(
        {
          year,
          week,
          note: note.trim(),
        },
        {
          onConflict: 'year,week',
        }
      )
      .select('note, updated_at')
      .single();

    if (error) {
      console.error('Error saving week note:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { note: data.note, updatedAt: data.updated_at },
    });
  } catch (error: any) {
    console.error('Week notes POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
