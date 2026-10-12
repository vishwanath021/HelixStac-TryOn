import { BookingActions } from "@/components/admin/BookingActions";
import { parseJson } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import { pageTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const { tenant } = await pageTenant();
  const bookings = await prisma.booking.findMany({
    where: { tenantId: tenant.id },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  return (
    <main>
      <h1 className="page-title">Bookings</h1>
      <p className="mt-1 text-sm text-muted">Requests from logged-in guests. Confirming opens WhatsApp so you can send the note yourself. This is not a live calendar.</p>
      {bookings.length === 0 && <p className="card mt-4 p-4 text-sm">No booking requests yet.</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted">
              <th className="py-2">When</th>
              <th>Guest</th>
              <th>Look</th>
              <th>Preferred</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((booking) => {
              const services = parseJson<{ name: string }[]>(booking.services, []);
              return (
                <tr key={booking.id} className="border-t border-line align-top">
                  <td className="py-2">{booking.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td>{booking.customer.name || "Guest"}<br /><span className="text-xs text-muted">{booking.customer.phone}</span></td>
                  <td>{booking.lookName || "—"}<br /><span className="text-xs text-muted">{services.map((item) => item.name).join(", ")}</span></td>
                  <td>{booking.preferredAt}</td>
                  <td className="py-2"><BookingActions id={booking.id} status={booking.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
