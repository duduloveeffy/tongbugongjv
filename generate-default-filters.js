async function generateDefaultFilters() {
  const url = 'https://evcmuhykdcmyvgbyluds.supabase.co';
  const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2Y211aHlrZGNteXZnYnlsdWRzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDU2MDY4OCwiZXhwIjoyMDcwMTM2Njg4fQ.KljaPh35GDCtBFBzflnrEfoqsNYodltWN_TzakXdiB4';

  // 首先检查字段是否存在
  const checkRes = await fetch(url + '/rest/v1/wc_sites?select=sku_filter&limit=1', {
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
  });
  const checkData = await checkRes.json();

  if (checkData.code === 'PGRST204') {
    console.log('❌ 错误: 数据库缺少筛选字段!\n');
    console.log('请先在 Supabase Dashboard 中执行以下 SQL:');
    console.log('=========================================');
    console.log(`
ALTER TABLE wc_sites ADD COLUMN IF NOT EXISTS sku_filter text DEFAULT '';
ALTER TABLE wc_sites ADD COLUMN IF NOT EXISTS exclude_sku_prefixes text DEFAULT '';
ALTER TABLE wc_sites ADD COLUMN IF NOT EXISTS category_filters text[] DEFAULT '{}';
ALTER TABLE wc_sites ADD COLUMN IF NOT EXISTS exclude_warehouses text DEFAULT '';
    `);
    console.log('=========================================');
    console.log('\n打开: https://supabase.com/dashboard/project/evcmuhykdcmyvgbyluds/sql/new');
    console.log('粘贴以上SQL并运行，然后重新执行此脚本。');
    return;
  }

  console.log('✓ 数据库字段已就绪\n');

  // Get all sites
  const sitesRes = await fetch(url + '/rest/v1/wc_sites?select=id,name,url', {
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
  });
  const sites = await sitesRes.json();

  console.log('=== Site Default Filter Recommendations ===\n');

  // 根据站点名称和业务逻辑推断SKU前缀
  // VapSolo 站点通常销售多种品牌
  // 特定品牌站点只销售该品牌

  const siteFilterMap = {
    // VapSolo 零售站点 - 多品牌
    'vapsolo-co': {
      sku_filter: '',
      exclude_sku_prefixes: '',  // 可以销售所有产品
      note: 'VapSolo主站(哥伦比亚) - 多品牌零售'
    },
    'vapsolo-fr': {
      sku_filter: '',
      exclude_sku_prefixes: '',
      note: 'VapSolo法国 - 多品牌零售'
    },
    'vapsolo-es': {
      sku_filter: '',
      exclude_sku_prefixes: '',
      note: 'VapSolo西班牙 - 多品牌零售'
    },
    'vapsolo-us': {
      sku_filter: '',
      exclude_sku_prefixes: '',
      note: 'VapSolo美国 - 多品牌零售'
    },
    'vapsolo-uk': {
      sku_filter: '',
      exclude_sku_prefixes: '',
      note: 'VapSolo英国 - 多品牌零售'
    },
    'vapsolo-de': {
      sku_filter: '',
      exclude_sku_prefixes: '',
      note: 'VapSolo德国 - 多品牌零售'
    },
    'vapsolo-glo': {
      sku_filter: '',
      exclude_sku_prefixes: '',
      note: 'VapSolo全球站 - 多品牌零售'
    },

    // VapSolo 批发站点
    'vapsolo-co-wholesale': {
      sku_filter: '',
      exclude_sku_prefixes: '',
      note: 'VapSolo批发(哥伦比亚) - 批发渠道'
    },
    'Vapsolowholes': {
      sku_filter: '',
      exclude_sku_prefixes: '',
      note: 'VapSolo批发 - 批发渠道'
    },
    'vapsolo-wholesale': {
      sku_filter: '',
      exclude_sku_prefixes: '',
      note: 'VapSolo批发 - 批发渠道'
    },

    // JNR 品牌站点 - 只卖JNR相关
    'JNR-FR': {
      sku_filter: 'JNR,Falcon,Aurora,Panda,Fox,Flex,Radiance',
      exclude_sku_prefixes: 'VOZOL,ELF,LOST,FUME,FUMOT',
      note: 'JNR法国 - 仅JNR品牌系列'
    },

    // VOZOL 品牌站点
    'vozol-co': {
      sku_filter: 'VOZOL',
      exclude_sku_prefixes: 'JNR,ELF,LOST,FUME',
      note: 'VOZOL站点 - 仅VOZOL品牌'
    },

    // SpaceX Vape 站点
    'spacexvape.nl': {
      sku_filter: '',
      exclude_sku_prefixes: '',
      note: 'SpaceX Vape荷兰 - 多品牌'
    },
    'de.spacexvape': {
      sku_filter: '',
      exclude_sku_prefixes: '',
      note: 'SpaceX Vape德国 - 多品牌'
    },
    'spacexvape.com': {
      sku_filter: '',
      exclude_sku_prefixes: '',
      note: 'SpaceX Vape主站 - 多品牌'
    },

    // Fumot 品牌站点
    'Fumot-de': {
      sku_filter: 'FUMOT,FUME',
      exclude_sku_prefixes: 'JNR,VOZOL,ELF,LOST',
      note: 'Fumot德国 - 仅Fumot品牌'
    },
  };

  // 打印推荐配置
  for (const site of sites) {
    const config = siteFilterMap[site.name] || {
      sku_filter: '',
      exclude_sku_prefixes: '',
      note: '未知站点类型 - 需要手动配置'
    };

    console.log(`站点: ${site.name}`);
    console.log(`  URL: ${site.url || 'N/A'}`);
    console.log(`  说明: ${config.note}`);
    console.log(`  SKU筛选: ${config.sku_filter || '(全部)'}`);
    console.log(`  排除前缀: ${config.exclude_sku_prefixes || '(无)'}`);
    console.log('');
  }

  // 询问是否应用
  console.log('=== 应用默认配置 ===\n');

  let updateCount = 0;
  for (const site of sites) {
    const config = siteFilterMap[site.name];
    if (config && (config.sku_filter || config.exclude_sku_prefixes)) {
      // 只更新有特定规则的站点
      const updateRes = await fetch(url + '/rest/v1/wc_sites?id=eq.' + site.id, {
        method: 'PATCH',
        headers: {
          'apikey': key,
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          sku_filter: config.sku_filter,
          exclude_sku_prefixes: config.exclude_sku_prefixes
        })
      });

      if (updateRes.ok) {
        console.log(`✓ 已更新: ${site.name}`);
        updateCount++;
      } else {
        const error = await updateRes.text();
        console.log(`✗ 更新失败: ${site.name} - ${error}`);
      }
    }
  }

  console.log(`\n共更新 ${updateCount} 个站点的筛选配置`);
}

generateDefaultFilters().catch(console.error);
