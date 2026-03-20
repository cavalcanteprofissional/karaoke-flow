import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { songId, action, notes } = await request.json();

    if (!songId || !action) {
      return NextResponse.json(
        { error: "songId and action are required" },
        { status: 400 }
      );
    }

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    const { error: songError } = await supabase
      .from("songs")
      .update({ status: newStatus })
      .eq("id", songId);

    if (songError) {
      return NextResponse.json({ error: songError.message }, { status: 500 });
    }

    const { error: queueError } = await supabase
      .from("approval_queue")
      .update({
        status: newStatus,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_notes: notes || null,
      })
      .eq("song_id", songId);

    if (queueError) {
      return NextResponse.json({ error: queueError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: newStatus });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
