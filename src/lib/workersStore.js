const STORAGE_KEY = "teeCoWorkers";

export const defaultWorkers = [
  {
    id: "worker-alex",
    name: "Alex",
    role: "Production",
    status: "Active",
    created_at: new Date().toISOString(),
  },
  {
    id: "worker-jordan",
    name: "Jordan",
    role: "Production",
    status: "Active",
    created_at: new Date().toISOString(),
  },
  {
    id: "worker-sam",
    name: "Sam",
    role: "Production",
    status: "Active",
    created_at: new Date().toISOString(),
  },
];

export function getStoredWorkers() {
  if (typeof window === "undefined") return defaultWorkers;

  try {
    const rawWorkers = window.localStorage.getItem(STORAGE_KEY);
    return rawWorkers ? JSON.parse(rawWorkers) : defaultWorkers;
  } catch (error) {
    console.error("Unable to read Tee & Co workers", error);
    return defaultWorkers;
  }
}

export function saveStoredWorkers(workers) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workers));
}

export function createStoredWorker(workerInput) {
  const workers = getStoredWorkers();
  const createdAt = new Date().toISOString();
  const worker = {
    id: `worker-${Date.now()}`,
    name: workerInput.name || "New Worker",
    role: workerInput.role || "Production",
    status: workerInput.status || "Active",
    created_at: createdAt,
    updated_at: createdAt,
  };

  const nextWorkers = [worker, ...workers];
  saveStoredWorkers(nextWorkers);
  return worker;
}

export function updateStoredWorker(workerId, updates) {
  const workers = getStoredWorkers();
  const nextWorkers = workers.map((worker) =>
    worker.id === workerId
      ? {
          ...worker,
          ...updates,
          updated_at: new Date().toISOString(),
        }
      : worker
  );

  saveStoredWorkers(nextWorkers);
  return nextWorkers.find((worker) => worker.id === workerId);
}

export function findStoredWorker(workerId) {
  return getStoredWorkers().find((worker) => worker.id === workerId);
}

export function deleteStoredWorker(workerId) {
  const nextWorkers = getStoredWorkers().filter((worker) => worker.id !== workerId);
  saveStoredWorkers(nextWorkers);
}
