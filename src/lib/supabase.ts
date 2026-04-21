"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LockFunc } from "@supabase/auth-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let browserClient: SupabaseClient | null = null;
let authLockQueue = Promise.resolve();

const inMemoryAuthLock: LockFunc = async (_name, _acquireTimeout, fn) => {
  const previous = authLockQueue;
  let releaseCurrent!: () => void;

  authLockQueue = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });

  await previous;

  try {
    return await fn();
  } finally {
    releaseCurrent();
  }
};

export function hasSupabaseConfig() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function getSupabaseBrowserClient() {
  if (!hasSupabaseConfig()) {
    throw new Error(
      "Variaveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY nao foram configuradas.",
    );
  }

  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        lock: inMemoryAuthLock,
        persistSession: true,
      },
    });
  }

  return browserClient;
}
