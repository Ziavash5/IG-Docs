import { notFound } from "next/navigation";
import { getUnitContent } from "@/lib/db";
import { getActiveCorridor } from "@/lib/corridor";
import { UnitEditor } from "../../editor";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const metadata = { title: "Edit — Corridor Authority Engine" };

export default async function EditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let unit;
  try {
    unit = await getUnitContent(await getActiveCorridor(), slug);
  } catch {
    unit = null;
  }
  if (!unit) notFound();

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <UnitEditor slug={slug} question={unit.question} initialBody={unit.body ?? ""} />
    </div>
  );
}
