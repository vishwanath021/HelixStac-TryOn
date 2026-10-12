"use client";

export function LeadStatus({ id, status }: { id: string; status: string }) {
  return (
    <select
      className="field py-1"
      defaultValue={status}
      aria-label="Lead status"
      onChange={(event) => {
        void fetch(`/api/v1/admin/leads/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: event.target.value }),
        });
      }}
    >
      {["NEW", "CONTACTED", "BOOKED", "CLOSED"].map((item) => <option key={item}>{item}</option>)}
    </select>
  );
}
