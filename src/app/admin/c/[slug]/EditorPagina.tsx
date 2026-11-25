"use client";

import { AdminGate } from "@/components/admin/AdminGate";
import { Editor } from "@/components/admin/Editor";

export function EditorPagina({ slug }: { slug: string }) {
  return <AdminGate somenteAdmin permitirEditor>{() => <Editor slug={slug} />}</AdminGate>;
}
