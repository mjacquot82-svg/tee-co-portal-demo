import { createProcessInstanceFromTemplate } from "./processDefinition";
import {
  createProcessInstance as persistProcessInstance,
  findProcessInstance,
} from "./processRepository";

let repositoryOverrides = null;

function getRepository() {
  return {
    find: repositoryOverrides?.find || findProcessInstance,
    create: repositoryOverrides?.create || persistProcessInstance,
  };
}

export async function ensureProcessInstance({ template, applicationKey, subjectType, subjectId }) {
  const identity = {
    applicationKey,
    subjectType,
    subjectId,
    templateKey: template.key,
  };
  const repository = getRepository();
  const existing = await repository.find(identity);
  if (existing) {
    return { created: false, processInstance: existing };
  }

  const processInstance = createProcessInstanceFromTemplate({
    template,
    applicationKey,
    subjectType,
    subjectId,
  });
  const persisted = await repository.create(processInstance);
  return {
    created: persisted.id === processInstance.id,
    processInstance: persisted,
  };
}

export function configureProcessStoreForTests(overrides = null) {
  repositoryOverrides = overrides;
}
