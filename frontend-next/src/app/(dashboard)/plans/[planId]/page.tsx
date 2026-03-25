export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;

  return <div className="p-6">Plan detail placeholder: {planId}</div>;
}
