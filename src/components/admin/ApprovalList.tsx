"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Check, X, Clock, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type ApprovalQueueItem } from "@/lib/supabase/types";

const supabase = createClient();

export function ApprovalList() {
  const [items, setItems] = useState<ApprovalQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchApprovals = async () => {
    console.log("=== FETCHING APPROVALS ===");
    
    const { data, error } = await supabase
      .from("approval_queue")
      .select(`
        *,
        songs (*),
        profiles!approval_queue_requested_by_fkey (full_name)
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    console.log("Approvals query result:", { data, error });
    console.log("Number of items:", data?.length);

    if (error) {
      console.error("Error fetching approvals:", error);
    }

    setItems((data as ApprovalQueueItem[]) || []);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchApprovals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApprove = async (id: string, songId: string) => {
    setProcessingId(id);

    await supabase
      .from("songs")
      .update({ status: "approved" })
      .eq("id", songId);

    await supabase
      .from("approval_queue")
      .update({ status: "approved", reviewed_at: new Date().toISOString() })
      .eq("id", id);

    fetchApprovals();
    setProcessingId(null);
  };

  const handleReject = async (id: string, songId: string) => {
    setProcessingId(id);

    await supabase
      .from("songs")
      .update({ status: "rejected" })
      .eq("id", songId);

    await supabase
      .from("approval_queue")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", id);

    fetchApprovals();
    setProcessingId(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Nenhuma solicitação pendente</h3>
        <p className="text-muted-foreground">
          As solicitações de músicas aparecerão aqui para aprovação.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <Card key={item.id}>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="relative w-24 h-16 rounded overflow-hidden bg-muted flex-shrink-0">
                {item.songs?.thumbnail ? (
                  <Image
                    src={item.songs.thumbnail}
                    alt={item.songs.title}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : null}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{item.songs?.title}</p>
                <p className="text-sm text-muted-foreground">
                  Solicitado por {item.profiles?.full_name || "Desconhecido"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleApprove(item.id, item.song_id)}
                  disabled={processingId === item.id}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Aprovar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleReject(item.id, item.song_id)}
                  disabled={processingId === item.id}
                >
                  <X className="h-4 w-4 mr-1" />
                  Rejeitar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
