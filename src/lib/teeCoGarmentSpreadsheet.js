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

function isRowEmpty(row = []) {
  return !row.some((value) => normalizeText(value));
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

  if (sanitizedHeader.length < EXPECTED_TEE_CO_COLUMNS.length) {
    const missingColumn = EXPECTED_TEE_CO_COLUMNS[sanitizedHeader.length];
    throw new Error(`Missing required column: ${missingColumn}`);
  }

  const requiredColumnIndexes = new Map();

  EXPECTED_TEE_CO_COLUMNS.forEach((columnName, index) => {
    const headerValue = sanitizedHeader[index];

    if (headerValue !== columnName) {
      if (!headerValue) {
        throw new Error(`Missing required column: ${columnName}`);
      }

      throw new Error(`Missing required column: ${columnName}`);
    }

    requiredColumnIndexes.set(columnName, index);
  });

  return requiredColumnIndexes;
}

export function parseTeeCoGarmentSpreadsheet(text) {
  const normalizedText = String(text || "");
  if (!normalizedText.trim()) {
    throw new Error("Spreadsheet is empty.");
  }

  console.info("[teeCoGarmentSpreadsheet] parse start", {
    source: "spreadsheet_import",
    characterCount: normalizedText.length,
  });

  const rows = parseCsv(normalizedText);
  if (!rows.length) {
    throw new Error("Spreadsheet is empty.");
  }

  const requiredColumnIndexes = validateHeader(rows[0]);

  const groupedGarments = new Map();
  const warnings = [];
  let skippedEmptyRowCount = 0;
  let skippedMalformedRowCount = 0;
  let validRowCount = 0;

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    if (isRowEmpty(row)) {
      skippedEmptyRowCount += 1;
      return;
    }

    const normalizedRow = EXPECTED_TEE_CO_COLUMNS.map((columnName) =>
      normalizeText(row[requiredColumnIndexes.get(columnName)])
    );

    if (!normalizedRow.some(Boolean)) {
      skippedEmptyRowCount += 1;
      return;
    }

    const [category, brand, supplierSku, productName, variantName] = normalizedRow;

    if (!category) {
      skippedMalformedRowCount += 1;
      warnings.push(buildRowError(rowNumber, "Skipped row because Category is required."));
      return;
    }

    if (!brand) {
      skippedMalformedRowCount += 1;
      warnings.push(buildRowError(rowNumber, "Skipped row because Brand is required."));
      return;
    }

    if (!supplierSku) {
      skippedMalformedRowCount += 1;
      warnings.push(buildRowError(rowNumber, "Skipped row because Supplier SKU is required."));
      return;
    }

    if (!productName) {
      skippedMalformedRowCount += 1;
      warnings.push(buildRowError(rowNumber, "Skipped row because Product Name is required."));
      return;
    }

    if (!variantName) {
      skippedMalformedRowCount += 1;
      warnings.push(buildRowError(rowNumber, "Skipped row because Variant/Color is required."));
      return;
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
        skippedMalformedRowCount += 1;
        warnings.push(
          buildRowError(rowNumber, `Skipped row because Category does not match other rows for ${brand} ${productName}.`)
        );
        existingGroup.rowNumbers = existingGroup.rowNumbers.filter((value) => value !== rowNumber);
        return;
      }
    }

    const group = groupedGarments.get(garmentKey);
    const variantKey = normalizeKey(variantName);
    const existingVariant = group.variantMap.get(variantKey);

    if (existingVariant) {
      if (normalizeKey(existingVariant.supplierSku) !== normalizeKey(supplierSku)) {
        skippedMalformedRowCount += 1;
        warnings.push(
          buildRowError(
            rowNumber,
            `Skipped row because Variant/Color "${variantName}" has conflicting Supplier SKU values for ${group.title}.`
          )
        );
        group.rowNumbers = group.rowNumbers.filter((value) => value !== rowNumber);
        return;
      }

      existingVariant.rowNumbers.push(rowNumber);
      group.duplicateRowCount += 1;
      validRowCount += 1;
      return;
    }

    const variant = {
      name: variantName,
      color: variantName,
      supplier_variant: variantName,
      supplierSku,
      rowNumbers: [rowNumber],
    };

    group.variantMap.set(variantKey, variant);
    group.variants.push(variant);
    validRowCount += 1;
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
    if (warnings.length) {
      throw new Error(`Spreadsheet does not contain any valid garment rows. ${warnings[0]}`);
    }

    throw new Error("Spreadsheet does not contain any garment rows.");
  }

  const parsedResult = {
    columns: EXPECTED_TEE_CO_COLUMNS,
    garments,
    garmentCount: garments.length,
    rowCount: garments.reduce((total, garment) => total + garment.rowNumbers.length, 0),
    validRowCount,
    skippedEmptyRowCount,
    skippedMalformedRowCount,
    warningCount: warnings.length,
    warnings,
  };

  console.info("[teeCoGarmentSpreadsheet] parse success", {
    source: "spreadsheet_import",
    garmentCount: parsedResult.garmentCount,
    rowCount: parsedResult.rowCount,
    validRowCount: parsedResult.validRowCount,
    warningCount: parsedResult.warningCount,
    skippedEmptyRowCount: parsedResult.skippedEmptyRowCount,
    skippedMalformedRowCount: parsedResult.skippedMalformedRowCount,
  });

  return parsedResult;
}
