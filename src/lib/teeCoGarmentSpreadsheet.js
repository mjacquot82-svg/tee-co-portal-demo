import Papa from "papaparse";
import { normalizeGarmentText, normalizeGarmentTextKey } from "./garmentTextNormalization";

const EXPECTED_TEE_CO_COLUMNS = [
  "Category",
  "Brand",
  "Supplier SKU",
  "Product Name",
  "Variant/Color",
];

const OPTIONAL_SIZE_COLUMNS = ["Sizes", "Size", "Available Sizes", "Size Run", "Available Sizes / Size Run"];
const COLOR_SUFFIX_TOKENS = new Set([
  "ash",
  "azalea",
  "beige",
  "black",
  "blue",
  "blush",
  "bronze",
  "brown",
  "camo",
  "camouflage",
  "cardinal",
  "charcoal",
  "chocolate",
  "coral",
  "cream",
  "crimson",
  "denim",
  "gold",
  "granite",
  "gray",
  "green",
  "grey",
  "heather",
  "ice",
  "jade",
  "khaki",
  "lavender",
  "lime",
  "maroon",
  "mint",
  "natural",
  "navy",
  "olive",
  "orange",
  "orchid",
  "peach",
  "pink",
  "purple",
  "red",
  "royal",
  "sand",
  "sapphire",
  "scarlet",
  "silver",
  "smoke",
  "stone",
  "tan",
  "teal",
  "turquoise",
  "violet",
  "white",
  "wine",
  "yellow",
]);

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return `[unstringifiable: ${error?.message || "unknown_error"}]`;
  }
}

function normalizeText(value) {
  return normalizeGarmentText(value);
}

function normalizeKey(value) {
  return normalizeGarmentTextKey(value);
}

function stripWrappingQuotes(value) {
  const rawValue = String(value ?? "");
  const trimmedValue = rawValue.trim();
  if (
    trimmedValue.length >= 2 &&
    ((trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
      (trimmedValue.startsWith("'") && trimmedValue.endsWith("'")))
  ) {
    return trimmedValue.slice(1, -1);
  }
  return rawValue;
}

function normalizeListBlock(value) {
  return stripWrappingQuotes(String(value ?? ""))
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u2028|\u2029/g, "\n");
}

function buildRowError(rowNumber, message) {
  return `Row ${rowNumber}: ${message}`;
}

function isRowEmpty(row = []) {
  return !row.some((value) => normalizeText(value));
}

function previewCsvWhitespace(value) {
  return String(value || "")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n\n");
}

function buildCsvContextSnippet(text, searchTerms = [], contextRadius = 180) {
  const normalizedText = String(text || "");
  const normalizedTerms = searchTerms
    .map((value) => normalizeText(value))
    .filter((value) => value.length >= 3);

  const anchor = normalizedTerms.find((value) => normalizedText.includes(value));
  const anchorIndex = anchor ? normalizedText.indexOf(anchor) : -1;
  const start = Math.max(0, anchorIndex >= 0 ? anchorIndex - contextRadius : 0);
  const end = Math.min(
    normalizedText.length,
    anchorIndex >= 0 ? anchorIndex + anchor.length + contextRadius : Math.min(normalizedText.length, contextRadius * 2)
  );
  const snippet = normalizedText.slice(start, end);

  return {
    anchor: anchor || null,
    start,
    end,
    rawSnippet: snippet,
    visibleSnippet: previewCsvWhitespace(snippet),
  };
}

