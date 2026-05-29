import { cn } from '@/lib/utils';

function Main({ children, className, ...props }: React.ComponentPropsWithoutRef<'main'>) {
  return (
    <main
      className={cn(
        'scrollbar-hide flex-[1_1_0] space-y-4 overflow-y-auto px-3 pt-2 pb-24',
        className,
      )}
      {...props}
    >
      {children}
    </main>
  );
}

export default Main;
