const EXPECTED_TEE_CO_COLUMNS = [
  "Category",
  "Brand",
  "Supplier SKU",
  "Product Name",
  "Variant/Color",
];

const OPTIONAL_SIZE_COLUMNS = ["Sizes", "Size", "Available Sizes", "Size Run", "Available Sizes / Size Run"];

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return `[unstringifiable: ${error?.message || "unknown_error"}]`;
  }
}

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
  const optionalColumnIndexes = new Map();

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

  OPTIONAL_SIZE_COLUMNS.forEach((columnName) => {
    const columnIndex = sanitizedHeader.findIndex((value) => value === columnName);
    if (columnIndex >= 0) {
      optionalColumnIndexes.set("Sizes", columnIndex);
    }
  });

  return {
    requiredColumnIndexes,
    optionalColumnIndexes,
  };
}

function splitMultilineList(value) {
  return String(value || "")
    .split(/\r?\n+/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function splitCommaList(value) {
  return String(value || "")
    .split(/[\r?\n,;|]+/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function stripRepeatedBrandPrefix(productName, brand) {
  let normalizedProductName = normalizeText(productName);
  const normalizedBrand = normalizeText(brand);
  const normalizedBrandKey = normalizeKey(normalizedBrand);

  if (!normalizedProductName || !normalizedBrandKey) {
    return normalizedProductName;
  }

  while (normalizeKey(normalizedProductName).startsWith(`${normalizedBrandKey} ${normalizedBrandKey} `)) {
    normalizedProductName = normalizeText(normalizedProductName.slice(normalizedBrand.length).trim());
  }

  return normalizedProductName;
}

function buildGarmentTitle(brand, productName) {
  const normalizedBrand = normalizeText(brand);
  const normalizedProductName = stripRepeatedBrandPrefix(productName, brand);
  const normalizedBrandKey = normalizeKey(normalizedBrand);
  const normalizedProductNameKey = normalizeKey(normalizedProductName);

  if (!normalizedBrand || !normalizedProductName) {
    return normalizedProductName || normalizedBrand;
  }

  if (
    normalizedProductNameKey === normalizedBrandKey ||
    normalizedProductNameKey.startsWith(`${normalizedBrandKey} `)
  ) {
    return normalizedProductName;
  }

  return `${normalizedBrand} ${normalizedProductName}`;
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

  const { requiredColumnIndexes, optionalColumnIndexes } = validateHeader(rows[0]);
  const headerRow = rows[0].map((value, index) =>
    index === 0 ? normalizeText(value).replace(/^\uFEFF/, "") : normalizeText(value)
  );

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

    const rawVariantCell = row[requiredColumnIndexes.get("Variant/Color")];
    const rawSizesCell = row[optionalColumnIndexes.get("Sizes")];
    const rawRowObject = headerRow.reduce((accumulator, headerName, columnIndex) => {
      accumulator[headerName || `column_${columnIndex + 1}`] = row[columnIndex];
      return accumulator;
    }, {});
    const normalizedRow = EXPECTED_TEE_CO_COLUMNS.map((columnName) =>
      normalizeText(row[requiredColumnIndexes.get(columnName)])
    );
    const sizesCell = normalizeText(rawSizesCell);

    if (!normalizedRow.some(Boolean)) {
      skippedEmptyRowCount += 1;
      return;
    }

    const [category, brand, supplierSku, productName, variantName] = normalizedRow;
    const normalizedProductName = stripRepeatedBrandPrefix(productName, brand);
    const parsedColors = Array.from(new Set(splitMultilineList(variantName)));
    const parsedSizes = Array.from(new Set(splitCommaList(sizesCell)));

    console.info("[teeCoGarmentSpreadsheet] raw spreadsheet row", {
      rowNumber,
      rawRowObject,
      rawRow: row,
      rawVariantCell,
      rawVariantCellType: typeof rawVariantCell,
      rawVariantCellIsArray: Array.isArray(rawVariantCell),
      rawVariantCellContainsLf:
        typeof rawVariantCell === "string" ? rawVariantCell.includes("\n") : false,
      rawVariantCellContainsCrLf:
        typeof rawVariantCell === "string" ? rawVariantCell.includes("\r\n") : false,
      rawVariantCellContainsCr:
        typeof rawVariantCell === "string" ? rawVariantCell.includes("\r") : false,
      rawSizesCell,
      rawSizesCellType: typeof rawSizesCell,
      rawSizesCellIsArray: Array.isArray(rawSizesCell),
      rawSizesCellContainsLf:
        typeof rawSizesCell === "string" ? rawSizesCell.includes("\n") : false,
      rawSizesCellContainsCrLf:
        typeof rawSizesCell === "string" ? rawSizesCell.includes("\r\n") : false,
      rawRowObjectJson: safeStringify(rawRowObject),
      normalizedRow,
      normalizedVariantCell: variantName,
      normalizedSizesCell: sizesCell,
    });

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

    if (!parsedColors.length) {
      skippedMalformedRowCount += 1;
      warnings.push(buildRowError(rowNumber, "Skipped row because Variant/Color did not produce any parsed colors."));
      return;
    }

    console.info("[teeCoGarmentSpreadsheet] parsed row details", {
      rowNumber,
      brand,
      productName,
      supplierSku,
      rawVariantCell,
      rawSizesCell,
      normalizedVariantCell: variantName,
      normalizedSizesCell: sizesCell,
      parsedColors,
      parsedSizes,
      groupedVariantSourceMode: parsedColors.length > 1 ? "single_row_multi_color_cell" : "one_color_per_row",
    });

    const garmentKey = `${normalizeKey(brand)}::${normalizeKey(normalizedProductName)}`;
    const existingGroup = groupedGarments.get(garmentKey);

    if (!existingGroup) {
      groupedGarments.set(garmentKey, {
        id: `import-${groupedGarments.size + 1}`,
        category,
        brand,
        productName: normalizedProductName,
        title: buildGarmentTitle(brand, normalizedProductName),
        rowNumbers: [rowNumber],
        sizes: [],
        variants: [],
        variantMap: new Map(),
        duplicateRowCount: 0,
      });
    } else {
      existingGroup.rowNumbers.push(rowNumber);

      if (normalizeKey(existingGroup.category) !== normalizeKey(category)) {
        skippedMalformedRowCount += 1;
        warnings.push(
          buildRowError(
            rowNumber,
            `Skipped row because Category does not match other rows for ${brand} ${normalizedProductName}.`
          )
        );
        existingGroup.rowNumbers = existingGroup.rowNumbers.filter((value) => value !== rowNumber);
        return;
      }
    }

    const group = groupedGarments.get(garmentKey);
    group.sizes = Array.from(new Set([...group.sizes, ...parsedSizes]));

    parsedColors.forEach((parsedColor) => {
      const variantKey = normalizeKey(parsedColor);
      const existingVariant = group.variantMap.get(variantKey);

      if (existingVariant) {
        if (normalizeKey(existingVariant.supplierSku) !== normalizeKey(supplierSku)) {
          skippedMalformedRowCount += 1;
          warnings.push(
            buildRowError(
              rowNumber,
              `Skipped row because Variant/Color "${parsedColor}" has conflicting Supplier SKU values for ${group.title}.`
            )
          );
          return;
        }

        existingVariant.rowNumbers = Array.from(new Set([...existingVariant.rowNumbers, rowNumber]));
        existingVariant.sizes = Array.from(new Set([...(existingVariant.sizes || []), ...parsedSizes]));
        existingVariant.size = existingVariant.sizes[0] || "";
        group.duplicateRowCount += 1;
        return;
      }

      const variant = {
        name: parsedColor,
        color: parsedColor,
        colors: [parsedColor],
        size: parsedSizes[0] || "",
        sizes: parsedSizes,
        supplier_variant: parsedColor,
        supplierSku,
        supplier_sku: supplierSku,
        rowNumbers: [rowNumber],
      };

      group.variantMap.set(variantKey, variant);
      group.variants.push(variant);
    });

    console.info("[teeCoGarmentSpreadsheet] generated garment variants", {
      rowNumber,
      garmentKey,
      title: group.title,
      parsedColorCount: parsedColors.length,
      parsedSizeCount: parsedSizes.length,
      generatedVariantCount: group.variants.length,
      parsedColors,
      parsedSizes,
      groupSnapshotJson: safeStringify({
        title: group.title,
        sizes: group.sizes,
        variants: group.variants,
      }),
    });

    validRowCount += 1;
  });

  const garments = Array.from(groupedGarments.values())
    .map((group) => ({
      ...group,
      constSortedSizes: group.sizes.sort((left, right) => left.localeCompare(right)),
    }))
    .map((group) => ({
      id: group.id,
      category: group.category,
      brand: group.brand,
      productName: group.productName,
      title: group.title,
      rowNumbers: group.rowNumbers,
      duplicateRowCount: group.duplicateRowCount,
      sizes: group.constSortedSizes,
      variants: group.variants
        .map((variant) => {
          const sortedVariantSizes = Array.from(new Set(variant.sizes || [])).sort((left, right) =>
            left.localeCompare(right)
          );
          return {
            ...variant,
            sizes: sortedVariantSizes,
            size: sortedVariantSizes[0] || "",
          };
        })
        .sort((left, right) => left.name.localeCompare(right.name)),
      variantCount: group.variants.length,
      sizeCount: group.constSortedSizes.length,
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
    parserMode: "csv_text_only",
    garmentCount: parsedResult.garmentCount,
    rowCount: parsedResult.rowCount,
    validRowCount: parsedResult.validRowCount,
    warningCount: parsedResult.warningCount,
    skippedEmptyRowCount: parsedResult.skippedEmptyRowCount,
    skippedMalformedRowCount: parsedResult.skippedMalformedRowCount,
    garments,
  });

  return parsedResult;
}
