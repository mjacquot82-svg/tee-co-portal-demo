function getTaskDefinitions(processInstance = {}) {
  return Array.isArray(processInstance.templateSnapshot?.tasks)
    ? processInstance.templateSnapshot.tasks
    : [];
}

function getTaskName(taskDefinitionKey, taskDefinitions) {
  return (
    taskDefinitions.find((task) => task.key === taskDefinitionKey)?.name ||
    "Process task"
  );
}

function buildTaskProjection(taskInstance, taskDefinitions) {
  return {
    id: taskInstance.id,
    key: taskInstance.taskDefinitionKey,
    name: getTaskName(taskInstance.taskDefinitionKey, taskDefinitions),
    state: taskInstance.state,
  };
}

function buildHistoryLabel(event, taskInstances, taskDefinitions) {
  if (event.eventType === "process_created") return "Process Created";

  if (event.eventType === "task_available") {
    const taskInstance = taskInstances.find((task) => task.id === event.taskInstanceId);
    return `${getTaskName(taskInstance?.taskDefinitionKey, taskDefinitions)} Available`;
  }

  return "Process Updated";
}

export function buildProcessInstanceProjection(processInstance) {
  if (!processInstance) return null;

  const taskDefinitions = getTaskDefinitions(processInstance);
  const taskInstances = Array.isArray(processInstance.taskInstances)
    ? processInstance.taskInstances
    : [];
  const projectedTasks = taskInstances.map((task) =>
    buildTaskProjection(task, taskDefinitions)
  );
  const inProgressTask = projectedTasks.find((task) => task.state === "In Progress");
  const firstAvailableTask = projectedTasks.find((task) => task.state === "Available");

  return {
    processName: processInstance.templateSnapshot?.name || "Process",
    templateVersion: processInstance.templateVersion,
    processState: processInstance.state,
    primaryCurrentTask: inProgressTask || firstAvailableTask || null,
    availableTasks: projectedTasks.filter((task) => task.state === "Available"),
    blockedTasks: projectedTasks.filter((task) => task.state === "Blocked"),
    historySummary: (Array.isArray(processInstance.history) ? processInstance.history : []).map(
      (event) => ({
        id: event.id,
        label: buildHistoryLabel(event, taskInstances, taskDefinitions),
        createdAt: event.createdAt,
      })
    ),
  };
}
