import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { fetchMyProfile, touchSeen } from "../lib/db";
import { padPin } from "../lib/pay";
import type { Profile } from "../lib/types";

interface AuthContextValue {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  signedIn: boolean;
  isOwner: boolean;
  signInWithPin: (email: string, pin: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      return;
    }
    try {
      const p = await fetchMyProfile(s.user.id);
      setProfile(p);
      if (p) void touchSeen();
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (active) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      await loadProfile(s);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signInWithPin = useCallback(async (email: string, pin: string) => {
    if (!supabase) return { error: "Supabase is not configured." };
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: padPin(pin),
    });
    if (error) {
      if (error.message.toLowerCase().includes("invalid login")) {
        return { error: "Wrong PIN. Try again." };
      }
      return { error: error.message };
    }
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    await loadProfile(data.session ?? null);
  }, [loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      session,
      profile,
      signedIn: !!session && !!profile,
      isOwner: profile?.role === "owner",
      signInWithPin,
      signOut,
      refreshProfile,
    }),
    [ready, session, profile, signInWithPin, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
