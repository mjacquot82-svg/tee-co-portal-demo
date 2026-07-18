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

function getTaskDependencies(processInstance = {}) {
  return Array.isArray(processInstance.templateSnapshot?.dependencies)
    ? processInstance.templateSnapshot.dependencies
    : [];
}

function buildAvailabilityReason(task, dependencies, taskDefinitions, taskInstances) {
  const prerequisites = dependencies.filter(
    (dependency) => dependency.dependentTaskKey === task.key
  );
  if (!prerequisites.length) {
    return "This task is available because it has no incomplete prerequisites.";
  }

  const incompleteNames = prerequisites
    .filter((dependency) => {
      const prerequisite = taskInstances.find(
        (instance) => instance.taskDefinitionKey === dependency.prerequisiteTaskKey
      );
      return prerequisite?.state !== "Completed";
    })
    .map((dependency) => getTaskName(dependency.prerequisiteTaskKey, taskDefinitions));

  return incompleteNames.length
    ? `Waiting for ${incompleteNames.join(", ")}.`
    : "All prerequisites are complete.";
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
  const dependencies = getTaskDependencies(processInstance);
  const tasksWithReasons = projectedTasks.map((task) => ({
    ...task,
    reason: buildAvailabilityReason(task, dependencies, taskDefinitions, taskInstances),
  }));
  const inProgressTask = tasksWithReasons.find((task) => task.state === "In Progress");
  const firstAvailableTask = tasksWithReasons.find((task) => task.state === "Available");
  const completedTasks = tasksWithReasons.filter((task) => task.state === "Completed");
  const blockedTasks = tasksWithReasons.filter((task) => task.state === "Blocked");

  return {
    processName: processInstance.templateSnapshot?.name || "Process",
    templateVersion: processInstance.templateVersion,
    processState: processInstance.state,
    primaryCurrentTask: inProgressTask || firstAvailableTask || null,
    availableTasks: tasksWithReasons.filter((task) => task.state === "Available"),
    upcomingTasks: blockedTasks.slice(0, 1),
    blockedTasks,
    completedTasks,
    progress: {
      completed: completedTasks.length,
      total: tasksWithReasons.length,
    },
    historySummary: (Array.isArray(processInstance.history) ? processInstance.history : []).map(
      (event) => ({
        id: event.id,
        label: buildHistoryLabel(event, taskInstances, taskDefinitions),
        createdAt: event.createdAt,
      })
    ),
  };
}
