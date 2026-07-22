import { Link } from "react-router-dom";

export default function AssignmentsSidebarLink({
  active = false,
  assignmentCount = 0,
}) {
  return (
    <Link
      to="/admin/orders?employee=unassigned"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
        textDecoration: "none",
        borderRadius: "12px",
        padding: "10px 11px",
        background: active ? "#292524" : "#ffffff",
        color: active ? "#ffffff" : "#292524",
        border: active ? "1px solid #292524" : "1px solid #f1f5f9",
        fontWeight: active ? 800 : 650,
        fontSize: "14px",
      }}
    >
      <span>Unassigned Production</span>

      {assignmentCount > 0 && (
        <span
          style={{
            minWidth: "22px",
            height: "22px",
            padding: "0 7px",
            borderRadius: "999px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: active ? "#ffffff" : "#fff7ed",
            color: active ? "#171717" : "#c2410c",
            border: active ? "none" : "1px solid #fed7aa",
            fontSize: "12px",
            fontWeight: 900,
          }}
        >
          {assignmentCount}
        </span>
      )}
    </Link>
  );
}
