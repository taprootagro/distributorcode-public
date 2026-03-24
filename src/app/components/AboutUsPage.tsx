import { SecondaryView } from "./SecondaryView";
import { useLanguage } from "../hooks/useLanguage";
import { useConfigContext } from "../hooks/ConfigProvider";

interface AboutUsPageProps {
  onClose: () => void;
}

export function AboutUsPage({ onClose }: AboutUsPageProps) {
  const { t } = useLanguage();
  const { config } = useConfigContext();

  return (
    <SecondaryView 
      onClose={onClose} 
      title={t.profile.aboutUs}
      showTitle={true}
    >
      <div className="p-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{config?.aboutUs?.content || t.common.noContent || "No content yet"}</div>
        </div>
      </div>
    </SecondaryView>
  );
}