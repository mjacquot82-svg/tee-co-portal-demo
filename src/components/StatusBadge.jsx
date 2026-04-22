export default function StatusBadge({ status }) {
  const styles = {
    Submitted: "bg-blue-100 text-blue-700",
    "Payment Requested": "bg-amber-100 text-amber-700",
    Paid: "bg-emerald-100 text-emerald-700",
    "In Production": "bg-purple-100 text-purple-700",
    "Ready for Pickup": "bg-sky-100 text-sky-700",
    Completed: "bg-slate-200 text-slate-700",
  };

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${styles[status] || "bg-slate-100 text-slate-700"}`}>
      {status}
    </span>
  );
}
