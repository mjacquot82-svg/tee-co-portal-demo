const EXPECTED_TEE_CO_COLUMNS = [
  "Category",
  "Brand",
  "Supplier SKU",
  "Product Name",
  "Variant/Color",
];

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function buildRowError(rowNumber, message) {
  return `Row ${rowNumber}: ${message}`;
}

function parseCsv(text) {
  const rows = [];
  let currentRow = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        currentValue += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  if (inQuotes) {
    throw new Error("Invalid CSV: unmatched quote detected.");
  }

  if (currentValue || currentRow.length) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows;
}

function validateHeader(headerRow) {
  const sanitizedHeader = headerRow.map((value, index) =>
    index === 0 ? normalizeText(value).replace(/^\uFEFF/, "") : normalizeText(value)
  );

  EXPECTED_TEE_CO_COLUMNS.forEach((columnName) => {
    if (!sanitizedHeader.includes(columnName)) {
      throw new Error(`Missing required column: ${columnName}`);
    }
  });

  if (sanitizedHeader.length !== EXPECTED_TEE_CO_COLUMNS.length) {
    throw new Error(
      `Unexpected spreadsheet structure. Expected columns: ${EXPECTED_TEE_CO_COLUMNS.join(", ")}`
    );
  }

  const exactMatch = EXPECTED_TEE_CO_COLUMNS.every(
    (columnName, index) => sanitizedHeader[index] === columnName
  );

  if (!exactMatch) {
    throw new Error(
      `Unexpected spreadsheet structure. Expected columns: ${EXPECTED_TEE_CO_COLUMNS.join(", ")}`
    );
  }
}

export function parseTeeCoGarmentSpreadsheet(text) {
  const normalizedText = String(text || "");
  if (!normalizedText.trim()) {
    throw new Error("Spreadsheet is empty.");
  }

  const rows = parseCsv(normalizedText);
  if (!rows.length) {
    throw new Error("Spreadsheet is empty.");
  }

  validateHeader(rows[0]);

  const groupedGarments = new Map();

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const normalizedRow = Array.from({ length: EXPECTED_TEE_CO_COLUMNS.length }, (_, cellIndex) =>
      normalizeText(row[cellIndex])
    );

    if (!normalizedRow.some(Boolean)) {
      return;
    }

    const [category, brand, supplierSku, productName, variantName] = normalizedRow;

    if (!category) {
      throw new Error(buildRowError(rowNumber, "Category is required."));
    }

    if (!brand) {
      throw new Error(buildRowError(rowNumber, "Brand is required."));
    }

    if (!supplierSku) {
      throw new Error(buildRowError(rowNumber, "Supplier SKU is required."));
    }

    if (!productName) {
      throw new Error(buildRowError(rowNumber, "Product Name is required."));
    }

    if (!variantName) {
      throw new Error(buildRowError(rowNumber, "Variant/Color is required."));
    }

    const garmentKey = `${normalizeKey(brand)}::${normalizeKey(productName)}`;
    const existingGroup = groupedGarments.get(garmentKey);

    if (!existingGroup) {
      groupedGarments.set(garmentKey, {
        id: `import-${groupedGarments.size + 1}`,
        category,
        brand,
        productName,
        title: `${brand} ${productName}`,
        rowNumbers: [rowNumber],
        variants: [],
        variantMap: new Map(),
        duplicateRowCount: 0,
      });
    } else {
      existingGroup.rowNumbers.push(rowNumber);

      if (normalizeKey(existingGroup.category) !== normalizeKey(category)) {
        throw new Error(
          buildRowError(
            rowNumber,
            `Category does not match other rows for ${brand} ${productName}.`
          )
        );
      }
    }

    const group = groupedGarments.get(garmentKey);
    const variantKey = normalizeKey(variantName);
    const existingVariant = group.variantMap.get(variantKey);

    if (existingVariant) {
      if (normalizeKey(existingVariant.supplierSku) !== normalizeKey(supplierSku)) {
        throw new Error(
          buildRowError(
            rowNumber,
            `Variant/Color "${variantName}" has conflicting Supplier SKU values for ${group.title}.`
          )
        );
      }

      existingVariant.rowNumbers.push(rowNumber);
      group.duplicateRowCount += 1;
      return;
    }

    const variant = {
      name: variantName,
      supplierSku,
      rowNumbers: [rowNumber],
    };

    group.variantMap.set(variantKey, variant);
    group.variants.push(variant);
  });

  const garments = Array.from(groupedGarments.values())
    .map((group) => ({
      id: group.id,
      category: group.category,
      brand: group.brand,
      productName: group.productName,
      title: group.title,
      rowNumbers: group.rowNumbers,
      duplicateRowCount: group.duplicateRowCount,
      variants: group.variants.sort((left, right) => left.name.localeCompare(right.name)),
      variantCount: group.variants.length,
    }))
    .sort((left, right) => left.title.localeCompare(right.title));

  if (!garments.length) {
    throw new Error("Spreadsheet does not contain any garment rows.");
  }

  return {
    columns: EXPECTED_TEE_CO_COLUMNS,
    garments,
    garmentCount: garments.length,
    rowCount: garments.reduce((total, garment) => total + garment.rowNumbers.length, 0),
  };
}

