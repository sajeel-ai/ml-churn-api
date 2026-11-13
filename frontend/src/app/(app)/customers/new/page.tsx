"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CustomerEditor } from "@/components/customer-editor";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { canWrite, useMe } from "@/lib/hooks";

export default function NewCustomerPage() {
  const { data: me } = useMe();
  if (me && !canWrite(me)) return <Alert tone="warning" title="Not available">Your role is read-only, so you cannot add customers.</Alert>;
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2"><Link href="/customers"><ArrowLeft className="h-4 w-4" />Customers</Link></Button>
      <PageHeader title="Add customer" description="Store the 19 model inputs for a customer so you can re-score them later." />
      <Card><CardContent className="pt-5"><CustomerEditor /></CardContent></Card>
    </>
  );
}
