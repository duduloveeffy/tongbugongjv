#!/usr/bin/env node

/**
 * Manually trigger sync queue processor
 * This script triggers the processing of pending sync tasks
 */

const MAX_ITERATIONS = 10; // Maximum number of tasks to process
let processedCount = 0;

async function triggerProcessor() {
  try {
    console.log('🚀 Triggering sync queue processor...');

    const response = await fetch('http://localhost:3000/api/sync/queue/processor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Failed to trigger processor:', error);
      return false;
    }

    const result = await response.json();

    if (result.success) {
      console.log('✅ Task processed successfully');
      console.log('   Task ID:', result.taskId);
      console.log('   Site:', result.siteName);
      console.log('   Type:', result.taskType);
      if (result.results) {
        console.log('   Results:', JSON.stringify(result.results, null, 2));
      }
      return true;
    } else if (result.message === 'No pending tasks') {
      console.log('ℹ️  No pending tasks in queue');
      return false;
    } else if (result.message === 'Max concurrent tasks reached') {
      console.log('⚠️  Maximum concurrent tasks reached, waiting...');
      return false;
    } else {
      console.log('ℹ️  Response:', result);
      return false;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function checkQueue() {
  try {
    const response = await fetch('http://localhost:3000/api/sync/queue');
    if (!response.ok) return null;

    const data = await response.json();
    return data.stats;
  } catch (error) {
    console.error('Failed to check queue:', error.message);
    return null;
  }
}

async function main() {
  // Check initial queue status
  const initialStats = await checkQueue();
  if (initialStats) {
    console.log('📊 Queue Status:');
    console.log(`   Pending: ${initialStats.pending}`);
    console.log(`   Processing: ${initialStats.processing}`);
    console.log(`   Completed: ${initialStats.completed}`);
    console.log(`   Failed: ${initialStats.failed}`);
    console.log('');
  }

  // Process tasks
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const stats = await checkQueue();

    if (!stats || stats.pending === 0) {
      console.log('\n✨ All tasks processed!');
      break;
    }

    console.log(`\n📦 Processing task ${i + 1}/${MAX_ITERATIONS}...`);
    console.log(`   Remaining: ${stats.pending} pending, ${stats.processing} processing`);

    const processed = await triggerProcessor();

    if (processed) {
      processedCount++;
      // Wait a bit before processing next task
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      // If no task was processed, wait longer
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // Final status
  const finalStats = await checkQueue();
  if (finalStats) {
    console.log('\n📊 Final Queue Status:');
    console.log(`   Pending: ${finalStats.pending}`);
    console.log(`   Processing: ${finalStats.processing}`);
    console.log(`   Completed: ${finalStats.completed}`);
    console.log(`   Failed: ${finalStats.failed}`);
    console.log(`\n✅ Processed ${processedCount} tasks`);
  }
}

// Run the script
main().catch(console.error);