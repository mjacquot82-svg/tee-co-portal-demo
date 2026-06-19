import { getActiveStaffUploadCredential } from "../lib/staffUsersStore";

export const PRODUCT_IMAGES_BUCKET = "product-images";
const PRODUCT_IMAGE_UPLOAD_ENDPOINT = "/.netlify/functions/product-image-upload";

export function isProductImageStorageAvailable() {
  return true;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(String(reader.result || ""));
    };
    reader.onerror = () => {
      reject(reader.error || new Error("Unable to read product image file."));
    };

    reader.readAsDataURL(file);
  });
}

export async function uploadProductImageToStorage(file, options = {}) {
  if (!file) {
    throw new Error("Select an image to upload.");
  }

  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("Product images must be image files.");
  }

  const uploadCredential = getActiveStaffUploadCredential();
  if (!uploadCredential) {
    throw new Error("Staff PIN verification is required before product image upload.");
  }

  const fileData = await readFileAsDataUrl(file);
  const response = await fetch(PRODUCT_IMAGE_UPLOAD_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      staffUserId: uploadCredential.staffUserId,
      pin: uploadCredential.pin,
      productId: options.productId || options.product_id || "draft",
      fileName: file.name || "product-image",
      fileType: file.type || "",
      fileData,
    }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "Unable to upload product image.");
  }

  return {
    image: payload.image || "",
    image_storage_path: payload.image_storage_path || null,
    image_content_type: payload.image_content_type || file.type || "",
    image_file_size: Number(payload.image_file_size ?? file.size ?? 0) || 0,
    image_updated_at: payload.image_updated_at || new Date().toISOString(),
  };
}
