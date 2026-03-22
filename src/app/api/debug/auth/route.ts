import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  
  const { data: userData, error: userError } = await supabase.auth.getUser();

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    server: "Next.js API Route (Server)",
    auth: {
      getSession: {
        hasSession: !!sessionData?.session,
        userId: sessionData?.session?.user?.id || null,
        error: sessionError?.message || null,
      },
      getUser: {
        hasUser: !!userData?.user,
        userId: userData?.user?.id || null,
        email: userData?.user?.email || null,
        error: userError?.message || null,
      },
    },
  });
}
