"use client";

import { ApprovalList } from "@/components/admin/ApprovalList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";

export default function ApprovalsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Aprovações</h1>
        <p className="text-muted-foreground">
          Revise as solicitações de músicas pendentes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Solicitações Pendentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ApprovalList />
        </CardContent>
      </Card>
    </div>
  );
}