function parseCsv(text) {
  const result = Papa.parse(String(text || ""), {
    skipEmptyLines: false,
  });

  const parseErrors = Array.isArray(result.errors) ? result.errors : [];
  if (parseErrors.length) {
    const firstError = parseErrors[0];
    const rowSuffix =
      typeof firstError?.row === "number" ? ` near parsed row ${firstError.row + 1}` : "";
    throw new Error(`Invalid CSV: ${firstError?.message || "unknown parse error"}${rowSuffix}.`);
  }

  const rows = Array.isArray(result.data) ? result.data : [];
  const maxFieldCount = rows.reduce(
    (largestCount, row) => Math.max(largestCount, Array.isArray(row) ? row.length : 0),
    0
  );

  return {
    rows,
    diagnostics: {
      parserName: "papaparse",
      delimiter: result.meta?.delimiter || ",",
      linebreak: result.meta?.linebreak || "unknown",
      aborted: result.meta?.aborted === true,
      rowCount: rows.length,
      maxFieldCount,
      parseErrorCount: parseErrors.length,
      fieldCountsByRow: rows.map((row, index) => ({
        rowNumber: index + 1,
        fieldCount: Array.isArray(row) ? row.length : 0,
      })),
    },
  };
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

function splitFlattenedColorSequence(value) {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue || /[\n,;|]/.test(String(value || ""))) {
    return [];
  }

  const tokens = normalizedValue.split(/\s+/).filter(Boolean);
  if (tokens.length < 4) {
    return [];
  }

  const parsedItems = [];
  let currentTokens = [];

  tokens.forEach((token, index) => {
    currentTokens.push(token);

    const normalizedToken = token.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const isKnownColorBoundary = COLOR_SUFFIX_TOKENS.has(normalizedToken);
    const isLastToken = index === tokens.length - 1;

    if (!isKnownColorBoundary && !isLastToken) {
      return;
    }

    parsedItems.push(normalizeText(currentTokens.join(" ")));
    currentTokens = [];
  });

  if (currentTokens.length) {
    parsedItems.push(normalizeText(currentTokens.join(" ")));
  }

  const filteredItems = parsedItems.filter(Boolean);
  if (
    filteredItems.length < 2 ||
    filteredItems.some((item) => item.split(/\s+/).filter(Boolean).length > 4)
  ) {
    return [];
  }

  return filteredItems;
}

