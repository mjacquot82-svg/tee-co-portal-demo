import { customerIdsEqual, normalizeCustomerId } from "./customerIds";

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return normalizeText(value).replace(/\D/g, "");
}

function normalizeEmail(value) {
  return normalizeText(value);
}

function normalizeName(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function buildNameTokens(value) {
  return normalizeName(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildBigrams(value) {
  const compactValue = normalizeName(value).replace(/\s+/g, "");
  if (compactValue.length < 2) {
    return new Set(compactValue ? [compactValue] : []);
  }

  const bigrams = new Set();
  for (let index = 0; index < compactValue.length - 1; index += 1) {
    bigrams.add(compactValue.slice(index, index + 2));
  }
  return bigrams;
}

function calculateDiceCoefficient(left, right) {
  const leftBigrams = buildBigrams(left);
  const rightBigrams = buildBigrams(right);

  if (!leftBigrams.size || !rightBigrams.size) {
    return 0;
  }

  let sharedCount = 0;
  leftBigrams.forEach((bigram) => {
    if (rightBigrams.has(bigram)) {
      sharedCount += 1;
    }
  });

  return (2 * sharedCount) / (leftBigrams.size + rightBigrams.size);
}

function calculateTokenOverlap(left, right) {
  const leftTokens = buildNameTokens(left);
  const rightTokens = buildNameTokens(right);

  if (!leftTokens.length || !rightTokens.length) {
    return 0;
  }

  const rightTokenSet = new Set(rightTokens);
  const sharedTokens = leftTokens.filter((token) => rightTokenSet.has(token)).length;

  return sharedTokens / Math.max(leftTokens.length, rightTokens.length);
}

export function calculateCustomerNameSimilarity(leftName, rightName) {
  const normalizedLeft = normalizeName(leftName);
  const normalizedRight = normalizeName(rightName);

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  const containsOther =
    normalizedLeft.length >= 5 &&
    normalizedRight.length >= 5 &&
    (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft));
  const tokenOverlap = calculateTokenOverlap(normalizedLeft, normalizedRight);
  const diceCoefficient = calculateDiceCoefficient(normalizedLeft, normalizedRight);

  return Math.max(
    containsOther ? 0.92 : 0,
    tokenOverlap,
    diceCoefficient
  );
}

function formatSimilarityPercent(score) {
  return `${Math.round(score * 100)}%`;
}

export function buildDuplicateSignals(leftCustomer, rightCustomer) {
  if (!leftCustomer || !rightCustomer) {
    return [];
  }

  if (customerIdsEqual(leftCustomer.id, rightCustomer.id)) {
    return [];
  }

  const signals = [];
  const leftEmail = normalizeEmail(leftCustomer.email);
  const rightEmail = normalizeEmail(rightCustomer.email);
  const leftPhone = normalizePhone(leftCustomer.phone);
  const rightPhone = normalizePhone(rightCustomer.phone);
  const nameSimilarity = calculateCustomerNameSimilarity(
    leftCustomer.name,
    rightCustomer.name
  );

  if (leftEmail && rightEmail && leftEmail === rightEmail) {
    signals.push({
      type: "email_match",
      label: "Same email",
      value: leftCustomer.email || rightCustomer.email,
      weight: 1,
    });
  }

  if (leftPhone && rightPhone && leftPhone === rightPhone) {
    signals.push({
      type: "phone_match",
      label: "Same phone",
      value: leftCustomer.phone || rightCustomer.phone,
      weight: 0.96,
    });
  }

  if (nameSimilarity >= 0.88) {
    signals.push({
      type: "name_similarity",
      label: `Name similarity ${formatSimilarityPercent(nameSimilarity)}`,
      value: `${leftCustomer.name || "Unnamed"} / ${rightCustomer.name || "Unnamed"}`,
      weight: nameSimilarity,
    });
  }

  return signals.sort((left, right) => right.weight - left.weight);
}

function buildPairKey(leftCustomerId, rightCustomerId) {
  return [normalizeCustomerId(leftCustomerId), normalizeCustomerId(rightCustomerId)]
    .filter(Boolean)
    .sort()
    .join("::");
}

function shouldSkipDuplicateDetection(customer) {
  return Boolean(customer?.merged_into_customer_id);
}

export function findPotentialDuplicateCustomerPairs(customers = []) {
  const pairs = [];

  for (let leftIndex = 0; leftIndex < customers.length; leftIndex += 1) {
    const leftCustomer = customers[leftIndex];
    if (!leftCustomer || shouldSkipDuplicateDetection(leftCustomer)) {
      continue;
    }

    for (let rightIndex = leftIndex + 1; rightIndex < customers.length; rightIndex += 1) {
      const rightCustomer = customers[rightIndex];
      if (!rightCustomer || shouldSkipDuplicateDetection(rightCustomer)) {
        continue;
      }

      const signals = buildDuplicateSignals(leftCustomer, rightCustomer);
      if (!signals.length) {
        continue;
      }

      pairs.push({
        id: buildPairKey(leftCustomer.id, rightCustomer.id),
        leftCustomer,
        rightCustomer,
        signals,
        score: signals[0]?.weight || 0,
      });
    }
  }

  return pairs.sort((left, right) => right.score - left.score);
}

export function buildPotentialDuplicateCustomerGroups(customers = []) {
  const pairs = findPotentialDuplicateCustomerPairs(customers);
  const parentById = new Map();

  function find(id) {
    const currentParent = parentById.get(id) || id;
    if (currentParent === id) {
      parentById.set(id, id);
      return id;
    }

    const root = find(currentParent);
    parentById.set(id, root);
    return root;
  }

  function union(leftId, rightId) {
    const leftRoot = find(leftId);
    const rightRoot = find(rightId);
    if (leftRoot !== rightRoot) {
      parentById.set(rightRoot, leftRoot);
    }
  }

  pairs.forEach((pair) => {
    union(pair.leftCustomer.id, pair.rightCustomer.id);
  });

  const groupsByRoot = new Map();
  pairs.forEach((pair) => {
    const rootId = find(pair.leftCustomer.id);
    const currentGroup = groupsByRoot.get(rootId) || {
      id: rootId,
      customersById: new Map(),
      pairs: [],
      score: 0,
    };

    currentGroup.customersById.set(pair.leftCustomer.id, pair.leftCustomer);
    currentGroup.customersById.set(pair.rightCustomer.id, pair.rightCustomer);
    currentGroup.pairs.push(pair);
    currentGroup.score = Math.max(currentGroup.score, pair.score);
    groupsByRoot.set(rootId, currentGroup);
  });

  return Array.from(groupsByRoot.values())
    .map((group) => ({
      id: group.id,
      customers: Array.from(group.customersById.values()).sort((left, right) =>
        String(left.name || "").localeCompare(String(right.name || ""))
      ),
      pairs: group.pairs.sort((left, right) => right.score - left.score),
      score: group.score,
      signals: Array.from(
        new Set(group.pairs.flatMap((pair) => pair.signals.map((signal) => signal.label)))
      ),
    }))
    .sort((left, right) => right.score - left.score);
}

export function findPotentialDuplicatesForCustomer(customerId, customers = []) {
  const normalizedCustomerId = normalizeCustomerId(customerId);
  if (!normalizedCustomerId) {
    return [];
  }

  return findPotentialDuplicateCustomerPairs(customers)
    .filter(
      (pair) =>
        customerIdsEqual(pair.leftCustomer.id, normalizedCustomerId) ||
        customerIdsEqual(pair.rightCustomer.id, normalizedCustomerId)
    )
    .map((pair) => ({
      ...pair,
      candidate: customerIdsEqual(pair.leftCustomer.id, normalizedCustomerId)
        ? pair.rightCustomer
        : pair.leftCustomer,
    }));
}
