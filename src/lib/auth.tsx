import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { User, Session } from "@supabase/supabase-js";

// =============================================
// Auth token helper — reads JWT from localStorage
// (avoids Supabase client's initializePromise hang)
// Copied locally to avoid circular deps with storage.ts
// =============================================
function getAccessTokenFromLocalStorage(): string | null {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const projectRef = supabaseUrl.split("//")[1].split(".")[0];
    const sessionKey = `sb-${projectRef}-auth-token`;
    const raw = localStorage.getItem(sessionKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.access_token || parsed?.currentSession?.access_token || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

// =============================================
// Types
// =============================================
export interface TravelerProfile {
  age_range: string;
  traveler_type: string;
  interests: string[];
  pace: string;
  mobility: string;
  familiarity: string;
  display_name?: string;
}

export const DEFAULT_PROFILE: TravelerProfile = {
  age_range: "",
  traveler_type: "",
  interests: [],
  pace: "Equilibrato",
  mobility: "Nessuna limitazione",
  familiarity: "Mai stato qui",
};

// =============================================
// Auth Context
// =============================================
interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profile: TravelerProfile | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<TravelerProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const loading = false; // always false — app starts as guest immediately, never blocks UI
  const [profile, setProfile] = useState<TravelerProfile | null>(null);

  const fetchProfile = async (userId: string) => {
    try {
      const token = getAccessTokenFromLocalStorage();
      if (!token) { setProfile(null); return; }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=age_range,traveler_type,interests,pace,mobility,familiarity,display_name`,
        {
          method: "GET",
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (!res.ok) { setProfile(null); return; }
      const data = await res.json();
      if (data && data.length > 0) setProfile(data[0] as TravelerProfile);
      else setProfile(null);
    } catch {
      setProfile(null);
    }
  };

  // Auth initialization strategy:
  //
  // Supabase's initializePromise blocks ALL its APIs (getSession, from().select,
  // onAuthStateChange) while refreshing an expired token over the network.
  // This caused blank pages and stuck login forms.
  //
  // Fix: loading starts as FALSE — the app is always usable immediately as guest.
  // onAuthStateChange updates state asynchronously when Supabase is ready.
  // No spinners, no blank pages, no hard timeouts needed.
  //
  // IMPORTANT: On TOKEN_REFRESHED events, the session might briefly be null
  // during the refresh transition. We guard against this by only clearing
  // user/session on explicit SIGNED_OUT events, not on transient null sessions.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Auth] onAuthStateChange event:', event, 'has session:', !!session);

        // On SIGNED_OUT, explicitly clear state
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setSession(null);
          setProfile(null);
          return;
        }

        // On INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED — update session
        // Only clear user if session is truly null (not just a transient gap)
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else if (event !== 'TOKEN_REFRESHED') {
          // Don't clear profile during token refresh — it's likely transient
          setProfile(null);
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    return { error: error?.message ?? null };
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    setUser(null);
    setSession(null);
    setProfile(null);
    // Clear vagabond localStorage keys before Supabase signOut
    // (prevents stale data from reappearing via loadTrips fallback)
    try {
      localStorage.removeItem('vagabond_saved_trips_local');
      localStorage.removeItem('vagabond_traveler_profile');
    } catch { /* ignore */ }
    supabase.auth.signOut().catch(() => {});
  };

  const updateProfile = async (updates: Partial<TravelerProfile>) => {
    if (!user) return;
    const token = getAccessTokenFromLocalStorage();
    if (!token) throw new Error("No access token available");
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const res = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
      method: "PATCH",
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error("[Auth] Error updating profile:", res.status, errBody);
      throw new Error(`Profile update failed: ${res.status}`);
    }
    await fetchProfile(user.id);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, profile, signIn, signUp, signInWithGoogle, signOut, updateProfile, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
