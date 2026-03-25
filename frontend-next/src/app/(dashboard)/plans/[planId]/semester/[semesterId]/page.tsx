export default async function SemesterPage({
  params,
}: {
  params: Promise<{ planId: string; semesterId: string }>;
}) {
  const { planId, semesterId } = await params;

  return (
    <div className="p-6">
      Semester placeholder: plan {planId}, semester {semesterId}
    </div>
  );
}
