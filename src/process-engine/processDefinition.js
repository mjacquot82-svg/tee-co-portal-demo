const PUBLISHED_TEMPLATE_STATUS = "published";

function normalizeText(value) {
  return String(value || "").trim();
}

function createId(prefix = "process") {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function validateProcessTemplate(template = {}) {
  const templateKey = normalizeText(template.key);
  const version = template.currentVersion;
  const tasks = Array.isArray(version?.tasks) ? version.tasks : [];
  const dependencies = Array.isArray(version?.dependencies) ? version.dependencies : [];
  const taskKeys = tasks.map((task) => normalizeText(task.key));
  const uniqueTaskKeys = new Set(taskKeys);

  if (!templateKey) throw new Error("Process template key is required.");
  if (!Number.isInteger(version?.version) || version.version < 1) {
    throw new Error("Published process template version must be a positive integer.");
  }
  if (version.status !== PUBLISHED_TEMPLATE_STATUS) {
    throw new Error("Process instances require a published template version.");
  }
  if (!tasks.length) throw new Error("Process template version requires at least one task.");
  if (taskKeys.some((key) => !key) || uniqueTaskKeys.size !== taskKeys.length) {
    throw new Error("Process task keys must be present and unique.");
  }

  dependencies.forEach((dependency) => {
    const prerequisiteKey = normalizeText(dependency.prerequisiteTaskKey);
    const dependentKey = normalizeText(dependency.dependentTaskKey);
    if (!uniqueTaskKeys.has(prerequisiteKey) || !uniqueTaskKeys.has(dependentKey)) {
      throw new Error("Process task dependency references an unknown task.");
    }
    if (prerequisiteKey === dependentKey) {
      throw new Error("Process task cannot depend on itself.");
    }
  });

  const visiting = new Set();
  const visited = new Set();
  const prerequisitesByTask = new Map(taskKeys.map((key) => [key, []]));
  dependencies.forEach((dependency) => {
    prerequisitesByTask.get(dependency.dependentTaskKey).push(dependency.prerequisiteTaskKey);
  });

  function visit(taskKey) {
    if (visiting.has(taskKey)) throw new Error("Process task dependencies cannot contain a cycle.");
    if (visited.has(taskKey)) return;
    visiting.add(taskKey);
    prerequisitesByTask.get(taskKey).forEach(visit);
    visiting.delete(taskKey);
    visited.add(taskKey);
  }

  taskKeys.forEach(visit);
  return template;
}

export function createProcessInstanceFromTemplate({
  template,
  applicationKey,
  subjectType,
  subjectId,
  now = new Date().toISOString(),
  createIdentifier = createId,
} = {}) {
  validateProcessTemplate(template);

  const normalizedApplicationKey = normalizeText(applicationKey);
  const normalizedSubjectType = normalizeText(subjectType);
  const normalizedSubjectId = normalizeText(subjectId);
  if (!normalizedApplicationKey || !normalizedSubjectType || !normalizedSubjectId) {
    throw new Error("Process application and subject identity are required.");
  }

  const version = template.currentVersion;
  const dependentTaskKeys = new Set(
    version.dependencies.map((dependency) => dependency.dependentTaskKey)
  );
  const taskInstances = version.tasks.map((task) => ({
    id: createIdentifier("task"),
    taskDefinitionKey: task.key,
    state: dependentTaskKeys.has(task.key) ? "Blocked" : "Available",
    startedAt: null,
    completedAt: null,
    completedBy: "",
    completionNote: "",
  }));
  const availableTasks = taskInstances.filter((task) => task.state === "Available");
  const processInstanceId = createIdentifier("process");

  return {
    id: processInstanceId,
    applicationKey: normalizedApplicationKey,
    subjectType: normalizedSubjectType,
    subjectId: normalizedSubjectId,
    templateKey: template.key,
    templateVersion: version.version,
    state: "Active",
    templateSnapshot: {
      key: template.key,
      name: template.name,
      version: version.version,
      tasks: version.tasks,
      dependencies: version.dependencies,
    },
    taskInstances,
    history: [
      {
        id: createIdentifier("history"),
        eventType: "process_created",
        processInstanceId,
        taskInstanceId: null,
        summary: `Process created from ${template.key} version ${version.version}.`,
        actorId: "system",
        createdAt: now,
      },
      ...availableTasks.map((task) => ({
        id: createIdentifier("history"),
        eventType: "task_available",
        processInstanceId,
        taskInstanceId: task.id,
        summary: `${task.taskDefinitionKey} became available.`,
        actorId: "system",
        createdAt: now,
      })),
    ],
    createdAt: now,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    updatedAt: now,
  };
}
