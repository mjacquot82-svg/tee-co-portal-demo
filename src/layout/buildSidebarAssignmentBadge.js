
export function buildSidebarAssignmentBadge(count = 0) {
  return {
    visible: Number(count) > 0,
    count: Number(count || 0),
    label:
      Number(count || 0) === 1
        ? "1 order waiting"
        : `${Number(count || 0)} orders waiting`,
  };
}
2