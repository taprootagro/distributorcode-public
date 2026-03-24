// 通用骨架屏组件 - 快速显示框架
export function SkeletonScreen() {
  return (
    <div className="h-screen flex flex-col bg-white animate-pulse">
      {/* 顶部状态栏 */}
      <div className="bg-emerald-600 h-10 flex-shrink-0"></div>
      
      {/* 内容区域 */}
      <div className="flex-1 p-4 space-y-4">
        <div className="h-8 bg-gray-200 rounded"></div>
        <div className="h-32 bg-gray-200 rounded"></div>
        <div className="h-24 bg-gray-200 rounded"></div>
        <div className="h-24 bg-gray-200 rounded"></div>
      </div>
      
      {/* 底部导航栏 */}
      <div className="flex-shrink-0 bg-white safe-bottom" style={{ boxShadow: '0 -1px 12px rgba(0,0,0,0.06)' }}>
        <div className="flex justify-around items-center px-4" style={{ minHeight: '48px' }}>
          <div className="w-7 h-7 bg-gray-200 rounded-full"></div>
          <div className="w-7 h-7 bg-gray-200 rounded-full"></div>
          <div className="w-7 h-7 bg-gray-200 rounded-full"></div>
          <div className="w-7 h-7 bg-gray-200 rounded-full"></div>
        </div>
      </div>
    </div>
  );
}

// 首页骨架屏
export function HomePageSkeleton() {
  return (
    <div className="pb-20 animate-pulse">
      {/* 搜索栏 */}
      <div className="bg-emerald-600 p-3">
        <div className="h-10 bg-white rounded-full opacity-50"></div>
      </div>
      
      {/* 轮播图占位 */}
      <div className="px-3 pt-3">
        <div className="aspect-[2/1] bg-gray-200 rounded-2xl"></div>
      </div>
      
      {/* 功能卡片占位 */}
      <div className="px-3 pt-4 space-y-3">
        <div className="h-24 bg-gray-200 rounded-xl"></div>
        <div className="h-24 bg-gray-200 rounded-xl"></div>
        <div className="h-24 bg-gray-200 rounded-xl"></div>
      </div>
    </div>
  );
}

// 商城页骨架屏
export function MarketPageSkeleton() {
  return (
    <div className="pb-20 h-screen flex flex-col animate-pulse">
      {/* 搜索栏 */}
      <div className="bg-emerald-600 px-3 py-1.5 flex-shrink-0">
        <div className="h-10 bg-white rounded-full opacity-50"></div>
      </div>
      
      {/* 左侧分类 + 右侧商品 */}
      <div className="flex gap-0 flex-1">
        {/* 左侧分类栏 */}
        <div className="w-20 flex-shrink-0 bg-gray-50 space-y-2 p-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-gray-200 rounded"></div>
          ))}
        </div>
        
        {/* 右侧商品网格 */}
        <div className="flex-1 p-3">
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-square bg-gray-200 rounded-xl"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// 社区页骨架屏
export function CommunityPageSkeleton() {
  return (
    <div className="pb-20 animate-pulse">
      {/* 顶部栏 */}
      <div className="bg-emerald-600 p-3">
        <div className="h-10 bg-white rounded-full opacity-50"></div>
      </div>
      
      {/* 帖子列表 */}
      <div className="p-3 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                <div className="h-3 bg-gray-200 rounded w-1/4"></div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
            <div className="h-48 bg-gray-200 rounded-lg"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 个人中心骨架屏
export function ProfilePageSkeleton() {
  return (
    <div className="pb-20 animate-pulse">
      {/* 用户信息区 */}
      <div className="bg-gradient-to-b from-emerald-600 to-emerald-500 p-6">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 bg-white/30 rounded-full"></div>
          <div className="flex-1 space-y-2">
            <div className="h-6 bg-white/30 rounded w-1/2"></div>
            <div className="h-4 bg-white/30 rounded w-1/3"></div>
          </div>
        </div>
      </div>
      
      {/* 菜单项 */}
      <div className="mt-4 mx-3 space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 bg-gray-200 rounded-xl"></div>
        ))}
      </div>
    </div>
  );
}