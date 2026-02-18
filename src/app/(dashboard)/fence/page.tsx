import { getFences, getGeocodedContacts, getTeamMembers } from "@/lib/actions/fences";
import { getLeadStages } from "@/lib/actions/stages";
import { FenceView } from "@/components/fence/fence-view";

export default async function FencePage() {
  const [fencesResult, contactsResult, stagesResult, teamResult] =
    await Promise.all([
      getFences(),
      getGeocodedContacts(),
      getLeadStages(),
      getTeamMembers(),
    ]);

  return (
    <FenceView
      initialFences={fencesResult.data}
      initialContacts={contactsResult.data}
      stages={stagesResult.data ?? []}
      teamMembers={teamResult.data}
    />
  );
}