function splitMultilineList(value, diagnosticsContext = {}) {
  const rawBlock = String(value ?? "");
  const normalizedBlock = normalizeListBlock(value);
  const hadTrailingNewline = /\r?\n\s*$/.test(rawBlock);
  const hadWrappingQuotes = rawBlock.trim() !== normalizedBlock.trim();
  const directLineItems = normalizedBlock
    .split(/\n+/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
  const delimiterFallbackItems = normalizedBlock
    .split(/[;,|]+/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
  const flattenedSequenceItems = splitFlattenedColorSequence(normalizedBlock);

  let items = directLineItems;
  let splitStrategy = "linebreak";

  if (items.length <= 1 && delimiterFallbackItems.length > 1) {
    items = delimiterFallbackItems;
    splitStrategy = "inline-delimiter";
  }

  if (items.length <= 1 && flattenedSequenceItems.length > 1) {
    items = flattenedSequenceItems;
    splitStrategy = "flattened-color-sequence";
  }

  console.info("[teeCoGarmentSpreadsheet] splitMultilineList diagnostics", {
    ...diagnosticsContext,
    rawBlockBeforeSplit: rawBlock,
    rawBlockVisible: previewCsvWhitespace(rawBlock),
    delimiterNormalization: {
      hadWrappingQuotes,
      containsLf: rawBlock.includes("\n"),
      containsCr: rawBlock.includes("\r"),
      containsCrLf: rawBlock.includes("\r\n"),
      normalizedLineCount: normalizedBlock ? normalizedBlock.split("\n").length : 0,
      normalizedBlockVisible: previewCsvWhitespace(normalizedBlock),
    },
    trailingNewlineHandling: {
      hadTrailingNewline,
      endsWithBlankLineAfterNormalization: /\n\s*$/.test(normalizedBlock),
    },
    quotedCsvEdgeCase: {
      startsWithQuote: rawBlock.trim().startsWith('"') || rawBlock.trim().startsWith("'"),
      endsWithQuote: rawBlock.trim().endsWith('"') || rawBlock.trim().endsWith("'"),
    },
    directLineItems,
    delimiterFallbackItems,
    flattenedSequenceItems,
    splitStrategy,
    parsedEntryCount: items.length,
    finalParsedVariantEntry: items.length ? items[items.length - 1] : null,
  });

  return items;
}

function splitCommaList(value) {
  return normalizeListBlock(value)
    .split(/[\n,;|]+/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function summarizeVariantForDebug(variant = {}) {
  if (!variant || typeof variant !== "object") {
    return {
      variantType: typeof variant,
      variant,
    };
  }

  return {
    name: variant.name || null,
    color: variant.color || null,
    colors: Array.isArray(variant.colors) ? variant.colors : variant.colors || null,
    size: variant.size || null,
    sizes: Array.isArray(variant.sizes) ? variant.sizes : variant.sizes || null,
    supplier_variant: variant.supplier_variant || variant.supplierVariant || null,
    supplier_sku: variant.supplier_sku || variant.supplierSku || variant.sku || null,
    rowNumbers: Array.isArray(variant.rowNumbers) ? variant.rowNumbers : [],
    keys: Object.keys(variant),
  };
}

function detectMalformedOrphanRow(row, requiredColumnIndexes, expectedFieldCount) {
  const category = normalizeText(row[requiredColumnIndexes.get("Category")]);
  const brand = normalizeText(row[requiredColumnIndexes.get("Brand")]);
  const supplierSku = normalizeText(row[requiredColumnIndexes.get("Supplier SKU")]);
  const productName = normalizeText(row[requiredColumnIndexes.get("Product Name")]);
  const variantName = normalizeText(row[requiredColumnIndexes.get("Variant/Color")]);
  const nonEmptyValues = row.map((value) => normalizeText(value)).filter(Boolean);
  const missingLeadingRequiredColumn = !category || !brand || !supplierSku || !productName;
  const fieldCountMismatch = row.length !== expectedFieldCount;
  const likelyOrphanedFragment =
    nonEmptyValues.length > 0 && missingLeadingRequiredColumn && (fieldCountMismatch || nonEmptyValues.length <= 2);

  return {
    fieldCount: row.length,
    expectedFieldCount,
    fieldCountMismatch,
    missingLeadingRequiredColumn,
    likelyOrphanedFragment,
    category,
    brand,
    supplierSku,
    productName,
    variantName,
    nonEmptyValues,
  };
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

  const { rows, diagnostics: csvDiagnostics } = parseCsv(normalizedText);
  if (!rows.length) {
    throw new Error("Spreadsheet is empty.");
  }

  console.info("[teeCoGarmentSpreadsheet] csv parse diagnostics", {
    source: "spreadsheet_import",
    parserName: csvDiagnostics.parserName,
    delimiter: csvDiagnostics.delimiter,
    linebreak: csvDiagnostics.linebreak,
    parsedRowCount: csvDiagnostics.rowCount,
    maxFieldCount: csvDiagnostics.maxFieldCount,
    parseErrorCount: csvDiagnostics.parseErrorCount,
    fieldCountsByRow: csvDiagnostics.fieldCountsByRow,
  });

  const { requiredColumnIndexes, optionalColumnIndexes } = validateHeader(rows[0]);
  const headerRow = rows[0].map((value, index) =>
    index === 0 ? normalizeText(value).replace(/^\uFEFF/, "") : normalizeText(value)
  );
  const expectedFieldCount = headerRow.length;

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

    const rowDiagnostics = detectMalformedOrphanRow(row, requiredColumnIndexes, expectedFieldCount);
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
    const parsedColors = Array.from(
      new Set(
        splitMultilineList(rawVariantCell, {
          rowNumber,
          supplierSku,
          productName,
          normalizedVariantCell: variantName,
        })
      )
    );
    const parsedSizes = Array.from(new Set(splitCommaList(rawSizesCell)));
    const csvContextSnippet = buildCsvContextSnippet(normalizedText, [
      supplierSku,
      productName,
      variantName,
      rawVariantCell,
    ]);

    console.info("[teeCoGarmentSpreadsheet] raw spreadsheet row", {
      rowNumber,
      fieldCount: rowDiagnostics.fieldCount,
      expectedFieldCount: rowDiagnostics.expectedFieldCount,
      fieldCountMismatch: rowDiagnostics.fieldCountMismatch,
      likelyOrphanedFragment: rowDiagnostics.likelyOrphanedFragment,
      missingLeadingRequiredColumn: rowDiagnostics.missingLeadingRequiredColumn,
      nonEmptyValues: rowDiagnostics.nonEmptyValues,
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
      finalParsedVariantEntry: parsedColors.length ? parsedColors[parsedColors.length - 1] : null,
      rawCsvContextAnchor: csvContextSnippet.anchor,
      rawCsvContextOffsets: {
        start: csvContextSnippet.start,
        end: csvContextSnippet.end,
      },
      rawCsvContextSnippet: csvContextSnippet.rawSnippet,
      rawCsvContextVisibleSnippet: csvContextSnippet.visibleSnippet,
    });

    if (rowDiagnostics.likelyOrphanedFragment) {
      console.warn("[teeCoGarmentSpreadsheet] detected likely orphaned row fragment", {
        rowNumber,
        fieldCount: rowDiagnostics.fieldCount,
        expectedFieldCount: rowDiagnostics.expectedFieldCount,
        nonEmptyValues: rowDiagnostics.nonEmptyValues,
        rawRow: row,
        rawCsvContextVisibleSnippet: csvContextSnippet.visibleSnippet,
      });
    }

    if (!category) {
      console.warn("[teeCoGarmentSpreadsheet] validation failure", {
        rowNumber,
        rejectionReason: "missing-category",
        rawRowObject,
        rawRow: row,
      });
      skippedMalformedRowCount += 1;
      warnings.push(buildRowError(rowNumber, "Skipped row because Category is required."));
      return;
    }

    if (!brand) {
      console.warn("[teeCoGarmentSpreadsheet] validation failure", {
        rowNumber,
        rejectionReason: "missing-brand",
        rawRowObject,
        rawRow: row,
      });
      skippedMalformedRowCount += 1;
      warnings.push(buildRowError(rowNumber, "Skipped row because Brand is required."));
      return;
    }

    if (!supplierSku) {
      console.warn("[teeCoGarmentSpreadsheet] validation failure", {
        rowNumber,
        rejectionReason: "missing-supplier-sku",
        rawRowObject,
        rawRow: row,
      });
      skippedMalformedRowCount += 1;
      warnings.push(buildRowError(rowNumber, "Skipped row because Supplier SKU is required."));
      return;
    }

    if (!productName) {
      console.warn("[teeCoGarmentSpreadsheet] validation failure", {
        rowNumber,
        rejectionReason: "missing-product-name",
        rawRowObject,
        rawRow: row,
      });
      skippedMalformedRowCount += 1;
      warnings.push(buildRowError(rowNumber, "Skipped row because Product Name is required."));
      return;
    }

    if (!variantName) {
      console.warn("[teeCoGarmentSpreadsheet] validation failure", {
        rowNumber,
        rejectionReason: "missing-variant-color",
        rawRowObject,
        rawRow: row,
      });
      skippedMalformedRowCount += 1;
      warnings.push(buildRowError(rowNumber, "Skipped row because Variant/Color is required."));
      return;
    }

    if (!parsedColors.length) {
      console.warn("[teeCoGarmentSpreadsheet] validation failure", {
        rowNumber,
        rejectionReason: "no-parsed-colors",
        rawVariantCell,
        normalizedVariantCell: variantName,
        rawRowObject,
        rawRow: row,
      });
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
      finalParsedVariantEntry: parsedColors.length ? parsedColors[parsedColors.length - 1] : null,
      groupedVariantSourceMode: parsedColors.length > 1 ? "single_row_multi_color_cell" : "one_color_per_row",
      multilineVariantCellSurvivedParsing:
        typeof rawVariantCell === "string" && rawVariantCell.includes("\n") && parsedColors.length > 1,
      multilineSizesCellSurvivedParsing:
        typeof rawSizesCell === "string" && rawSizesCell.includes("\n") && parsedSizes.length > 1,
      parsedVariantArrayBeforeNormalization: parsedColors.map((parsedColor) => ({
        name: parsedColor,
        color: parsedColor,
        colors: [parsedColor],
        size: parsedSizes[0] || "",
        sizes: parsedSizes,
        supplier_variant: parsedColor,
        supplierSku,
        supplier_sku: supplierSku,
      })),
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
      finalPersistedVariantStructure: group.variants.map((variant) => summarizeVariantForDebug(variant)),
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
    parserMode: "papaparse_multiline_quoted_csv",
    csvParser: csvDiagnostics.parserName,
    csvDelimiter: csvDiagnostics.delimiter,
    csvLinebreak: csvDiagnostics.linebreak,
    parsedCsvRowCount: csvDiagnostics.rowCount,
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
