import React from 'react';

export const TailscaleLoadingSkeleton: React.FC = () => {
  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700/50 shadow-sm overflow-hidden animate-pulse">
      <div className="flex flex-col md:flex-row">
        
        {/* Left Side: Self Node Skeleton */}
        <div className="p-6 md:w-80 md:border-r border-gray-700/50 flex flex-col gap-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gray-700 rounded-md"></div>
            <div className="flex-1 space-y-2">
              <div className="h-5 bg-gray-700 rounded w-3/4"></div>
              <div className="h-4 bg-gray-700 rounded w-1/4"></div>
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <div className="h-3 bg-gray-700 rounded w-1/4 mb-2"></div>
              <div className="h-4 bg-gray-700 rounded w-full"></div>
            </div>
            <div>
              <div className="h-3 bg-gray-700 rounded w-1/4 mb-2"></div>
              <div className="h-4 bg-gray-700 rounded w-full"></div>
            </div>
          </div>
        </div>

        {/* Right Side: Peers Skeleton */}
        <div className="p-6 flex-1 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <div className="h-5 bg-gray-700 rounded w-32"></div>
            <div className="h-5 bg-gray-700 rounded w-16"></div>
          </div>

          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[64px] bg-gray-700/50 rounded flex items-center px-4 gap-3">
                <div className="w-3 h-3 rounded-full bg-gray-700"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-700 rounded w-1/3"></div>
                  <div className="h-3 bg-gray-700 rounded w-1/2"></div>
                </div>
                <div className="w-8 h-8 rounded bg-gray-700"></div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
