import { Suspense } from "react";
import { ContactsView } from "@/components/contacts/contacts-view";
import { getContacts } from "@/lib/actions/contacts";
import { getStages } from "@/lib/actions/stages";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Contacts",
};

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; stage?: string; sort?: string }>;
}) {
  const params = await searchParams;

  const [contactsResult, stagesResult] = await Promise.all([
    getContacts({
      search: params.search,
      stageId: params.stage,
    }),
    getStages(),
  ]);

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ContactsView
        contacts={contactsResult.data || []}
        stages={stagesResult.data || []}
        initialSearch={params.search || ""}
        initialStage={params.stage || ""}
        initialSort={params.sort || "updatedAt"}
      />
    </Suspense>
  );
}
