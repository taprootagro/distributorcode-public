import { SecondaryView } from "./SecondaryView";
import { useConfigContext } from "../hooks/ConfigProvider";
import { getThumbnailUrl } from "../utils/thumbnailUrl";
import type { ArticleConfig } from "../hooks/useHomeConfig";

interface ArticleDetailPageProps {
  onClose: () => void;
  article: {
    id: number;
    title: string;
    author: string;
    views: string;
    category: string;
    date: string;
    content?: string;
    thumbnail?: string;
  };
}

export function ArticleDetailPage({ onClose, article }: ArticleDetailPageProps) {
  // 从配置中读取最新的文章数据，确保编辑后能实时显示
  const { config } = useConfigContext();
  const latestArticle = config.articles.find(a => a.id === article.id) || article;

  return (
    <SecondaryView 
      onClose={onClose} 
      title=""
      showTitle={false}
    >
      <div className="p-4">
        {/* 缩略图 */}
        {latestArticle.thumbnail && (
          <div className="w-full h-48 rounded-xl overflow-hidden mb-4 bg-gray-100">
            <img 
              src={getThumbnailUrl(latestArticle.thumbnail, "articleDetail")} 
              alt={latestArticle.title}
              className="w-full h-full object-fill object-center"
            />
          </div>
        )}

        {/* 标题 */}
        <h2 className="text-lg text-gray-900 mb-4">{latestArticle.title}</h2>

        {/* 文章正文内容 */}
        {latestArticle.content ? (
          <div
            className="text-gray-800 text-sm leading-relaxed rich-content"
            dangerouslySetInnerHTML={{ __html: latestArticle.content }}
          />
        ) : (
          <div className="text-gray-400 text-sm text-center py-8">
            暂无文章内容
          </div>
        )}
      </div>
    </SecondaryView>
  );
}

export default ArticleDetailPage;