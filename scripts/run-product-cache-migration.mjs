import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration. Please check your .env.local file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  try {
    console.log('Running product cache migration...');

    // Read migration SQL
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20250119_create_wc_products_cache.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('\n📋 Migration Summary:');
    console.log('- Creates wc_products_cache table for caching WooCommerce products');
    console.log('- Creates wc_products_sync_status table for tracking sync progress');
    console.log('- Adds indexes for better query performance');
    console.log('- Creates helper functions for cache operations');

    // Since we can't execute raw SQL directly through the Supabase client,
    // we'll provide instructions for manual execution
    console.log('\n⚠️  Please run the following migration manually:');
    console.log('1. Go to your Supabase Dashboard: ' + supabaseUrl);
    console.log('2. Navigate to SQL Editor');
    console.log('3. Create a new query');
    console.log('4. Copy and paste the content from:');
    console.log(`   ${migrationPath}`);
    console.log('5. Click "Run" to execute the migration');

    // Check if tables already exist
    const { data: existingTables, error: tableError } = await supabase
      .from('wc_products_cache')
      .select('id')
      .limit(1);

    if (!tableError) {
      console.log('\n✅ Tables may already exist. You can skip the migration if tables are already created.');
    } else {
      console.log('\n📌 Tables do not exist yet. Please run the migration to create them.');
    }

    console.log('\n✨ After running the migration, you can:');
    console.log('1. Go to /sites page');
    console.log('2. Click "同步产品缓存" button for each site');
    console.log('3. Products will be cached locally for faster detection');

  } catch (error) {
    console.error('Error checking migration status:', error);
    process.exit(1);
  }
}

runMigration();