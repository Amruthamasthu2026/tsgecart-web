export interface Inventory {
  stock: number;
  reserved: number;
}

export interface ProductVariant {
  id: string;
  sku: string;
  unitLabel: string;
  mrp: string;
  price: string;
  isDefault: boolean;
  isActive: boolean;
  inventory?: Inventory | null;
}

export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface BrandRef {
  id: string;
  name: string;
  slug: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  images: string[];
  gstRate: string;
  ratingAvg: string;
  ratingCount: number;
  isFeatured: boolean;
  isBestSeller: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  category?: CategoryRef;
  brand?: BrandRef | null;
  variants: ProductVariant[];
}

export interface ProductReview {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  createdAt: string;
  user: { name: string };
}

export interface ProductDetail extends Product {
  reviews: ProductReview[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  isActive: boolean;
  _count?: { products: number };
  children?: Category[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}
