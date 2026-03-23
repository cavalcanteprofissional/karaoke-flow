import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/dashboard";

  console.log("=== API /auth/exchange ===");
  console.log("Code:", code);
  console.log("Next:", next);

  if (!code) {
    console.log("No code provided");
    return NextResponse.json({ 
      error: "No code provided",
      requiresRedirect: true,
      redirectUrl: "/login"
    }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getSession();

    console.log("getSession result:", { 
      hasSession: !!data?.session,
      userId: data?.session?.user?.id,
      error: error?.message 
    });

    if (error) {
      console.error("getSession error:", error);
      return NextResponse.json({ 
        success: false, 
        error: error.message,
        requiresRedirect: true,
        redirectUrl: "/login"
      });
    }

    if (!data.session) {
      console.log("No session from getSession");
      return NextResponse.json({ 
        success: false, 
        error: "No session",
        requiresRedirect: true,
        redirectUrl: "/login"
      });
    }

    console.log("Session found, user:", data.session.user.id);

    // Buscar profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.session.user.id)
      .single();

    if (profileError) {
      console.log("Profile error:", profileError.message);
    }

    const userData = {
      id: data.session.user.id,
      email: data.session.user.email || '',
      full_name: profile?.full_name || data.session.user.user_metadata?.full_name || '',
      role: profile?.role || 'user',
      avatar_url: profile?.avatar_url || data.session.user.user_metadata?.avatar_url || '',
      created_at: profile?.created_at || new Date().toISOString(),
      updated_at: profile?.updated_at || new Date().toISOString(),
    };

    console.log("Returning user:", userData.id);

    return NextResponse.json({
      success: true,
      user: userData,
      redirectUrl: next,
    });
  } catch (err) {
    console.error("Exchange catch error:", err);
    return NextResponse.json({ 
      success: false, 
      error: "Internal error",
      requiresRedirect: true,
      redirectUrl: "/login"
    }, { status: 500 });
  }
}
