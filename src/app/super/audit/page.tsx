import Link from "next/link";
import { auditLabel, listAudit } from "@/lib/super/audit";
import { pageSuper } from "@/lib/session";

export const dynamic = "force-dynamic";

function when(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  await pageSuper();
  const params = await searchParams;
  const action = params.action || "";
  const page = Math.max(1, Number(params.page) || 1);
  const data = await listAudit({ action, page });
  const href = (next: number) => {
    const query = new URLSearchParams();
    if (action) query.set("action", action);
    if (next > 1) query.set("page", String(next));
    const text = query.toString();
    return text ? `/super/audit?${text}` : "/super/audit";
  };
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="page-title">Audit log</h1>
      <p className="mt-2 text-sm text-muted">Newest events first.</p>
      <form className="mt-4 flex flex-wrap items-end gap-2" method="get">
        <label className="text-sm">
          Action
          <select className="field mt-1 min-w-48" name="action" defaultValue={action} aria-label="Action">
            <option value="">All actions</option>
            {data.actions.map((item) => (
              <option key={item} value={item}>{auditLabel(item)}</option>
            ))}
          </select>
        </label>
        <button className="btn" type="submit">Filter</button>
      </form>
      {data.items.length === 0 ? (
        <p className="card mt-4 p-4 text-sm text-muted">No audit events yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-muted">
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Action</th>
                <th className="py-2 pr-3">Target</th>
                <th className="py-2">Actor</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id} className="border-t border-line">
                  <td className="py-2 pr-3 whitespace-nowrap">{when(item.createdAt)}</td>
                  <td className="py-2 pr-3">{auditLabel(item.action)}</td>
                  <td className="py-2 pr-3 break-all">{item.target}</td>
                  <td className="py-2 break-all text-muted">{item.actorId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {data.page > 1 ? <Link className="btn secondary" href={href(data.page - 1)}>Previous</Link> : <button className="btn secondary" type="button" disabled>Previous</button>}
        <p className="text-sm">Page {data.page} of {data.pageCount}</p>
        {data.page < data.pageCount ? <Link className="btn secondary" href={href(data.page + 1)}>Next</Link> : <button className="btn secondary" type="button" disabled>Next</button>}
      </div>
    </main>
  );
}
