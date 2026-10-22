import { useSupplierCardImage } from "../lib/useSupplierColorPhotos";

// Wraps a product card image: when the product has no image of its own, use its first colour photo.
export default function WithSupplierImage({ product, image, children }) {
  const fallback = useSupplierCardImage(product, Boolean(product) && !image?.src);
  const resolved = image?.src || !fallback ? image : { ...image, src: fallback };
  return children(resolved || {});
}
