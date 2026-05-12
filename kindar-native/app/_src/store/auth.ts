/**
 * Auth Store — Kindar Native
 *
 * Codex audit fixes applied:
 * - onAuthStateChange for reactive session management
 * - Clears data on user switch
 * - Group selection persisted in AsyncStorage
 * - Error checking on all queries
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { QUICK_ACTIONS_CATALOG_NATIVE } from '../lib/constants';
import { translateAuthError } from '../lib/auth-errors';

const ACTIVE_GROUP_KEY = '@kindar_active_group';
let authSubscription: { unsubscribe: () => void } | null = null;

interface QuickActionsConfig {
  primary: string;
  secondary: string[];
}

interface Profile {
  id: string;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  avatar_url: string | null;
  locale: string | null;
  quick_actions: QuickActionsConfig | null;
}

interface ActiveGroup {
  groupId: string;
  groupName: string;
  isReadonly: boolean;
  custodyEnabled: boolean;
}

interface GroupMembership {
  groupId: string;
  groupName: string;
  role: string;
  custodyEnabled: boolean;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  userId: string | null;
  profile: Profile | null;
  activeGroup: ActiveGroup | null;
  memberships: GroupMembership[];

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, fullName: string, refCode?: string | null) => Promise<{ success: boolean; error?: string }>;
  resendConfirmation: (email: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  loadProfile: () => Promise<void>;
  loadActiveGroup: () => Promise<void>;
  switchGroup: (groupId: string) => void;
  updateQuickActions: (primary: string, secondary: string[]) => Promise<{ success: boolean; error?: string }>;
}

export const useAuth = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isLoading: true,
  userId: null,
  profile: null,
  activeGroup: null,
  memberships: [],

  initialize: async () => {
    set({ isLoading: true });

    // Subscribe to auth state changes (handles token refresh, sign out, user switch)
    if (!authSubscription) {
      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT' || !session?.user) {
          set({ isAuthenticated: false, userId: null, profile: null, activeGroup: null, memberships: [] });
          return;
        }

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          const uid = session.user.id;
          const currentUid = get().userId;

          // User switched — clear stale data
          if (currentUid && currentUid !== uid) {
            set({ profile: null, activeGroup: null, memberships: [] });
          }

          set({ isAuthenticated: true, userId: uid });
          Promise.all([get().loadProfile(), get().loadActiveGroup()]).catch(() => {});
        }
      });
      authSubscription = data.subscription;
    }

    // Check existing session
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        set({ isAuthenticated: true, userId: session.user.id });
        await Promise.all([get().loadProfile(), get().loadActiveGroup()]);
      }
    } catch {}

    set({ isLoading: false });
  },

  signIn: async (email, password) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      // Erros do Supabase chegam em ingles — mapeia pra pt-BR pra UI nao
      // expor strings tipo "Email not confirmed" / "Invalid login credentials".
      // Bug observado 2026-05-12 (Brenno) onde a UI vazou o ingles cru.
      if (error) return { success: false, error: translateAuthError(error.message) };

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: false, error: 'Erro ao obter usuario' };

      set({ isAuthenticated: true, userId: user.id });
      await Promise.all([get().loadProfile(), get().loadActiveGroup()]);
      return { success: true };
    } catch {
      return { success: false, error: 'Erro de conexao' };
    }
  },

  resendConfirmation: async (email: string) => {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
      });
      if (error) return { success: false, error: translateAuthError(error.message) };
      return { success: true };
    } catch {
      return { success: false, error: 'Erro de conexao' };
    }
  },

  signUp: async (email, password, fullName, refCode) => {
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: fullName,
            // Mirror PWA action: pass `referred_by` so the
            // `handle_new_user` trigger can persist the attribution.
            // Optional — server validates the code exists before
            // recording (invalid codes are simply ignored).
            ...(refCode ? { referred_by: refCode.toUpperCase().trim() } : {}),
          },
        },
      });
      if (error) return { success: false, error: translateAuthError(error.message) };
      return { success: true };
    } catch {
      return { success: false, error: 'Erro de conexão' };
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    await AsyncStorage.removeItem(ACTIVE_GROUP_KEY);
    set({ isAuthenticated: false, userId: null, profile: null, activeGroup: null, memberships: [] });
  },

  loadProfile: async () => {
    const userId = get().userId;
    if (!userId) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, display_name, email, phone, role, avatar_url, locale, quick_actions')
      .eq('id', userId)
      .single();
    if (!error && data) set({ profile: data as Profile });
  },

  loadActiveGroup: async () => {
    const userId = get().userId;
    if (!userId) return;

    const { data: raw, error } = await supabase
      .from('group_members')
      .select('group_id, role, coparenting_groups(id, name, custody_enabled)')
      .eq('user_id', userId)
      .limit(10);

    if (error || !raw || raw.length === 0) {
      set({ activeGroup: null, memberships: [] });
      return;
    }

    const list: GroupMembership[] = raw.map((m: { role: string; coparenting_groups: unknown }) => {
      const g = m.coparenting_groups as unknown as { id: string; name: string; custody_enabled: boolean };
      return { groupId: g.id, groupName: g.name, role: m.role, custodyEnabled: g.custody_enabled };
    });
    set({ memberships: list });

    // Restore persisted group or default to first
    // If saved group no longer exists (user removed), clear stale key
    const savedId = await AsyncStorage.getItem(ACTIVE_GROUP_KEY);
    const saved = savedId ? list.find(m => m.groupId === savedId) : null;
    if (savedId && !saved) {
      await AsyncStorage.removeItem(ACTIVE_GROUP_KEY);
    }
    const active = saved || list[0];

    set({
      activeGroup: {
        groupId: active.groupId,
        groupName: active.groupName,
        isReadonly: active.role === 'readonly',
        custodyEnabled: active.custodyEnabled,
      },
    });
  },

  switchGroup: (groupId: string) => {
    const m = get().memberships.find(x => x.groupId === groupId);
    if (!m) return;
    AsyncStorage.setItem(ACTIVE_GROUP_KEY, groupId);
    set({
      activeGroup: {
        groupId: m.groupId,
        groupName: m.groupName,
        isReadonly: m.role === 'readonly',
        custodyEnabled: m.custodyEnabled,
      },
    });
  },

  updateQuickActions: async (primary: string, secondary: string[]) => {
    const userId = get().userId;
    if (!userId) return { success: false, error: 'Não autenticado' };

    const validIds = new Set(QUICK_ACTIONS_CATALOG_NATIVE.map(a => a.id));
    if (!validIds.has(primary)) return { success: false, error: 'Ação primária inválida' };

    const validSecondary = secondary
      .filter(id => validIds.has(id) && id !== primary)
      .slice(0, 6);

    const quickActions: QuickActionsConfig = { primary, secondary: validSecondary };

    const { error } = await supabase
      .from('profiles')
      .update({ quick_actions: quickActions })
      .eq('id', userId);

    if (error) return { success: false, error: 'Erro ao salvar preferências' };

    set(state => ({
      profile: state.profile ? { ...state.profile, quick_actions: quickActions } : state.profile,
    }));

    return { success: true };
  },
}));
