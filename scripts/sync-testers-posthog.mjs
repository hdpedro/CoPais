#!/usr/bin/env node

/**
 * Sync is_android_tester flag from Supabase to PostHog
 *
 * Usage: node scripts/sync-testers-posthog.mjs
 *
 * This script identifies all 38 android testers in PostHog with the
 * is_android_tester=true property, so the analytics dashboard queries
 * can use dynamic filtering instead of hardcoded email lists.
 */

import { createClient } from '@supabase/supabase-js';
import { PostHog } from 'posthog-node';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (!supabaseUrl || !supabaseKey || !posthogKey) {
  console.error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_POSTHOG_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const posthog = new PostHog(posthogKey, {
  host: 'https://us.posthog.com',
  flushInterval: 0, // Flush immediately
});

async function syncTestersToPostHog() {
  try {
    console.log('🔄 Fetching android testers from Supabase...');

    const { data: testers, error } = await supabase
      .from('profiles')
      .select('id, email, is_android_tester')
      .eq('is_android_tester', true);

    if (error) {
      console.error('❌ Error fetching testers:', error);
      process.exit(1);
    }

    if (!testers || testers.length === 0) {
      console.log('⚠️  No testers found with is_android_tester=true');
      process.exit(0);
    }

    console.log(`✅ Found ${testers.length} android testers`);
    console.log('📤 Syncing to PostHog...\n');

    let synced = 0;
    for (const tester of testers) {
      try {
        posthog.identify({
          distinctId: tester.id,
          properties: {
            email: tester.email,
            is_android_tester: true,
          },
        });
        console.log(`✓ ${tester.email}`);
        synced++;
      } catch (err) {
        console.error(`✗ Error syncing ${tester.email}:`, err.message);
      }
    }

    // Flush pending events
    await posthog.shutdown();

    console.log(`\n✅ Successfully synced ${synced}/${testers.length} testers to PostHog`);
    console.log('\n💡 Note: Changes may take 1-2 minutes to appear in PostHog dashboards.');

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

syncTestersToPostHog();
