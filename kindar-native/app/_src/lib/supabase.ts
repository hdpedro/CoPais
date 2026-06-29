/**
 * Supabase Client — Kindar Native
 *
 * Uses AsyncStorage for session persistence (survives app kill).
 * Same Supabase instance as the web app — all RLS policies apply.
 */

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Fail-fast: as EXPO_PUBLIC_* são inlinadas no bundle em build/OTA time. Se
// vierem vazias, o cliente Supabase nasce quebrado e o app serve cache stale em
// TODAS as telas SEM erro visível — incidente 2026-06-29: OTA publicado de um
// clone sem .env → URL/key vazias → Família stale + herói some + re-login não
// cura (o próprio login passa por este cliente). Um bundle mal-configurado NUNCA
// deve "funcionar pela metade": falhar barulhento aqui força detecção imediata
// (e auto-rollback do EAS, se ligado) em vez de corromper dado em silêncio. Só
// as 2 vars CRÍTICAS — opcionais (PostHog/Google/RevenueCat) degradam de boa.
// Guard de teste: vitest roda com NODE_ENV='test' (e os specs mockam este módulo).
// Ver memória feedback_eas_update_env_injection.
if (process.env.NODE_ENV !== 'test' && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
  throw new Error(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL/ANON_KEY vazias no bundle. Publique a OTA ' +
      'de um tree COM .env — `eas update` NÃO lê o eas.json build.env. ' +
      'Ver feedback_eas_update_env_injection.',
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
