import { SecondaryView } from "./SecondaryView";
import { FileText } from "lucide-react";
import { useConfigContext } from "../hooks/ConfigProvider";
import { useLanguage } from "../hooks/useLanguage";
import { getThumbnailUrl } from "../utils/thumbnailUrl";
import type { BannerConfig } from "../hooks/useHomeConfig";

interface BannerDetailPageProps {
  onClose: () => void;
  bannerIndex: number;
  bannerData?: BannerConfig;
}

export function BannerDetailPage({ onClose, bannerIndex, bannerData }: BannerDetailPageProps) {
  const { config } = useConfigContext();
  const { t } = useLanguage();
  const latestBanner = bannerData?.id 
    ? config.banners.find(b => b.id === bannerData.id) || bannerData 
    : bannerData;

  const title = latestBanner?.title || `${t.market.viewDetails} ${bannerIndex + 1}`;

  return (
    <SecondaryView 
      onClose={onClose} 
      title={title}
      showTitle={true}
    >
      <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--app-bg)' }}>
        {/* 顶部大图 — 圆角矩形卡片 */}
        {latestBanner?.url && (
          <div className="px-4 pt-4">
            <div className="rounded-2xl overflow-hidden shadow">
              <img 
                src={getThumbnailUrl(latestBanner.url, "bannerDetail")} 
                alt={latestBanner.alt || title} 
                className="w-full aspect-[2/1] object-fill object-center"
              />
            </div>
          </div>
        )}

        {/* 内容区 */}
        <div className="px-4 py-4 space-y-3">
          {/* 标题卡片 */}
          <div className="bg-white rounded-2xl p-4 shadow">
            <h2 className="text-gray-800 text-lg">
              {title}
            </h2>
            {latestBanner?.alt && (
              <p className="text-gray-500 text-xs mt-1">{latestBanner.alt}</p>
            )}
          </div>

          {/* 详细内容 */}
          {latestBanner?.content && (
            <div className="bg-white rounded-2xl p-4 shadow">
              <div className="text-gray-700 text-sm rich-content" dangerouslySetInnerHTML={{ __html: latestBanner.content }} />
            </div>
          )}

          {/* 无内容提示 */}
          {!latestBanner?.content && (
            <div className="bg-white rounded-2xl p-6 shadow text-center">
              <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">{t.common.loading}</p>
            </div>
          )}
        </div>
      </div>
    </SecondaryView>
  );
}

export default BannerDetailPage;