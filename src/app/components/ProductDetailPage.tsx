import { useMemo } from "react";
import { SecondaryView } from "./SecondaryView";
import { useLanguage } from "../hooks/useLanguage";
import { getThumbnailUrl } from "../utils/thumbnailUrl";

interface ProductDetailPageProps {
  onClose: () => void;
  product: {
    id: number;
    name: string;
    image: string;
    price: string;
    category: string;
    subCategory: string;
    description?: string;
    details?: string;
    specifications?: string;
    stock?: number;
  };
}

// 基础 HTML 消毒：移除 script/iframe/event handler，防止 XSS
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?\/?>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]*/gi, '')
    .replace(/javascript\s*:/gi, 'blocked:');
}

export function ProductDetailPage({ onClose, product }: ProductDetailPageProps) {
  const { t } = useLanguage();
  const m = t.market;

  const safeDetails = useMemo(
    () => product.details ? sanitizeHtml(product.details) : '',
    [product.details]
  );
  const safeSpecs = useMemo(
    () => product.specifications ? sanitizeHtml(product.specifications) : '',
    [product.specifications]
  );

  return (
    <SecondaryView 
      onClose={onClose} 
      title={m.productDetail || 'Product Details'}
      showTitle={true}
    >
      <div className="pb-6">
        {/* 商品图片 */}
        <img
          src={getThumbnailUrl(product.image, "productDetail")}
          alt={product.name}
          className="w-full aspect-square object-fill object-center"
        />
        
        {/* 商品信息区域 */}
        <div className="p-4">
          {/* 商品名称 */}
          <h2 className="text-lg font-bold text-gray-900 mb-2">{product.name}</h2>
          
          {/* 简短描述 */}
          {product.description && (
            <p className="text-sm text-gray-600 mb-3">{product.description}</p>
          )}
          
          {/* 价格和库存 */}
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
            <div>
              <p className="text-xs text-gray-500 mb-1">{m.price}</p>
              <p className="text-2xl font-bold text-emerald-600">{product.price}</p>
            </div>
            {product.stock !== undefined && (
              <div className="text-end">
                <p className="text-xs text-gray-500 mb-1">{m.stock || 'Stock'}</p>
                <p className="text-lg font-semibold text-gray-700">{product.stock}</p>
              </div>
            )}
          </div>
          
          {/* 产品详细说明 */}
          {product.details && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <span className="w-1 h-4 bg-emerald-600 rounded-full"></span>
                {m.details || 'Details'}
              </h3>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-sm text-gray-700 leading-relaxed rich-content" dangerouslySetInnerHTML={{ __html: safeDetails }} />
              </div>
            </div>
          )}
          
          {/* 产品规格 */}
          {product.specifications && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <span className="w-1 h-4 bg-emerald-600 rounded-full"></span>
                {m.specifications || 'Specifications'}
              </h3>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-sm text-gray-700 leading-relaxed rich-content" dangerouslySetInnerHTML={{ __html: safeSpecs }} />
              </div>
            </div>
          )}

        </div>
      </div>
    </SecondaryView>
  );
}

export default ProductDetailPage;