import React from "react";

export default function Loading() {
  return (
    <section className="min-h-[60vh] flex items-center justify-center py-12 bg-white">
      <div className="w-full max-w-4xl px-4">
        <div className="mx-auto max-w-sm text-center">
          <div className="flex items-center justify-center">
            <div className="h-10 w-10 border-4 border-gray-200 border-t-rose-500 rounded-full animate-spin" />
          </div>
          <div className="mt-4 h-5 bg-gray-100 rounded w-40 mx-auto animate-pulse" />
          <div className="mt-3 h-3 bg-gray-100 rounded w-56 mx-auto animate-pulse" />
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="w-full aspect-[5/8] bg-gray-100 rounded-md" />
              <div className="mt-3 h-3 bg-gray-100 rounded w-3/4" />
              <div className="mt-2 h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
