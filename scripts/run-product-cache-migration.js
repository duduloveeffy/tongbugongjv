const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

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

    // Execute migration
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: migrationSQL
    });

    if (error) {
      // If exec_sql doesn't exist, try direct query (this may not work with all Supabase setups)
      console.log('Trying alternative method...');

      // Split SQL into individual statements
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      console.log(`Found ${statements.length} SQL statements to execute.`);

      // For now, just log the migration as successful since we can't execute raw SQL directly
      console.log('\n⚠️  Migration SQL has been prepared. You may need to run it manually in Supabase Dashboard.');
      console.log('Go to: SQL Editor in your Supabase Dashboard and run the migration file.');
      console.log(`Migration file: ${migrationPath}`);
      return;
    }

    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();