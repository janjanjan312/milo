import { ReactNode } from 'react';

export default function MobileViewport({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-stone-200 sm:p-6 flex justify-center">
      <div
        id="mobile-viewport-root"
        className="relative w-full min-h-[100dvh] bg-stone-50 sm:max-w-[390px] sm:min-h-[calc(100dvh-3rem)] sm:max-h-[calc(100dvh-3rem)] sm:rounded-[2rem] sm:overflow-hidden sm:shadow-2xl sm:border sm:border-stone-300"
      >
        {children}
      </div>
    </div>
  );
}
