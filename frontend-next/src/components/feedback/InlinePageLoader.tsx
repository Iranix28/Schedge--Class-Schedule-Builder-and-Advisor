"use client";

export default function InlinePageLoader({
  message = "Loading...",
}: {
  message?: string;
}) {
  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="text-center py-12">
        <div
          className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-3"
          style={{ borderColor: "#BE0000" }}
        ></div>
        <p className="text-slate-500">{message}</p>
      </div>
    </div>
  );
}
