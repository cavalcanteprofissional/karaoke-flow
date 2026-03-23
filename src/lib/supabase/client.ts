import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          if (typeof document === "undefined") return undefined;
          const match = document.cookie.match(
            new RegExp("(^| )" + name + "=([^;]+)")
          );
          return match ? decodeURIComponent(match[2]) : undefined;
        },
        set(name, value, options) {
          if (typeof document === "undefined") return;
          let cookie = `${name}=${encodeURIComponent(value)}; path=${options?.path || "/"}`;
          if (options?.maxAge) cookie += `; max-age=${options.maxAge}`;
          if (options?.domain) cookie += `; domain=${options.domain}`;
          if (options?.secure) cookie += "; Secure";
          if (options?.sameSite) cookie += `; samesite=${options.sameSite}`;
          document.cookie = cookie;
        },
        remove(name, options) {
          if (typeof document === "undefined") return;
          let cookie = `${name}=; path=${options?.path || "/"}; max-age=0`;
          if (options?.domain) cookie += `; domain=${options.domain}`;
          document.cookie = cookie;
        },
      },
    }
  );
}
