#!/usr/bin/env node

/**
 * Run database migrations on Supabase
 * This script executes the migration files in order
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration. Please check your .env.local file.');
  process.exit(1);
}

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Migration files to run
const migrations = [
  '20251225_extend_orders_with_payment_attribution.sql',
  '20251225_create_sales_analysis_functions.sql'
];

async function runMigration(filename) {
  const filePath = path.join(__dirname, '..', 'supabase', 'migrations', filename);

  try {
    // Read migration file
    const sql = fs.readFileSync(filePath, 'utf8');

    console.log(`\n📄 Running migration: ${filename}`);
    console.log('━'.repeat(60));

    // Split SQL by semicolons but preserve semicolons within functions
    const statements = [];
    let currentStatement = '';
    let inFunction = false;
    let dollarQuoteTag = null;

    const lines = sql.split('\n');

    for (const line of lines) {
      // Check for dollar quote tags ($$, $function$, etc.)
      const dollarQuoteMatch = line.match(/\$([a-zA-Z_]*)\$/g);
      if (dollarQuoteMatch) {
        dollarQuoteMatch.forEach(match => {
          if (!dollarQuoteTag) {
            dollarQuoteTag = match;
            inFunction = true;
          } else if (match === dollarQuoteTag) {
            dollarQuoteTag = null;
            inFunction = false;
          }
        });
      }

      // Check for CREATE FUNCTION/PROCEDURE
      if (line.match(/^\s*(CREATE|REPLACE|CREATE\s+OR\s+REPLACE)\s+(FUNCTION|PROCEDURE|TRIGGER)/i)) {
        inFunction = true;
      }

      currentStatement += line + '\n';

      // Check if statement is complete
      if (line.trim().endsWith(';') && !inFunction) {
        if (currentStatement.trim()) {
          statements.push(currentStatement.trim());
        }
        currentStatement = '';
      }
    }

    // Add any remaining statement
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim());
    }

    // Execute each statement
    let successCount = 0;
    let errorCount = 0;

    for (const statement of statements) {
      // Skip empty statements and comments
      if (!statement || statement.startsWith('--')) {
        continue;
      }

      try {
        // Extract first few words for logging
        const firstLine = statement.split('\n')[0];
        const operation = firstLine.substring(0, 80) + (firstLine.length > 80 ? '...' : '');

        // Execute the SQL statement using raw SQL execution
        const { error } = await supabase.rpc('exec_sql', {
          sql_query: statement
        }).single();

        if (error) {
          // If exec_sql doesn't exist, try direct execution (this might not work for all statements)
          // For production, you should use Supabase migrations or direct database access
          console.log(`⚠️  Note: Direct SQL execution not available via RPC`);
          console.log(`    Statement: ${operation}`);
          console.log(`    Please run this migration directly in Supabase SQL Editor`);
          errorCount++;
        } else {
          console.log(`✅ ${operation}`);
          successCount++;
        }
      } catch (err) {
        console.error(`❌ Error executing: ${statement.substring(0, 50)}...`);
        console.error(`   ${err.message}`);
        errorCount++;
      }
    }

    console.log('━'.repeat(60));
    console.log(`📊 Migration summary: ${successCount} successful, ${errorCount} failed`);

    if (errorCount > 0) {
      console.log(`\n⚠️  Some statements failed. This might be expected if:`);
      console.log(`   - Objects already exist (IF NOT EXISTS clauses)`);
      console.log(`   - Direct SQL execution is not enabled`);
      console.log(`\n📝 To run manually:`);
      console.log(`   1. Go to your Supabase dashboard`);
      console.log(`   2. Navigate to SQL Editor`);
      console.log(`   3. Copy and paste the migration file contents`);
      console.log(`   4. Execute the migration`);
    }

    return { success: successCount, errors: errorCount };

  } catch (error) {
    console.error(`❌ Failed to read or process migration file: ${filename}`);
    console.error(error.message);
    return { success: 0, errors: 1 };
  }
}

async function main() {
  console.log('🚀 Starting database migrations...');
  console.log(`📍 Supabase URL: ${supabaseUrl}`);
  console.log('═'.repeat(60));

  let totalSuccess = 0;
  let totalErrors = 0;

  for (const migration of migrations) {
    const result = await runMigration(migration);
    totalSuccess += result.success;
    totalErrors += result.errors;
  }

  console.log('\n' + '═'.repeat(60));
  console.log('🏁 Migration process complete!');
  console.log(`📊 Total: ${totalSuccess} successful statements, ${totalErrors} failed`);

  if (totalErrors > 0) {
    console.log('\n📌 Next steps:');
    console.log('   1. Copy the migration files from supabase/migrations/');
    console.log('   2. Go to Supabase Dashboard → SQL Editor');
    console.log('   3. Paste and execute each migration file');
    console.log('\n📁 Migration files:');
    migrations.forEach(m => {
      console.log(`   - ${m}`);
    });
  } else {
    console.log('\n✅ All migrations completed successfully!');
  }
}

// Run the migrations
main().catch(console.error);