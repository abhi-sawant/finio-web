import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

const Main = forwardRef<HTMLElement, React.ComponentPropsWithoutRef<'main'>>(function Main(
  { children, className, ...props },
  ref,
) {
  return (
    <main
      ref={ref}
      className={cn(
        'scrollbar-hide mx-auto w-full max-w-5xl flex-[1_1_0] space-y-4 overflow-y-auto px-3 pt-2 pb-24 lg:space-y-6 lg:px-8 lg:pb-8',
        className,
      )}
      {...props}
    >
      {children}
    </main>
  );
});

export default Main;
